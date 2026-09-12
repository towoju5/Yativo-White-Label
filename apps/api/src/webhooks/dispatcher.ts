import type { PrismaClient } from "@prisma/client";
import {
  depositEventPayloadSchema,
  payoutEventPayloadSchema,
  virtualAccountDepositPayloadSchema,
  virtualCardDeactivatedPayloadSchema,
  businessSpendCardEventPayloadSchema,
  cryptoDepositEventPayloadSchema,
  cryptoWalletCreatedPayloadSchema,
} from "@white-label/yativo-sdk";
import { handleDepositEvent } from "./handlers/deposit.handler.js";
import { handlePayoutEvent } from "./handlers/payout.handler.js";
import { handleVirtualAccountDeposit } from "./handlers/virtualAccountDeposit.handler.js";
import { handleVirtualCardDeactivated } from "./handlers/card.handler.js";
import { handleBusinessSpendCardEvent } from "./handlers/businessSpendCard.handler.js";
import { handleCryptoDeposit } from "./handlers/cryptoDeposit.handler.js";
import { handleCryptoWalletCreated } from "./handlers/cryptoWalletCreated.handler.js";
import type { WebhookHandlerResult } from "./handlers/result.js";

/** Dispatches a persisted WebhookEvent to the handler for its eventType. Unrecognized event types are IGNORED, not FAILED. */
export async function dispatchWebhookEvent(
  prisma: PrismaClient,
  eventType: string,
  payload: Record<string, unknown>,
  externalEventId: string,
): Promise<WebhookHandlerResult> {
  switch (eventType) {
    case "deposit.created":
    case "deposit.updated":
      return handleDepositEvent(prisma, depositEventPayloadSchema.parse(payload), externalEventId);
    case "payout.updated":
      return handlePayoutEvent(prisma, payoutEventPayloadSchema.parse(payload), externalEventId);
    case "virtual_account.deposit":
      return handleVirtualAccountDeposit(prisma, virtualAccountDepositPayloadSchema.parse(payload), externalEventId);
    case "virtualcard.deactivated":
      return handleVirtualCardDeactivated(prisma, virtualCardDeactivatedPayloadSchema.parse(payload));
    case "crypto_deposit":
      return handleCryptoDeposit(prisma, cryptoDepositEventPayloadSchema.parse(payload));
    case "crypto.wallet.created":
      return handleCryptoWalletCreated(prisma, cryptoWalletCreatedPayloadSchema.parse(payload));
    case "business_spend_card.created":
    case "business_spend_card.activated":
    case "business_spend_card.suspended":
    case "business_spend_card.terminated":
    case "business_spend_card.funded":
    case "business_spend_card.withdrawn":
    case "business_spend_card.pin_updated":
    case "business_spend_card.limits_updated":
      return handleBusinessSpendCardEvent(prisma, eventType, businessSpendCardEventPayloadSchema.parse(payload));
    // Recognized but not yet acted on — recorded (see yativo.routes.ts) so they're visible in the
    // admin webhook log, but this app has no business logic wired up for them today. In particular
    // the other virtualcard.* transaction/topup/withdrawal events are deliberately left unhandled
    // here: several share an identical field shape (see classifyVirtualCardEvent in
    // yativo.routes.ts) and guessing wrong would risk posting an incorrect ledger entry, which is
    // worse than not processing it automatically.
    case "customer.created":
    case "customer.updated":
    case "virtual_account.created":
    case "virtual_account.updated":
    case "metadata.created":
    case "tracking.created":
    case "giftcard.status_changed":
    case "webhook_updated":
      return { status: "IGNORED", errorMessage: `No handler wired up yet for eventType: ${eventType}` };
    // The endorsement checklist is never cached locally — every read (see
    // customers.service.ts#getCustomerEndorsements) goes live to Yativo's GET /customer, so there's
    // nothing for this event to update here. Recognized so it doesn't show up as a mysterious
    // "unrecognized" event, but intentionally a no-op.
    case "endorsement.updated":
      return { status: "IGNORED", errorMessage: "Endorsement status is always read live from Yativo — nothing to update locally" };
    default:
      if (eventType.startsWith("virtualcard.")) {
        return { status: "IGNORED", errorMessage: `Ambiguous virtualcard.* event, not auto-processed: ${eventType}` };
      }
      return { status: "IGNORED", errorMessage: `Unrecognized eventType: ${eventType}` };
  }
}
