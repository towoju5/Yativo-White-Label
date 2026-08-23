import type { PrismaClient, Account, AccountType } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { ACCOUNT_NORMAL_BALANCE } from "../ledger/types.js";
import { postTransaction } from "../ledger/postTransaction.js";
import { ensurePlatformAccount, ensureCustomerWalletAccount } from "../ledger/accounts.js";
import { getAvailableBalance, getPendingHold } from "../ledger/balances.js";
import { getPlatformSettings } from "../platformSettings/platformSettings.service.js";
import { NotFoundError, AppError } from "../../lib/errors.js";

export function walletToDto(wallet: {
  id: string;
  customerId: string;
  currencyCode: string;
  cachedAvailableMinor: bigint;
  cachedPendingMinor: bigint;
  cacheUpdatedAt: Date;
  currency: { decimals: number; symbol: string | null };
}) {
  return {
    walletId: wallet.id,
    customerId: wallet.customerId,
    currencyCode: wallet.currencyCode,
    decimals: wallet.currency.decimals,
    symbol: wallet.currency.symbol,
    availableMinor: wallet.cachedAvailableMinor.toString(),
    pendingMinor: wallet.cachedPendingMinor.toString(),
    updatedAt: wallet.cacheUpdatedAt.toISOString(),
  };
}

export async function listCustomerWallets(prisma: PrismaClient, customerId: string) {
  const wallets = await prisma.wallet.findMany({
    where: { customerId },
    include: { currency: true },
    orderBy: { currencyCode: "asc" },
  });
  return wallets.map(walletToDto);
}

/**
 * Full ledger statement for one account, newest-first, each line carrying a
 * running balance. Walks every entry for the account in chronological order
 * to compute the running balance, then paginates from the end (newest
 * first) — simplest-correct approach per the plan, not the most optimized.
 */
export async function getWalletStatement(
  prisma: PrismaClient,
  accountId: string,
  accountType: AccountType,
  page: number,
  pageSize: number,
) {
  const total = await prisma.ledgerEntry.count({ where: { accountId } });

  const ascending = await prisma.ledgerEntry.findMany({
    where: { accountId },
    orderBy: { createdAt: "asc" },
    include: { transaction: true },
  });

  const normal = ACCOUNT_NORMAL_BALANCE[accountType];
  let running = 0n;
  const withRunning = ascending.map((entry) => {
    // Only a POSTED transaction's entries actually move the posted balance —
    // matching getPostedBalance's semantics exactly. A PENDING transaction's
    // entry only ever contributed to the "pending hold" total (never the
    // posted balance), and a REVERSED transaction's entry, by definition,
    // never had (or no longer has) a posted effect either way — so neither
    // should advance the running total here. Their rows still appear in the
    // statement (for visibility, with their own status badge) but the
    // running balance simply carries over unchanged.
    if (entry.transaction.status === "POSTED") {
      running += entry.direction === normal ? entry.amountMinor : -entry.amountMinor;
    }
    return {
      entryId: entry.id,
      transactionId: entry.transactionId,
      transactionType: entry.transaction.type,
      status: entry.transaction.status,
      direction: entry.direction,
      amountMinor: entry.amountMinor.toString(),
      currencyCode: entry.currencyCode,
      description: entry.transaction.description,
      runningBalanceMinor: running.toString(),
      createdAt: entry.createdAt.toISOString(),
    };
  });

  const descending = withRunning.reverse();
  const start = (page - 1) * pageSize;
  const items = descending.slice(start, start + pageSize);

  return { items, total, page, pageSize };
}

/**
 * Full detail for one transaction — the "view details / print receipt" screen. Scoped to
 * transactions that touch at least one of the customer's own accounts (any DEPOSIT, PAYOUT, FEE,
 * etc. genuinely theirs); entries on the OTHER side (a platform account like SUSPENSE_PENDING or
 * YATIVO_SETTLEMENT) are filtered out of the response — customers never see the platform's own
 * chart of accounts, only their side of the transaction.
 */
export async function getTransactionDetailForCustomer(prisma: PrismaClient, customerId: string, transactionId: string) {
  const tx = await prisma.ledgerTransaction.findFirst({
    where: { id: transactionId, entries: { some: { account: { customerId } } } },
    include: {
      entries: { include: { account: true } },
      payout: { include: { beneficiary: true } },
    },
  });
  if (!tx) throw new NotFoundError("Transaction");

  return {
    id: tx.id,
    type: tx.type,
    status: tx.status,
    description: tx.description,
    externalRef: tx.externalRef,
    externalSource: tx.externalSource,
    createdAt: tx.createdAt.toISOString(),
    postedAt: tx.postedAt?.toISOString() ?? null,
    reversedAt: tx.reversedAt?.toISOString() ?? null,
    entries: tx.entries
      .filter((e) => e.account.customerId === customerId)
      .map((e) => ({ accountType: e.account.type, direction: e.direction, amountMinor: e.amountMinor.toString(), currencyCode: e.currencyCode })),
    payout: tx.payout
      ? {
          id: tx.payout.id,
          beneficiaryName: tx.payout.beneficiary.name,
          beneficiaryDetails: tx.payout.beneficiary.details as Record<string, unknown>,
          yativoPayoutId: tx.payout.yativoPayoutId,
          amountMinor: tx.payout.amountMinor.toString(),
          currencyCode: tx.payout.currencyCode,
        }
      : null,
  };
}

export async function getWalletForCustomer(prisma: PrismaClient, customerId: string, walletId: string) {
  const wallet = await prisma.wallet.findFirst({
    where: { id: walletId, customerId },
    include: { account: true },
  });
  if (!wallet) throw new NotFoundError("Wallet");
  return wallet;
}

/**
 * Posts a POSTED ADJUSTMENT transaction moving funds between a customer's
 * wallet and the PLATFORM_RESERVE counter-account. Idempotency key is a
 * fresh uuid every call — this is an explicit one-off staff action, not a
 * replay-prone webhook.
 */
export async function adjustWallet(
  prisma: PrismaClient,
  wallet: { id: string; accountId: string; currencyCode: string },
  direction: "CREDIT" | "DEBIT",
  amountMinor: bigint,
  reason: string,
) {
  const reserve = await ensurePlatformAccount(prisma, "PLATFORM_RESERVE", wallet.currencyCode);

  const walletLine = { accountId: wallet.accountId, direction, amountMinor, currencyCode: wallet.currencyCode };
  const reserveLine = {
    accountId: reserve.id,
    direction: direction === "CREDIT" ? ("DEBIT" as const) : ("CREDIT" as const),
    amountMinor,
    currencyCode: wallet.currencyCode,
  };

  return postTransaction(prisma, {
    type: "ADJUSTMENT",
    status: "POSTED",
    idempotencyKey: `adjustment:${randomUUID()}`,
    externalSource: "MANUAL",
    description: reason,
    metadata: { reason },
    lines: [walletLine, reserveLine],
  });
}

/** Drives the portal's "add a currency" UI — only ever offers currencies under SELF_SERVICE mode; DEFAULT_ONLY and ALL_AUTOMATIC both mean there's nothing left for the customer to add themselves. */
export async function getPortalWalletCurrencyOptions(prisma: PrismaClient, customerId: string) {
  const settings = await getPlatformSettings(prisma);
  if (settings.walletCurrencyMode !== "SELF_SERVICE") {
    return { mode: settings.walletCurrencyMode, addable: [] };
  }

  const [enabledCurrencies, existingWallets] = await Promise.all([
    prisma.currency.findMany({ where: { isEnabledForCustomers: true }, orderBy: { code: "asc" } }),
    prisma.wallet.findMany({ where: { customerId }, select: { currencyCode: true } }),
  ]);
  const held = new Set(existingWallets.map((w) => w.currencyCode));
  const addable = enabledCurrencies
    .filter((c) => !held.has(c.code))
    .map((c) => ({ code: c.code, name: c.name, symbol: c.symbol, decimals: c.decimals }));
  return { mode: settings.walletCurrencyMode, addable };
}

export async function addCustomerWalletCurrency(prisma: PrismaClient, customerId: string, currencyCode: string) {
  const settings = await getPlatformSettings(prisma);
  if (settings.walletCurrencyMode !== "SELF_SERVICE") {
    throw new AppError("Adding wallet currencies isn't available.", 409, "SELF_SERVICE_DISABLED");
  }
  const currency = await prisma.currency.findUnique({ where: { code: currencyCode } });
  if (!currency || !currency.isEnabledForCustomers) throw new NotFoundError("Currency");

  await ensureCustomerWalletAccount(prisma, customerId, currencyCode);
  const wallet = await prisma.wallet.findUniqueOrThrow({
    where: { customerId_currencyCode: { customerId, currencyCode } },
    include: { currency: true },
  });
  return walletToDto(wallet);
}

export type WalletAccountRow = Account;

/**
 * Removes an empty wallet. Only the Wallet row is deleted — the underlying Account (and its
 * ledger entries, if any ever existed) is kept, since ledger history must never be orphaned or
 * rewritten. If the customer adds this currency back later, ensureCustomerWalletAccount repairs
 * a fresh Wallet row pointing at the same Account rather than treating it as brand new.
 * Balance is re-checked against the ledger itself (not the cached Wallet fields) so a stale cache
 * can't let a non-empty wallet through.
 */
export async function deleteCustomerWallet(prisma: PrismaClient, customerId: string, walletId: string): Promise<void> {
  const wallet = await prisma.wallet.findFirst({ where: { id: walletId, customerId } });
  if (!wallet) throw new NotFoundError("Wallet");

  // Under DEFAULT_ONLY (and effectively ALL_AUTOMATIC) mode there's no self-service way to add a
  // wallet back — leaving a customer with zero wallets would block deposits/payouts entirely with
  // no recovery path in their own hands. Always keep at least one.
  const walletCount = await prisma.wallet.count({ where: { customerId } });
  if (walletCount <= 1) {
    throw new AppError("You need at least one wallet — this is your only one.", 409, "LAST_WALLET");
  }

  const [available, pending] = await Promise.all([
    getAvailableBalance(prisma, wallet.accountId, "CUSTOMER_WALLET"),
    getPendingHold(prisma, wallet.accountId, "CUSTOMER_WALLET"),
  ]);
  if (available !== 0n || pending !== 0n) {
    throw new AppError("This wallet still has a balance — it must be empty before you can remove it.", 409, "WALLET_NOT_EMPTY");
  }

  await prisma.wallet.delete({ where: { id: wallet.id } });
}
