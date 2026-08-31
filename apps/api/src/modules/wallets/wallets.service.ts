import type { PrismaClient, Account, AccountType } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { postTransaction } from "../ledger/postTransaction.js";
import { ensurePlatformAccount, ensureCustomerWalletAccount } from "../ledger/accounts.js";
import { getAvailableBalance, getPendingHold, getPostedBalance } from "../ledger/balances.js";
import { getPlatformSettings } from "../platformSettings/platformSettings.service.js";
import { NotFoundError, AppError } from "../../lib/errors.js";
import logger from "../../lib/logger.js";

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

/**
 * Brings a customer's wallets up to what signup provisions — the platform's default currency,
 * plus every other enabled currency under ALL_AUTOMATIC mode. No-ops if they already hold at
 * least one wallet, so this never re-adds a currency a customer deliberately removed themselves.
 */
export async function provisionDefaultWallets(prisma: PrismaClient, customerId: string): Promise<void> {
  const hasWallet = await prisma.wallet.findFirst({ where: { customerId } });
  if (hasWallet) return;

  const settings = await getPlatformSettings(prisma);
  await ensureCustomerWalletAccount(prisma, customerId, settings.defaultCurrencyCode);
  if (settings.walletCurrencyMode === "ALL_AUTOMATIC") {
    const enabledCurrencies = await prisma.currency.findMany({ where: { isEnabledForCustomers: true } });
    for (const currency of enabledCurrencies) {
      if (currency.code === settings.defaultCurrencyCode) continue;
      await ensureCustomerWalletAccount(prisma, customerId, currency.code);
    }
  }
}

/**
 * Self-healing checkpoint for a customer who reached a usable state with zero wallets — e.g. one
 * who signed up while platform_settings hadn't been bootstrapped yet, so signup's own wallet
 * provisioning never ran. Best-effort: never blocks login.
 */
export async function tryProvisionDefaultWallets(prisma: PrismaClient, customerId: string): Promise<void> {
  try {
    await provisionDefaultWallets(prisma, customerId);
  } catch (err) {
    logger.warn({ err, customerId }, "Could not auto-provision default wallet for customer");
  }
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
 * Full ledger statement for one account, newest-first, each line carrying the balance recorded
 * at the moment it was actually posted (see LedgerEntry.balanceAfterMinor / postTransactionInTx)
 * — not recomputed here. Recomputing by replaying history filtered on each transaction's
 * *current* status was the old approach, and it was wrong: a transaction's status can change
 * after the fact (settled, reversed), which retroactively corrupts every row between the
 * original event and that later change. Reading the frozen, point-in-time value avoids that
 * entirely.
 */
export async function getWalletStatement(
  prisma: PrismaClient,
  accountId: string,
  _accountType: AccountType,
  page: number,
  pageSize: number,
) {
  const total = await prisma.ledgerEntry.count({ where: { accountId } });

  const entries = await prisma.ledgerEntry.findMany({
    where: { accountId },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: { transaction: true },
  });

  const items = entries.map((entry) => ({
    entryId: entry.id,
    transactionId: entry.transactionId,
    transactionType: entry.transaction.type,
    status: entry.transaction.status,
    direction: entry.direction,
    amountMinor: entry.amountMinor.toString(),
    currencyCode: entry.currencyCode,
    description: entry.transaction.description,
    runningBalanceMinor: entry.balanceAfterMinor.toString(),
    createdAt: entry.createdAt.toISOString(),
  }));

  return { items, total, page, pageSize };
}

const MAX_STATEMENT_LINES = 5000;

/**
 * Statement of Account for one date range — same running-balance walk as getWalletStatement
 * (every entry from account genesis, in order, so the running balance — and each row's "balance
 * after" — is correct). Returns the opening balance (as of just before dateFrom) and only the
 * rows that fall inside [dateFrom, dateTo]. The closing balance is deliberately NOT "balance as
 * of dateTo" — it's the account's current posted balance at the moment the statement is
 * requested (the walk continues past dateTo through every entry that exists), matching what a
 * customer expects "closing balance" to mean on a statement they're pulling right now.
 */
export async function getWalletStatementForRange(prisma: PrismaClient, accountId: string, accountType: AccountType, dateFrom: Date, dateTo: Date) {
  const rangeCount = await prisma.ledgerEntry.count({ where: { accountId, createdAt: { gte: dateFrom, lte: dateTo } } });
  if (rangeCount > MAX_STATEMENT_LINES) {
    throw new AppError(`This range has ${rangeCount} transactions — narrow it to at most ${MAX_STATEMENT_LINES} to export.`, 400, "STATEMENT_TOO_LARGE");
  }

  const [priorEntry, entries, closingBalanceMinor] = await Promise.all([
    // The opening balance is simply whatever the balance already was right before this range
    // started — the last entry's frozen "after" value, not a replay.
    prisma.ledgerEntry.findFirst({ where: { accountId, createdAt: { lt: dateFrom } }, orderBy: { createdAt: "desc" } }),
    prisma.ledgerEntry.findMany({
      where: { accountId, createdAt: { gte: dateFrom, lte: dateTo } },
      orderBy: { createdAt: "asc" },
      include: { transaction: true },
    }),
    getPostedBalance(prisma, accountId, accountType),
  ]);

  const lines = entries.map((entry) => ({
    date: entry.createdAt.toISOString(),
    description: entry.transaction.description ?? entry.transaction.type,
    type: entry.transaction.type,
    status: entry.transaction.status,
    direction: entry.direction,
    amountMinor: entry.amountMinor.toString(),
    balanceAfterMinor: entry.balanceAfterMinor.toString(),
  }));

  return { openingBalanceMinor: (priorEntry?.balanceAfterMinor ?? 0n).toString(), closingBalanceMinor: closingBalanceMinor.toString(), lines };
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
