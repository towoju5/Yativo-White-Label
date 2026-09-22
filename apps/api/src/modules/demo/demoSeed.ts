import crypto from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { hashPassword } from "../../lib/passwords.js";
import { ensurePlatformAccount, ensureCustomerWalletAccount } from "../ledger/accounts.js";
import { postTransaction } from "../ledger/postTransaction.js";
import { bootstrapPlatformData } from "../../lib/bootstrapPlatformData.js";

/**
 * Populates a freshly-provisioned, isolated demo database with synthetic data — a demo staff
 * user, a demo customer with a funded wallet and a few sample transactions/an API key. All fake:
 * no production data is ever copied into a demo database. Mirrors prisma/seed.ts's own approach
 * (upsert + ensure*Account + postTransaction) since that's this project's existing seeding
 * convention.
 */
export async function seedDemoDatabase(demoPrisma: PrismaClient): Promise<{ demoUserId: string; staffUserId: string }> {
  await bootstrapPlatformData(demoPrisma);

  const demoPassword = crypto.randomBytes(12).toString("base64url");

  const staff = await demoPrisma.staffUser.upsert({
    where: { email: "demo-admin@example.com" },
    update: {},
    create: { email: "demo-admin@example.com", passwordHash: await hashPassword(demoPassword), role: "OWNER" },
  });

  const settlement = await ensurePlatformAccount(demoPrisma, "YATIVO_SETTLEMENT", "USD");
  const feeRevenue = await ensurePlatformAccount(demoPrisma, "PLATFORM_FEE_REVENUE", "USD");

  const customer = await demoPrisma.customer.upsert({
    where: { email: "demo-customer@example.com" },
    update: {},
    create: {
      type: "INDIVIDUAL",
      fullName: "Demo Customer",
      email: "demo-customer@example.com",
      passwordHash: await hashPassword(demoPassword),
      kycStatus: "APPROVED",
    },
  });

  const wallet = await ensureCustomerWalletAccount(demoPrisma, customer.id, "USD");

  await postTransaction(demoPrisma, {
    type: "DEPOSIT",
    status: "POSTED",
    idempotencyKey: `demo-seed:deposit:${customer.id}`,
    externalSource: "MANUAL",
    description: "Demo seed deposit",
    lines: [
      { accountId: settlement.id, direction: "DEBIT", amountMinor: 500_000n, currencyCode: "USD" },
      { accountId: wallet.id, direction: "CREDIT", amountMinor: 500_000n, currencyCode: "USD" },
    ],
  });

  await postTransaction(demoPrisma, {
    type: "FEE",
    status: "POSTED",
    idempotencyKey: `demo-seed:fee:${customer.id}`,
    externalSource: "MANUAL",
    description: "Demo seed sample fee",
    lines: [
      { accountId: wallet.id, direction: "DEBIT", amountMinor: 1_000n, currencyCode: "USD" },
      { accountId: feeRevenue.id, direction: "CREDIT", amountMinor: 1_000n, currencyCode: "USD" },
    ],
  });

  return { demoUserId: customer.id, staffUserId: staff.id };
}
