import type { PrismaClient } from "@prisma/client";
import type { PayoutCompletedPayload, PayoutFailedPayload } from "@white-label/yativo-sdk";
import { settlePayoutCompleted } from "../../modules/payouts/payouts.service.js";
import { reverseTransaction } from "../../modules/ledger/reverseTransaction.js";
import { sendNotificationEmail } from "../../modules/notifications/notifications.service.js";
import { formatMinorAmount } from "../../lib/formatMoney.js";
import type { WebhookHandlerResult } from "./result.js";

export async function handlePayoutCompleted(prisma: PrismaClient, payload: PayoutCompletedPayload): Promise<WebhookHandlerResult> {
  const payout = await prisma.payout.findFirst({ where: { yativoPayoutId: payload.yativoPayoutId } });
  if (!payout) {
    return { status: "FAILED", errorMessage: `No payout found for yativoPayoutId ${payload.yativoPayoutId}` };
  }

  await settlePayoutCompleted(prisma, payout, {
    externalSource: "YATIVO_WEBHOOK",
    feeMinor: payload.feeMinor !== undefined ? BigInt(payload.feeMinor) : undefined,
  });

  return { status: "PROCESSED" };
}

export async function handlePayoutFailed(prisma: PrismaClient, payload: PayoutFailedPayload): Promise<WebhookHandlerResult> {
  const payout = await prisma.payout.findFirst({ where: { yativoPayoutId: payload.yativoPayoutId } });
  if (!payout) {
    return { status: "FAILED", errorMessage: `No payout found for yativoPayoutId ${payload.yativoPayoutId}` };
  }

  await reverseTransaction(prisma, payout.transactionId, payload.reason);
  await sendNotificationEmail(prisma, "PAYOUT_FAILED", payout.customerId, {
    amount: await formatMinorAmount(prisma, payout.currencyCode, payout.amountMinor),
    currency: payout.currencyCode,
    reason: payload.reason,
  });
  return { status: "PROCESSED" };
}
