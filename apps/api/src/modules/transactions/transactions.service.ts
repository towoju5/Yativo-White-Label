import type { Prisma, PrismaClient, LedgerTransactionType, LedgerTransactionStatus } from "@prisma/client";
import { NotFoundError, AppError } from "../../lib/errors.js";
import { settlePendingTransaction } from "../ledger/settlePendingTransaction.js";
import { reverseTransaction } from "../ledger/reverseTransaction.js";
import type { EntryLine } from "../ledger/types.js";

type TxWithEntries = Prisma.LedgerTransactionGetPayload<{
  include: { entries: { include: { account: { include: { customer: true } } } } };
}>;

function toListItem(tx: TxWithEntries) {
  const customerEntry = tx.entries.find((e) => e.account.customerId) ?? null;
  const primary = customerEntry ?? tx.entries[0] ?? null;
  const customer = customerEntry?.account.customer ?? null;

  return {
    id: tx.id,
    type: tx.type,
    status: tx.status,
    idempotencyKey: tx.idempotencyKey,
    externalSource: tx.externalSource,
    externalRef: tx.externalRef,
    description: tx.description,
    metadata: (tx.metadata as Record<string, unknown> | null) ?? null,
    reversalOfId: tx.reversalOfId,
    createdAt: tx.createdAt.toISOString(),
    postedAt: tx.postedAt?.toISOString() ?? null,
    reversedAt: tx.reversedAt?.toISOString() ?? null,
    customerId: customerEntry?.account.customerId ?? null,
    customerName: customer ? (customer.fullName ?? customer.businessName ?? null) : null,
    amountMinor: primary ? primary.amountMinor.toString() : null,
    currencyCode: primary ? primary.currencyCode : null,
    direction: primary ? primary.direction : null,
  };
}

function toCustomerListItem(tx: TxWithEntries, customerId: string) {
  const customerEntry = tx.entries.find((e) => e.account.customerId === customerId) ?? null;

  return {
    id: tx.id,
    type: tx.type,
    status: tx.status,
    idempotencyKey: tx.idempotencyKey,
    externalSource: tx.externalSource,
    externalRef: tx.externalRef,
    description: tx.description,
    metadata: (tx.metadata as Record<string, unknown> | null) ?? null,
    reversalOfId: tx.reversalOfId,
    createdAt: tx.createdAt.toISOString(),
    postedAt: tx.postedAt?.toISOString() ?? null,
    reversedAt: tx.reversedAt?.toISOString() ?? null,
    amountMinor: customerEntry ? customerEntry.amountMinor.toString() : null,
    currencyCode: customerEntry ? customerEntry.currencyCode : null,
    direction: customerEntry ? customerEntry.direction : null,
  };
}

/** Combined "Transaction history" — every transaction touching any of the customer's own accounts, across all wallets/currencies. Never exposes another customer's identity or a platform-side account. */
export async function listTransactionsForCustomer(
  prisma: PrismaClient,
  customerId: string,
  filters: { type?: LedgerTransactionType; status?: LedgerTransactionStatus; currencyCode?: string; dateFrom?: Date; dateTo?: Date },
  page: number,
  pageSize: number,
) {
  const where: Prisma.LedgerTransactionWhereInput = {
    entries: { some: { account: { customerId }, ...(filters.currencyCode ? { currencyCode: filters.currencyCode } : {}) } },
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.dateFrom || filters.dateTo
      ? { createdAt: { ...(filters.dateFrom ? { gte: filters.dateFrom } : {}), ...(filters.dateTo ? { lte: filters.dateTo } : {}) } }
      : {}),
  };

  const [total, transactions] = await Promise.all([
    prisma.ledgerTransaction.count({ where }),
    prisma.ledgerTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { entries: { include: { account: { include: { customer: true } } } } },
    }),
  ]);

  return { items: transactions.map((tx) => toCustomerListItem(tx, customerId)), total, page, pageSize };
}

export async function listLedgerTransactions(
  prisma: PrismaClient,
  filters: { type?: LedgerTransactionType; status?: LedgerTransactionStatus; customerId?: string; currencyCode?: string },
  page: number,
  pageSize: number,
) {
  const where: Prisma.LedgerTransactionWhereInput = {
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.currencyCode ? { entries: { some: { currencyCode: filters.currencyCode } } } : {}),
    ...(filters.customerId ? { entries: { some: { account: { customerId: filters.customerId } } } } : {}),
  };

  const [total, transactions] = await Promise.all([
    prisma.ledgerTransaction.count({ where }),
    prisma.ledgerTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { entries: { include: { account: { include: { customer: true } } } } },
    }),
  ]);

  return { items: transactions.map(toListItem), total, page, pageSize };
}

/**
 * Manually confirms a PENDING transaction as POSTED — for a hold that's stuck because a webhook
 * never arrived (or arrived and was missed) even though the underlying payout/deposit/etc. did
 * actually happen. Re-posts the transaction's own original entries verbatim (not invented new
 * ones), so this only ever confirms what was already on hold, never changes what it was for.
 * Safe against a real webhook settling the same transaction later or earlier: both
 * reverseTransactionInTx and postTransactionInTx (which settlePendingTransaction composes) are
 * independently idempotent per transaction id, so whichever runs second is a no-op.
 */
export async function adminSettleTransaction(prisma: PrismaClient, transactionId: string, reason: string) {
  const original = await prisma.ledgerTransaction.findUnique({ where: { id: transactionId }, include: { entries: true } });
  if (!original) throw new NotFoundError("LedgerTransaction");
  if (original.status !== "PENDING") {
    throw new AppError(`Only a pending transaction can be manually confirmed — this one is already ${original.status.toLowerCase()}.`, 409, "INVALID_STATUS_TRANSITION");
  }

  const lines: EntryLine[] = original.entries.map((e) => ({
    accountId: e.accountId,
    direction: e.direction,
    amountMinor: e.amountMinor,
    currencyCode: e.currencyCode,
  }));

  return settlePendingTransaction(prisma, transactionId, lines, {
    type: original.type,
    externalSource: "MANUAL",
    externalRef: original.externalRef ?? undefined,
    description: `Manually confirmed by admin: ${reason}`,
  });
}

/** Releases (if PENDING) or reverses (if POSTED) a transaction — see reverseTransaction.ts for the full semantics of each case. */
export async function adminReverseTransaction(prisma: PrismaClient, transactionId: string, reason: string) {
  const original = await prisma.ledgerTransaction.findUnique({ where: { id: transactionId } });
  if (!original) throw new NotFoundError("LedgerTransaction");
  if (original.status === "REVERSED") {
    throw new AppError("This transaction is already reversed.", 409, "INVALID_STATUS_TRANSITION");
  }
  return reverseTransaction(prisma, transactionId, reason);
}
