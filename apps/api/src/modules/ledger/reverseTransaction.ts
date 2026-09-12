import type { Prisma, PrismaClient, LedgerTransaction } from "@prisma/client";
import { NotFoundError } from "../../lib/errors.js";
import { postTransactionInTx } from "./postTransaction.js";
import { refreshWalletCache } from "./balances.js";
import { publishWalletUpdatesForAccounts } from "../../lib/realtime.js";
import { logAdminAction, SYSTEM_ACTOR_ID } from "../../lib/adminAuditLog.js";

type Tx = Prisma.TransactionClient;

/**
 * Releases or reverses a transaction, idempotently. Behavior depends on the
 * original's status:
 *
 * - PENDING → just flips status to REVERSED. A PENDING transaction was never
 *   posted (it only ever contributed to the "pending hold" total via
 *   getPendingHold, never to getPostedBalance), so there is no posted
 *   economic effect to undo — posting a mirrored offsetting entry here would
 *   phantom-credit the account for money that was never actually posted.
 *   This is the path used to release a hold (a failed payout, or the first
 *   half of settlePendingTransaction).
 * - POSTED → creates a new POSTED transaction with debit/credit swapped
 *   (a real reversal of a real posted effect) and links it via reversalOfId.
 *
 * Idempotent: reversing/releasing the same transaction twice is a no-op on
 * the second call.
 */
export async function reverseTransactionInTx(tx: Tx, transactionId: string, reason: string): Promise<LedgerTransaction> {
  const original = await tx.ledgerTransaction.findUnique({
    where: { id: transactionId },
    include: { entries: true, reversedBy: true },
  });
  if (!original) throw new NotFoundError("LedgerTransaction");

  if (original.status === "REVERSED") {
    return original.reversedBy ?? original;
  }

  if (original.status === "PENDING") {
    const released = await tx.ledgerTransaction.update({
      where: { id: transactionId },
      data: { status: "REVERSED", reversedAt: new Date() },
    });
    const accountIds = [...new Set(original.entries.map((e) => e.accountId))];
    for (const accountId of accountIds) {
      await refreshWalletCache(tx, accountId);
    }
    return released;
  }

  const reversal = await postTransactionInTx(tx, {
    type: original.type,
    status: "POSTED",
    idempotencyKey: `reversal:${transactionId}`,
    externalSource: "SYSTEM",
    externalRef: original.externalRef ?? undefined,
    description: `Reversal of ${transactionId}: ${reason}`,
    metadata: { reversalReason: reason, reversedTransactionId: transactionId },
    reversalOfId: transactionId,
    lines: original.entries.map((e) => ({
      accountId: e.accountId,
      direction: e.direction === "DEBIT" ? "CREDIT" : "DEBIT",
      amountMinor: e.amountMinor,
      currencyCode: e.currencyCode,
    })),
  });

  await tx.ledgerTransaction.update({
    where: { id: transactionId },
    data: { status: "REVERSED", reversedAt: new Date() },
  });

  return reversal;
}

/**
 * @param actorId Who triggered this — a staff user id for an admin-initiated reversal, or the
 * default SYSTEM_ACTOR_ID for everything else (webhook handlers, the payout-poll worker,
 * failure-cleanup paths). Centralized here rather than at each of this function's many call
 * sites, so no future caller can forget to attribute the action.
 */
export async function reverseTransaction(prisma: PrismaClient, transactionId: string, reason: string, actorId: string = SYSTEM_ACTOR_ID): Promise<LedgerTransaction> {
  const before = await prisma.ledgerTransaction.findUnique({ where: { id: transactionId }, select: { status: true } });
  const result = await prisma.$transaction((tx) => reverseTransactionInTx(tx, transactionId, reason));
  // The original entries' account set is the same one affected either way (a PENDING release or
  // a POSTED reversal) — queried fresh (post-commit) rather than threading it out of the tx above.
  const entries = await prisma.ledgerEntry.findMany({ where: { transactionId }, select: { accountId: true } });
  await publishWalletUpdatesForAccounts(prisma, entries.map((e) => e.accountId));
  // A no-op replay against an already-reversed transaction has no real effect to attribute.
  if (before && before.status !== "REVERSED") {
    const action = before.status === "PENDING" ? "transaction.released" : "transaction.reversed";
    await logAdminAction(prisma, actorId, action, transactionId, { reason });
  }
  return result;
}
