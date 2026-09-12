import type { PrismaClient, KycStatus, CustomerStatus, Customer } from "@prisma/client";
import { AppError, NotFoundError } from "../../lib/errors.js";
import { ensureYativoCustomer, tryEnsureYativoCustomer, isYativoCustomerNotFound } from "../../lib/ensureYativoCustomer.js";
import { yativoClient } from "../../lib/yativoClient.js";
import { listCustomerWallets } from "../wallets/wallets.service.js";
import { sendNotificationEmail } from "../notifications/notifications.service.js";
import logger from "../../lib/logger.js";
import { logAdminAction } from "../../lib/adminAuditLog.js";

/** Matches exactly what customerToDto reads — used as a `select` everywhere a full Customer row
 * (including passwordHash, twoFactorSecret, twoFactorBackupCodeHashes) isn't actually needed. */
export const CUSTOMER_DTO_SELECT = {
  id: true,
  type: true,
  fullName: true,
  businessName: true,
  email: true,
  emailVerifiedAt: true,
  kycStatus: true,
  status: true,
  yativoCustomerId: true,
  twoFactorEnabled: true,
  createdAt: true,
} as const;

export function customerToDto(customer: {
  id: string;
  type: "INDIVIDUAL" | "BUSINESS";
  fullName: string | null;
  businessName: string | null;
  email: string;
  emailVerifiedAt: Date | null;
  kycStatus: "NOT_STARTED" | "PENDING" | "APPROVED" | "REJECTED";
  status: "ACTIVE" | "FROZEN";
  yativoCustomerId: string | null;
  twoFactorEnabled: boolean;
  createdAt: Date;
}) {
  return {
    id: customer.id,
    type: customer.type,
    fullName: customer.fullName,
    businessName: customer.businessName,
    email: customer.email,
    emailVerifiedAt: customer.emailVerifiedAt?.toISOString() ?? null,
    kycStatus: customer.kycStatus,
    status: customer.status,
    yativoCustomerId: customer.yativoCustomerId,
    twoFactorEnabled: customer.twoFactorEnabled,
    createdAt: customer.createdAt.toISOString(),
  };
}

export async function listCustomers(
  prisma: PrismaClient,
  filters: { search?: string; kycStatus?: KycStatus; status?: CustomerStatus },
  page: number,
  pageSize: number,
) {
  const where = {
    ...(filters.kycStatus ? { kycStatus: filters.kycStatus } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.search
      ? {
          OR: [
            { email: { contains: filters.search, mode: "insensitive" as const } },
            { fullName: { contains: filters.search, mode: "insensitive" as const } },
            { businessName: { contains: filters.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [total, customers] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      select: CUSTOMER_DTO_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { items: customers.map(customerToDto), total, page, pageSize };
}

export async function getCustomerDetail(prisma: PrismaClient, customerId: string) {
  // The wallets query only needs customerId (already known), not the customer row — no need to
  // wait for the first query before starting the second.
  const [customer, wallets] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId }, select: CUSTOMER_DTO_SELECT }),
    listCustomerWallets(prisma, customerId),
  ]);
  if (!customer) throw new NotFoundError("Customer");
  return { ...customerToDto(customer), wallets };
}

/**
 * If Yativo no longer recognizes a stored yativoCustomerId (their record was purged, or it was
 * never fully provisioned on their side), re-provisions the customer and returns the fresh id.
 * Only called after the caller's own request against the stored id has already 404'd, so this
 * never masks any other kind of failure.
 */
async function resubmitAfterCustomerNotFound(prisma: PrismaClient, customer: Customer) {
  logger.warn({ customerId: customer.id, yativoCustomerId: customer.yativoCustomerId }, "Yativo customer not found — auto-resubmitting");
  return ensureYativoCustomer(prisma, customer, undefined, { force: true });
}

/** Live from Yativo — the endorsement checklist isn't cached locally, so this always reflects Yativo's current view (see fiat/customers.ts's `get()`). */
export async function getCustomerEndorsements(prisma: PrismaClient, customerId: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new NotFoundError("Customer");
  if (!customer.yativoCustomerId) {
    throw new AppError("This customer isn't registered on Yativo yet — no endorsement data is available.", 409, "NOT_REGISTERED");
  }
  try {
    const { endorsements } = await yativoClient.fiat.customers.get(customer.yativoCustomerId);
    return endorsements;
  } catch (err) {
    if (!isYativoCustomerNotFound(err)) throw err;
    const yativoCustomerId = await resubmitAfterCustomerNotFound(prisma, customer);
    const { endorsements } = await yativoClient.fiat.customers.get(yativoCustomerId);
    return endorsements;
  }
}

/** Generates a fresh hosted verification link for one endorsement — see fiat/customers.ts's regenerateEndorsementLink for why this can't just come from getCustomerEndorsements above. */
export async function regenerateCustomerEndorsementLink(prisma: PrismaClient, customerId: string, service: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new NotFoundError("Customer");
  if (!customer.yativoCustomerId) {
    throw new AppError("This customer isn't registered on Yativo yet — no endorsement data is available.", 409, "NOT_REGISTERED");
  }
  try {
    return await yativoClient.fiat.customers.regenerateEndorsementLink(customer.yativoCustomerId, service);
  } catch (err) {
    if (!isYativoCustomerNotFound(err)) throw err;
    const yativoCustomerId = await resubmitAfterCustomerNotFound(prisma, customer);
    return yativoClient.fiat.customers.regenerateEndorsementLink(yativoCustomerId, service);
  }
}

export async function approveKyc(prisma: PrismaClient, actorId: string, customerId: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new NotFoundError("Customer");
  const updated = await prisma.customer.update({ where: { id: customerId }, data: { kycStatus: "APPROVED" } });
  // A customer approved this way (manual override, not the real submission flow) may never have
  // been registered on Yativo — see tryEnsureYativoCustomer's doc comment. Best-effort: never
  // blocks the approval itself. Re-fetched afterward since it writes yativoCustomerId in place —
  // `updated` above would otherwise report a stale (pre-registration) snapshot to the caller.
  await tryEnsureYativoCustomer(prisma, updated);
  await sendNotificationEmail(prisma, "KYC_APPROVED", customerId, {});
  await logAdminAction(prisma, actorId, "customer.kyc.approved", customerId);
  return prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
}

export async function rejectKyc(prisma: PrismaClient, actorId: string, customerId: string, reason: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new NotFoundError("Customer");
  // The rejection reason isn't persisted to a dedicated column (none exists on Customer) — it's
  // accepted and validated so the API contract is stable for the frontend, and reaches the
  // customer via the KYC_REJECTED email below. It IS captured queryably via the audit log entry
  // below, so "who rejected this and why" has a real answer even without a dedicated column.
  const updated = await prisma.customer.update({ where: { id: customerId }, data: { kycStatus: "REJECTED" } });
  await sendNotificationEmail(prisma, "KYC_REJECTED", customerId, { reason });
  await logAdminAction(prisma, actorId, "customer.kyc.rejected", customerId, { reason });
  return updated;
}

/**
 * Manual counterpart to tryEnsureYativoCustomer for an admin who wants to explicitly retry —
 * e.g. after fixing a bad phone/country on the customer's record, or Yativo having been down
 * when the automatic checkpoints (signup, login, KYC approval) last ran. Unlike the "try" variant,
 * failures propagate as a real error so the admin sees exactly why it didn't work.
 */
export async function resubmitCustomerToYativo(prisma: PrismaClient, customerId: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new NotFoundError("Customer");
  // force: true — an admin hitting this explicitly wants a fresh attempt even when a
  // yativoCustomerId is already on file (e.g. it's stale/orphaned on Yativo's side).
  await ensureYativoCustomer(prisma, customer, undefined, { force: true });
  return prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
}

export async function freezeCustomer(prisma: PrismaClient, actorId: string, customerId: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new NotFoundError("Customer");
  const updated = await prisma.customer.update({ where: { id: customerId }, data: { status: "FROZEN" } });
  await logAdminAction(prisma, actorId, "customer.frozen", customerId);
  return updated;
}

export async function unfreezeCustomer(prisma: PrismaClient, actorId: string, customerId: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new NotFoundError("Customer");
  const updated = await prisma.customer.update({ where: { id: customerId }, data: { status: "ACTIVE" } });
  await logAdminAction(prisma, actorId, "customer.unfrozen", customerId);
  return updated;
}
