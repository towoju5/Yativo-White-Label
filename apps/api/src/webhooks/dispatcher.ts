import type { PrismaClient } from "@prisma/client";
import {
  depositConfirmedPayloadSchema,
  payoutCompletedPayloadSchema,
  payoutFailedPayloadSchema,
  cardTransactionCompletedPayloadSchema,
  swapCompletedPayloadSchema,
} from "@white-label/yativo-sdk";
import { handleDepositConfirmed } from "./handlers/deposit.handler.js";
import { handlePayoutCompleted, handlePayoutFailed } from "./handlers/payout.handler.js";
import { handleCardTransactionCompleted } from "./handlers/card.handler.js";
import { handleSwapCompleted } from "./handlers/swap.handler.js";
import type { WebhookHandlerResult } from "./handlers/result.js";

/** Dispatches a persisted WebhookEvent to the handler for its eventType. Unrecognized event types are IGNORED, not FAILED. */
export async function dispatchWebhookEvent(
  prisma: PrismaClient,
  eventType: string,
  payload: Record<string, unknown>,
  externalEventId: string,
): Promise<WebhookHandlerResult> {
  switch (eventType) {
    case "deposit.confirmed":
      return handleDepositConfirmed(prisma, depositConfirmedPayloadSchema.parse(payload), externalEventId);
    case "payout.completed":
      return handlePayoutCompleted(prisma, payoutCompletedPayloadSchema.parse(payload));
    case "payout.failed":
      return handlePayoutFailed(prisma, payoutFailedPayloadSchema.parse(payload));
    case "card.transaction.completed":
      return handleCardTransactionCompleted(prisma, cardTransactionCompletedPayloadSchema.parse(payload), externalEventId);
    case "swap.completed":
      return handleSwapCompleted(prisma, swapCompletedPayloadSchema.parse(payload), externalEventId);
    default:
      return { status: "IGNORED", errorMessage: `Unrecognized eventType: ${eventType}` };
  }
}
