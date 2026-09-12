import type { PrismaClient } from "@prisma/client";
import type { PayoutEventPayload } from "@white-label/yativo-sdk";
import { settlePayoutCompleted } from "../../modules/payouts/payouts.service.js";
import { reverseTransaction } from "../../modules/ledger/reverseTransaction.js";
import { sendNotificationEmail } from "../../modules/notifications/notifications.service.js";
import { sendOpsAlert } from "../../modules/notifications/channels/opsAlert.js";
import { formatMinorAmount } from "../../lib/formatMoney.js";
import type { WebhookHandlerResult } from "./result.js";

/**
 * `payout.updated` — the only payout event Yativo sends; there's no separate created/completed/
 * failed split, so status transitions all arrive on this one event type. The real payload carries
 * no fee figure (unlike what this app previously assumed), so settlement here charges only the
 * platform's own configured PAYOUT fee — see getEffectiveFee in payouts.service.ts.
 */
export async function handlePayoutEvent(prisma: PrismaClient, payload: PayoutEventPayload, externalEventId: string): Promise<WebhookHandlerResult> {
  const payout = await prisma.payout.findFirst({ where: { yativoPayoutId: payload.yativoPayoutId } });
  if (!payout) {
    return { status: "FAILED", errorMessage: `No payout found for yativoPayoutId ${payload.yativoPayoutId}` };
  }

  switch (payload.status) {
    case "completed":
      await settlePayoutCompleted(prisma, payout, { externalSource: "YATIVO_WEBHOOK" });
      return { status: "PROCESSED" };

    case "failed":
    case "cancelled":
    case "refunded": {
      // If this payout already completed (settlePayoutCompleted already ran), its original
      // PENDING hold is already REVERSED — reversing it again is a safe no-op, but not the real
      // economic effect to undo. That's the separate settlement transaction it posted, keyed
      // `settle:${transactionId}` (see settlePayoutCompleted) — reverse that one instead when a
      // "refunded" status arrives for an already-completed payout.
      const settlement = await prisma.ledgerTransaction.findUnique({ where: { idempotencyKey: `settle:${payout.transactionId}` } });
      const toReverse = settlement?.status === "POSTED" ? settlement.id : payout.transactionId;
      await reverseTransaction(prisma, toReverse, `Payout ${payload.status} (webhook ${externalEventId})`);
      const displayAmount = await formatMinorAmount(prisma, payout.currencyCode, payout.amountMinor);
      await sendNotificationEmail(prisma, "PAYOUT_FAILED", payout.customerId, {
        amount: displayAmount,
        currency: payout.currencyCode,
        reason: `Payout ${payload.status}`,
      });
      await sendOpsAlert(`⚠️ Payout ${payload.status}: ${displayAmount} ${payout.currencyCode} (payout ${payout.id}, customer ${payout.customerId})`);
      return { status: "PROCESSED" };
    }

    case "pending":
    case "processing":
      return { status: "IGNORED", errorMessage: `Payout status is ${payload.status} — no action needed yet` };
  }
}
