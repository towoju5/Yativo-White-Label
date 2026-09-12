import type { PrismaClient, LedgerTransaction } from "@prisma/client";
import { reverseTransactionInTx } from "./reverseTransaction.js";
import { postTransactionInTx } from "./postTransaction.js";
import type { EntryLine } from "./types.js";
import type { LedgerTransactionType, LedgerExternalSource } from "@prisma/client";
import { publishWalletUpdatesForAccounts } from "../../lib/realtime.js";
import { logAdminAction, SYSTEM_ACTOR_ID } from "../../lib/adminAuditLog.js";

/**
 * Atomically releases a PENDING hold and posts the final settled
 * transaction in one DB transaction, so a webhook replay can never
 * double-settle: the reversal step and the final posting are each
 * independently idempotent (see reverseTransaction / postTransaction).
 *
 * @param actorId Who triggered this — a staff user id for an admin-initiated manual confirm, or
 * the default SYSTEM_ACTOR_ID for everything else (webhook handlers, payouts.service.ts, etc.).
 * Centralized here rather than at each call site so no future caller can forget to attribute it.
 */
export async function settlePendingTransaction(
  prisma: PrismaClient,
  pendingTransactionId: string,
  finalLines: EntryLine[],
  opts: { type: LedgerTransactionType; externalSource: LedgerExternalSource; externalRef?: string; description?: string },
  actorId: string = SYSTEM_ACTOR_ID,
): Promise<LedgerTransaction> {
  const result = await prisma.$transaction(async (tx) => {
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

  const touchedAccountIds = [...new Set(finalLines.map((l) => l.accountId))];
  await publishWalletUpdatesForAccounts(prisma, touchedAccountIds);
  await logAdminAction(prisma, actorId, "transaction.settled", pendingTransactionId, opts.description ? { description: opts.description } : undefined);
  return result;
}
