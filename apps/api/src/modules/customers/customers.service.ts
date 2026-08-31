import type { PrismaClient, KycStatus, CustomerStatus } from "@prisma/client";
import { AppError, NotFoundError } from "../../lib/errors.js";
import { ensureYativoCustomer, tryEnsureYativoCustomer } from "../../lib/ensureYativoCustomer.js";
import { yativoClient } from "../../lib/yativoClient.js";
import { listCustomerWallets } from "../wallets/wallets.service.js";
import { sendNotificationEmail } from "../notifications/notifications.service.js";

export function customerToDto(customer: {
  id: string;
  type: "INDIVIDUAL" | "BUSINESS";
  fullName: string | null;
  businessName: string | null;
  email: string;
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
    prisma.customer.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);

  return { items: customers.map(customerToDto), total, page, pageSize };
}

export async function getCustomerDetail(prisma: PrismaClient, customerId: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new NotFoundError("Customer");
  const wallets = await listCustomerWallets(prisma, customerId);
  return { ...customerToDto(customer), wallets };
}

/** Live from Yativo — the endorsement checklist isn't cached locally, so this always reflects Yativo's current view (see fiat/customers.ts's `get()`). */
export async function getCustomerEndorsements(prisma: PrismaClient, customerId: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new NotFoundError("Customer");
  if (!customer.yativoCustomerId) {
    throw new AppError("This customer isn't registered on Yativo yet — no endorsement data is available.", 409, "NOT_REGISTERED");
  }
  const { endorsements } = await yativoClient.fiat.customers.get(customer.yativoCustomerId);
  return endorsements;
}

/** Generates a fresh hosted verification link for one endorsement — see fiat/customers.ts's regenerateEndorsementLink for why this can't just come from getCustomerEndorsements above. */
export async function regenerateCustomerEndorsementLink(prisma: PrismaClient, customerId: string, service: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new NotFoundError("Customer");
  if (!customer.yativoCustomerId) {
    throw new AppError("This customer isn't registered on Yativo yet — no endorsement data is available.", 409, "NOT_REGISTERED");
  }
  return yativoClient.fiat.customers.regenerateEndorsementLink(customer.yativoCustomerId, service);
}

export async function approveKyc(prisma: PrismaClient, customerId: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new NotFoundError("Customer");
  const updated = await prisma.customer.update({ where: { id: customerId }, data: { kycStatus: "APPROVED" } });
  // A customer approved this way (manual override, not the real submission flow) may never have
  // been registered on Yativo — see tryEnsureYativoCustomer's doc comment. Best-effort: never
  // blocks the approval itself. Re-fetched afterward since it writes yativoCustomerId in place —
  // `updated` above would otherwise report a stale (pre-registration) snapshot to the caller.
  await tryEnsureYativoCustomer(prisma, updated);
  await sendNotificationEmail(prisma, "KYC_APPROVED", customerId, {});
  return prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
}

export async function rejectKyc(prisma: PrismaClient, customerId: string, reason: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new NotFoundError("Customer");
  // Scaffold: the rejection reason isn't persisted to a dedicated column (none exists on
  // Customer) — it's accepted and validated so the API contract is stable for the frontend,
  // and would be wired to an audit/notes table in a real deployment. It does reach the customer
  // via the KYC_REJECTED email below even though it isn't stored anywhere queryable afterward.
  const updated = await prisma.customer.update({ where: { id: customerId }, data: { kycStatus: "REJECTED" } });
  await sendNotificationEmail(prisma, "KYC_REJECTED", customerId, { reason });
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
  await ensureYativoCustomer(prisma, customer);
  return prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
}

export async function freezeCustomer(prisma: PrismaClient, customerId: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new NotFoundError("Customer");
  return prisma.customer.update({ where: { id: customerId }, data: { status: "FROZEN" } });
}

export async function unfreezeCustomer(prisma: PrismaClient, customerId: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new NotFoundError("Customer");
  return prisma.customer.update({ where: { id: customerId }, data: { status: "ACTIVE" } });
}
