import type { Prisma, PrismaClient, LedgerTransaction } from "@prisma/client";
import { UnbalancedTransactionError, InsufficientFundsError } from "../../lib/errors.js";
import type { EntryLine, PostTransactionInput } from "./types.js";
import { ACCOUNT_NORMAL_BALANCE } from "./types.js";
import { refreshWalletCache, getAvailableBalance, getPostedBalance } from "./balances.js";

type Tx = Prisma.TransactionClient;

function assertBalanced(lines: EntryLine[]) {
  const byCurrency = new Map<string, { debit: bigint; credit: bigint }>();
  for (const line of lines) {
    const bucket = byCurrency.get(line.currencyCode) ?? { debit: 0n, credit: 0n };
    if (line.direction === "DEBIT") bucket.debit += line.amountMinor;
    else bucket.credit += line.amountMinor;
    byCurrency.set(line.currencyCode, bucket);
  }
  for (const [currencyCode, { debit, credit }] of byCurrency) {
    if (debit !== credit) throw new UnbalancedTransactionError(currencyCode);
  }
}

/**
 * Posts a balanced, idempotent set of journal lines atomically. Must be
 * called with a client already inside a `prisma.$transaction` so callers
 * (e.g. settlePendingTransaction) can compose multiple ledger writes into
 * one atomic unit.
 */
export async function postTransactionInTx(tx: Tx, input: PostTransactionInput): Promise<LedgerTransaction> {
  if (input.lines.length < 2) {
    throw new UnbalancedTransactionError("N/A");
  }
  assertBalanced(input.lines);

  const existing = await tx.ledgerTransaction.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return existing;

  // Lock every distinct account touched, in a deterministic (ascending id)
  // order, so two concurrent transactions that share accounts serialize
  // instead of deadlocking or racing on the balance check below.
  const accountIds = [...new Set(input.lines.map((l) => l.accountId))].sort();
  await tx.$queryRaw`SELECT id FROM accounts WHERE id = ANY(${accountIds}) ORDER BY id FOR UPDATE`;

  const transaction = await tx.ledgerTransaction.create({
    data: {
      type: input.type,
      status: input.status,
      idempotencyKey: input.idempotencyKey,
      externalSource: input.externalSource,
      externalRef: input.externalRef,
      description: input.description,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
      reversalOfId: input.reversalOfId,
      postedAt: input.status === "POSTED" ? new Date() : null,
    },
  });

  // Snapshot each touched account's current posted balance once, right after acquiring the
  // row locks above — this is the "before" balance for its first line in this posting. A
  // PENDING transaction never moves the posted balance, so before == after for its lines.
  const accounts = await tx.account.findMany({ where: { id: { in: accountIds } } });
  const accountTypeById = new Map(accounts.map((a) => [a.id, a.type]));
  const runningBalanceByAccount = new Map<string, bigint>(
    await Promise.all(accountIds.map(async (id) => [id, await getPostedBalance(tx, id, accountTypeById.get(id)!)] as const)),
  );

  await tx.ledgerEntry.createMany({
    data: input.lines.map((line) => {
      const before = runningBalanceByAccount.get(line.accountId)!;
      const normal = ACCOUNT_NORMAL_BALANCE[accountTypeById.get(line.accountId)!];
      const after = input.status === "POSTED" ? (line.direction === normal ? before + line.amountMinor : before - line.amountMinor) : before;
      runningBalanceByAccount.set(line.accountId, after);
      return {
        transactionId: transaction.id,
        accountId: line.accountId,
        direction: line.direction,
        amountMinor: line.amountMinor,
        currencyCode: line.currencyCode,
        balanceBeforeMinor: before,
        balanceAfterMinor: after,
      };
    }),
  });

  for (const accountId of accountIds) {
    await refreshWalletCache(tx, accountId);
  }

  // Still inside the same locked transaction as the inserts above, so this
  // sees the true post-lock state — see the doc comment on
  // `enforceNonNegativeOn` for why this can't be checked before the lock.
  for (const accountId of input.enforceNonNegativeOn ?? []) {
    const account = await tx.account.findUniqueOrThrow({ where: { id: accountId } });
    const available = await getAvailableBalance(tx, accountId, account.type);
    if (available < 0n) throw new InsufficientFundsError(accountId);
  }

  return transaction;
}

/** Convenience wrapper that opens its own transaction for a single posting. */
export async function postTransaction(prisma: PrismaClient, input: PostTransactionInput): Promise<LedgerTransaction> {
  return prisma.$transaction((tx) => postTransactionInTx(tx, input));
}
