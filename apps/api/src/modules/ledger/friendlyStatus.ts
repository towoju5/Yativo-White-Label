import type { LedgerTransactionType, PrismaClient } from "@prisma/client";
import type { FriendlyTransactionStatus } from "@white-label/shared-types";

type TxLike = { id: string; status: "PENDING" | "POSTED" | "REVERSED"; postedAt: Date | null };

/**
 * Whether a transaction's hold has already been sent to an external system — the ingredient for
 * telling PROCESSING apart from plain PENDING in deriveFriendlyStatuses below. Only PAYOUT and
 * gateway DEPOSIT ever carry that distinction: a payout is "submitted" once Yativo has assigned it
 * a yativoPayoutId, and a gateway deposit's own row only ever gets created once Yativo has already
 * confirmed initiation (see webhooks/handlers/deposit.handler.ts) — so its mere existence implies
 * "submitted". Everything else (card funding, business-spend-card funding, swaps, adjustments, ...)
 * settles synchronously or posts directly, so there's no "sent but unconfirmed" window to show.
 */
export function isSubmittedToExternalSystem(tx: {
  type: LedgerTransactionType;
  payout?: { yativoPayoutId: string | null } | null;
  deposit?: unknown | null;
}): boolean {
  if (tx.type === "PAYOUT") return !!tx.payout?.yativoPayoutId;
  if (tx.type === "DEPOSIT") return !!tx.deposit;
  return false;
}

/**
 * Derives the customer/admin-facing status for a batch of transactions, in one extra query
 * regardless of batch size (rather than one settlement lookup per row) — see
 * FRIENDLY_TRANSACTION_STATUSES in shared-types for what each value means.
 *
 * The only ambiguous case is a REVERSED transaction whose own `postedAt` is null: that means this
 * row was released while still PENDING, which happens two different ways depending on the
 * transaction type —
 * - A hold-then-settle type (payout, card funding, gateway deposit — see settlePendingTransaction)
 *   ALWAYS reverses/releases its original hold as part of settling, success or not: the hold's own
 *   postedAt never gets set either way. So here the only way to tell "released because it failed"
 *   apart from "released because it succeeded and settled" is whether a separate
 *   `settle:<id>` transaction exists and what ITS status is.
 * - A direct-post type (swap, adjustment, fee, virtual-account deposit) never has a `settle:<id>`
 *   sibling at all, so a missing settlement there would wrongly read as FAILED — but those types
 *   also never leave postedAt null once posted, so they never reach this branch to begin with
 *   (their REVERSED rows have postedAt set from when they were first posted, and short-circuit to
 *   REVERSED above).
 *
 * `submittedIds`: PENDING transaction ids already known to have been sent to an external system
 * (a payout with a yativoPayoutId, a gateway deposit that only ever gets created once Yativo
 * confirms initiation, ...) — these show PROCESSING instead of PENDING.
 */
export async function deriveFriendlyStatuses(
  prisma: PrismaClient,
  transactions: TxLike[],
  submittedIds: ReadonlySet<string> = new Set(),
): Promise<Map<string, FriendlyTransactionStatus>> {
  const result = new Map<string, FriendlyTransactionStatus>();
  const needsSettlementLookup: string[] = [];

  for (const tx of transactions) {
    if (tx.status === "POSTED") {
      result.set(tx.id, "SUCCESS");
    } else if (tx.status === "PENDING") {
      result.set(tx.id, submittedIds.has(tx.id) ? "PROCESSING" : "PENDING");
    } else if (tx.postedAt) {
      result.set(tx.id, "REVERSED");
    } else {
      needsSettlementLookup.push(tx.id);
    }
  }

  if (needsSettlementLookup.length > 0) {
    const settlements = await prisma.ledgerTransaction.findMany({
      where: { idempotencyKey: { in: needsSettlementLookup.map((id) => `settle:${id}`) } },
      select: { idempotencyKey: true, status: true },
    });
    const settlementStatusByHoldId = new Map(settlements.map((s) => [s.idempotencyKey.replace(/^settle:/, ""), s.status]));
    for (const id of needsSettlementLookup) {
      const settlementStatus = settlementStatusByHoldId.get(id);
      result.set(id, !settlementStatus ? "FAILED" : settlementStatus === "POSTED" ? "SUCCESS" : "REVERSED");
    }
  }

  return result;
}

/** Single-transaction convenience wrapper around deriveFriendlyStatuses. */
export async function deriveFriendlyStatus(prisma: PrismaClient, transaction: TxLike, submitted: boolean): Promise<FriendlyTransactionStatus> {
  const map = await deriveFriendlyStatuses(prisma, [transaction], submitted ? new Set([transaction.id]) : undefined);
  return map.get(transaction.id)!;
}
