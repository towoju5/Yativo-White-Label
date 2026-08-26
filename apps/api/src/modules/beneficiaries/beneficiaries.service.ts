import { randomUUID } from "node:crypto";
import type { Beneficiary, Prisma, PrismaClient } from "@prisma/client";
import type { CreateBeneficiaryInput, UpdateBeneficiaryInput } from "@white-label/shared-types";
import { AppError, NotFoundError } from "../../lib/errors.js";
import { requireKycApprovedForService } from "../../lib/requireKycApproved.js";
import { yativoClient } from "../../lib/yativoClient.js";
import { sendNotificationEmail } from "../notifications/notifications.service.js";
import logger from "../../lib/logger.js";

/**
 * `details` carries the fields Yativo's `/beneficiaries/payment-methods` form
 * requires — a numeric gateway id picked via listPayoutMethods() for the target
 * country/currency corridor, plus that gateway's payment_data (see getBeneficiaryForm()).
 */
function parseYativoDetails(details: Record<string, unknown>) {
  const gatewayId = Number(details.gatewayId);
  const currency = typeof details.currency === "string" ? details.currency : undefined;
  const paymentData = details.paymentData;
  if (!Number.isFinite(gatewayId) || !currency || typeof paymentData !== "object" || paymentData === null) {
    throw new AppError(
      "Beneficiary details must include gatewayId (number), currency (string), and paymentData (object) — see GET /portal/beneficiaries/form/:gatewayId for a payout method's required fields.",
      400,
      "INVALID_BENEFICIARY_DETAILS",
    );
  }
  return { gatewayId, currency, paymentData: paymentData as Record<string, unknown> };
}

export function beneficiaryToDto(b: {
  id: string;
  customerId: string;
  name: string;
  type: string;
  yativoBeneficiaryId: string | null;
  details: unknown;
  createdAt: Date;
}) {
  return {
    id: b.id,
    customerId: b.customerId,
    name: b.name,
    type: b.type,
    yativoBeneficiaryId: b.yativoBeneficiaryId,
    details: (b.details as Record<string, unknown>) ?? {},
    createdAt: b.createdAt.toISOString(),
  };
}

export async function listBeneficiaries(prisma: PrismaClient, customerId: string) {
  const beneficiaries = await prisma.beneficiary.findMany({
    where: { customerId, archivedAt: null },
    orderBy: { createdAt: "desc" },
  });
  return beneficiaries.map(beneficiaryToDto);
}

export async function createBeneficiary(prisma: PrismaClient, customerId: string, input: CreateBeneficiaryInput) {
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
  await requireKycApprovedForService(prisma, "BENEFICIARY", customer);

  const { gatewayId, currency, paymentData } = parseYativoDetails(input.details);

  // Generated up front so it can double as the Yativo idempotency key — a retry of this same
  // create call reuses it, letting Yativo dedupe instead of creating a second beneficiary.
  // (Yativo doesn't actually honor this header on this endpoint, hence the client-side
  // duplicate-submit guard on the "Add beneficiary" button in the UI as the real safeguard.)
  const beneficiaryId = randomUUID();
  const yativoResult = await yativoClient.fiat.beneficiaries.create({
    gatewayId,
    nickname: input.name,
    currency,
    paymentData,
    idempotencyKey: beneficiaryId,
  });

  const details = { ...input.details, gatewayId, currency, paymentData };

  const beneficiary = await prisma.beneficiary.create({
    data: {
      id: beneficiaryId,
      customerId,
      name: input.name,
      type: input.type,
      yativoBeneficiaryId: yativoResult.yativoBeneficiaryId,
      details: details as Prisma.InputJsonValue,
    },
  });

  logger.info({ customerId, beneficiaryId, yativoBeneficiaryId: yativoResult.yativoBeneficiaryId }, "Created beneficiary");
  await sendNotificationEmail(prisma, "BENEFICIARY_ADDED", customerId, { beneficiaryName: input.name });
  return beneficiaryToDto(beneficiary);
}

/** `scopeCustomerId` set (portal) → only that customer's own beneficiary. Unset (admin) → any customer's, for support/read access. */
export async function getBeneficiary(prisma: PrismaClient, beneficiaryId: string, scopeCustomerId?: string) {
  const beneficiary = await prisma.beneficiary.findFirst({
    where: { id: beneficiaryId, archivedAt: null, ...(scopeCustomerId ? { customerId: scopeCustomerId } : {}) },
  });
  if (!beneficiary) throw new NotFoundError("Beneficiary");
  return beneficiaryToDto(beneficiary);
}

/** Nickname only — see updateBeneficiarySchema's doc comment for why payout details aren't editable. */
export async function updateBeneficiary(prisma: PrismaClient, customerId: string, beneficiaryId: string, input: UpdateBeneficiaryInput) {
  const existing = await prisma.beneficiary.findFirst({ where: { id: beneficiaryId, customerId, archivedAt: null } });
  if (!existing) throw new NotFoundError("Beneficiary");
  const updated = await prisma.beneficiary.update({ where: { id: beneficiaryId }, data: { name: input.name } });
  return beneficiaryToDto(updated);
}

export async function archiveBeneficiary(prisma: PrismaClient, customerId: string, beneficiaryId: string) {
  const beneficiary = await prisma.beneficiary.findFirst({ where: { id: beneficiaryId, customerId } });
  if (!beneficiary) throw new NotFoundError("Beneficiary");
  if (beneficiary.yativoBeneficiaryId) await yativoClient.fiat.beneficiaries.remove(beneficiary.yativoBeneficiaryId);
  await prisma.beneficiary.update({ where: { id: beneficiaryId }, data: { archivedAt: new Date() } });
}

/** Countries with at least one payout rail — step 1 of the "add beneficiary" flow. */
export async function listPayoutCountries() {
  return yativoClient.fiat.paymentMethods.listPayoutCountries();
}

/** Active payout rails for a country/currency corridor — step 2. `gatewayId` feeds getBeneficiaryForm and beneficiary creation. */
export async function listPayoutMethods(country?: string, currency?: string) {
  return yativoClient.fiat.paymentMethods.listActivePayoutMethods({ country, currency });
}

/** Field schema for a chosen payout method — step 3, drives the dynamic payment_data form. */
export async function getBeneficiaryForm(gatewayId: number) {
  return yativoClient.fiat.beneficiaries.getForm(gatewayId);
}

/**
 * Pulls the payout gateway id/currency back out of a stored beneficiary's `details` JSON —
 * needed by both the quote step (method_id + to_currency) and the payout submission. Throws if
 * this beneficiary predates details capturing this shape (e.g. was never actually linked to a
 * real Yativo gateway).
 */
export function getBeneficiaryGatewayInfo(beneficiary: Pick<Beneficiary, "details">) {
  const details = (beneficiary.details as Record<string, unknown>) ?? {};
  const gatewayId = Number(details.gatewayId);
  const currency = typeof details.currency === "string" ? details.currency : undefined;
  if (!Number.isFinite(gatewayId) || !currency) {
    throw new AppError("This beneficiary is missing its payout gateway details — remove it and add it again.", 409, "BENEFICIARY_NOT_LINKED");
  }
  return { gatewayId, currency };
}
