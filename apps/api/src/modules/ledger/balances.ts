import type { Prisma, PrismaClient } from "@prisma/client";
import { ACCOUNT_NORMAL_BALANCE } from "./types.js";

type Client = PrismaClient | Prisma.TransactionClient;

async function sumEntries(
  db: Client,
  accountId: string,
  opts: { statuses: ("PENDING" | "POSTED" | "REVERSED")[]; direction?: "DEBIT" | "CREDIT" },
): Promise<bigint> {
  const rows = await db.ledgerEntry.findMany({
    where: {
      accountId,
      direction: opts.direction,
      transaction: { status: { in: opts.statuses } },
    },
    select: { amountMinor: true },
  });
  return rows.reduce((sum, r) => sum + r.amountMinor, 0n);
}

/** Net balance from POSTED transactions only, signed by the account's normal-balance direction. */
export async function getPostedBalance(db: Client, accountId: string, accountType: keyof typeof ACCOUNT_NORMAL_BALANCE): Promise<bigint> {
  const normal = ACCOUNT_NORMAL_BALANCE[accountType];
  const opposite = normal === "DEBIT" ? "CREDIT" : "DEBIT";
  const increasing = await sumEntries(db, accountId, { statuses: ["POSTED"], direction: normal });
  const decreasing = await sumEntries(db, accountId, { statuses: ["POSTED"], direction: opposite });
  return increasing - decreasing;
}

/** Amount held against this account by transactions that are PENDING (not yet posted or reversed). */
export async function getPendingHold(db: Client, accountId: string, accountType: keyof typeof ACCOUNT_NORMAL_BALANCE): Promise<bigint> {
  const normal = ACCOUNT_NORMAL_BALANCE[accountType];
  const reducing = normal === "DEBIT" ? "CREDIT" : "DEBIT";
  return sumEntries(db, accountId, { statuses: ["PENDING"], direction: reducing });
}

export async function getAvailableBalance(db: Client, accountId: string, accountType: keyof typeof ACCOUNT_NORMAL_BALANCE): Promise<bigint> {
  const posted = await getPostedBalance(db, accountId, accountType);
  const pending = await getPendingHold(db, accountId, accountType);
  return posted - pending;
}

/**
 * Re-derives a Wallet's cached available/pending balances from the ledger
 * (the source of truth) and writes them back. No-op if the account isn't a
 * CUSTOMER_WALLET with a Wallet row. Called after every ledger posting that
 * touches the account, and by the reconciliation job to correct any drift.
 */
export async function refreshWalletCache(db: Client, accountId: string): Promise<void> {
  const account = await db.account.findUnique({ where: { id: accountId }, include: { wallet: true } });
  if (!account || account.type !== "CUSTOMER_WALLET" || !account.wallet) return;

  const available = await getAvailableBalance(db, accountId, account.type);
  const pending = await getPendingHold(db, accountId, account.type);

  await db.wallet.update({
    where: { id: account.wallet.id },
    data: { cachedAvailableMinor: available, cachedPendingMinor: pending, cacheUpdatedAt: new Date() },
  });
}
