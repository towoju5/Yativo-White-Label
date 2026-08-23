import type { PrismaClient, LedgerTransaction } from "@prisma/client";
import { reverseTransactionInTx } from "./reverseTransaction.js";
import { postTransactionInTx } from "./postTransaction.js";
import type { EntryLine } from "./types.js";
import type { LedgerTransactionType, LedgerExternalSource } from "@prisma/client";

/**
 * Atomically releases a PENDING hold and posts the final settled
 * transaction in one DB transaction, so a webhook replay can never
 * double-settle: the reversal step and the final posting are each
 * independently idempotent (see reverseTransaction / postTransaction).
 */
export async function settlePendingTransaction(
  prisma: PrismaClient,
  pendingTransactionId: string,
  finalLines: EntryLine[],
  opts: { type: LedgerTransactionType; externalSource: LedgerExternalSource; externalRef?: string; description?: string },
): Promise<LedgerTransaction> {
  return prisma.$transaction(async (tx) => {
    await reverseTransactionInTx(tx, pendingTransactionId, "settled");

    return postTransactionInTx(tx, {
      type: opts.type,
      status: "POSTED",
      idempotencyKey: `settle:${pendingTransactionId}`,
      externalSource: opts.externalSource,
      externalRef: opts.externalRef,
      description: opts.description ?? `Settlement of ${pendingTransactionId}`,
      metadata: { settledPendingTransactionId: pendingTransactionId },
      lines: finalLines,
    });
  });
}
