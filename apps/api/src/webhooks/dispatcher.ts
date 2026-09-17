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
    // `deposit.completed` has no documented payload example of its own (docs.yativo.com only lists
    // it in the event-type table), but it's the same resource family as created/updated — same
    // convention as business_spend_card.* below, where every lifecycle event for one resource
    // shares one payload shape.
    case "deposit.completed":
      return handleDepositEvent(prisma, depositEventPayloadSchema.parse(payload), externalEventId);
    case "payout.updated":
    // Same reasoning as deposit.completed above — undocumented payload, same resource family as
    // payout.updated (confirmed field set: payout_id/amount/currency/status/beneficiary_id).
    case "payout.completed":
      return handlePayoutEvent(prisma, payoutEventPayloadSchema.parse(payload), externalEventId);
    case "virtual_account.deposit":
      return handleVirtualAccountDeposit(prisma, virtualAccountDepositPayloadSchema.parse(payload), externalEventId);
    case "virtualcard.deactivated":
      return handleVirtualCardDeactivated(prisma, virtualCardDeactivatedPayloadSchema.parse(payload));
    // `crypto.deposit.completed` is the current code path for the same conceptual event as the
    // legacy `crypto_deposit` (confirmed identical payload shape against a live delivery) — same
    // handler, same schema.
    case "crypto_deposit":
    case "crypto.deposit.completed":
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
    case "business_spend_card.transaction.approved":
    case "business_spend_card.transaction.declined":
    case "business_spend_card.transaction.refunded":
    case "business_spend_card.transaction.reversed":
    case "business_spend_card.status_changed":
      return handleBusinessSpendCardEvent(prisma, eventType, businessSpendCardEventPayloadSchema.parse(payload));
    // Recognized but not acted on — recorded (see yativo.routes.ts) so they're visible in the
    // admin webhook log, but this app has no local state that needs updating from them. In
    // particular the other virtualcard.* transaction/topup/withdrawal events are deliberately left
    // unhandled here: several share an identical field shape (see classifyVirtualCardEvent in
    // yativo.routes.ts) and guessing wrong would risk posting an incorrect ledger entry, which is
    // worse than not processing it automatically.
    case "customer.created":
    case "customer.updated":
      return { status: "IGNORED", errorMessage: `${eventType} carries no field this app doesn't already own locally or read live from Yativo` };
    // Both the virtual accounts list (virtualAccounts.routes.ts) and the crypto wallets list
    // (cryptoWallets.service.ts) are always fetched LIVE from Yativo on every page load — nothing
    // here caches account/wallet details locally that a .created/.updated/.deleted event would need
    // to refresh. (The local VirtualAccount/CryptoWallet tables only ever store an id for
    // ownership/attribution, populated at creation time by this app's own request, not by webhook.)
    case "virtual_account.created":
    case "virtual_account.updated":
    case "wallet.deleted":
      return { status: "IGNORED", errorMessage: `${eventType} has no local cache to refresh — the customer-facing list is always read live from Yativo` };
    // This app doesn't use Yativo's custom transaction-metadata feature.
    case "metadata.created":
    case "metadata.updated":
      return { status: "IGNORED", errorMessage: `${eventType} — this app doesn't use Yativo's custom metadata feature` };
    // A granular sub-status for a payout/deposit already in flight (e.g. "Payout initiated", "In
    // Progress") — informational only. The transaction's actual business-facing status (and any
    // ledger/notification action) is driven entirely by payout.updated/deposit.updated, which fire
    // independently for the same transaction; this event never carries a status this app doesn't
    // already get from those.
    case "tracking.created":
      return { status: "IGNORED", errorMessage: "tracking.created is an informational sub-status — the transaction's real status comes from payout.updated/deposit.updated" };
    // This app has no local gift-card purchase feature to update (see fiat/giftCards.ts in the SDK
    // — a thin client wrapper only, never called from this app today).
    case "giftcard.status_changed":
      return { status: "IGNORED", errorMessage: "giftcard.status_changed — this app has no local gift-card feature to update" };
    // Sent once, immediately, as a delivery test right after you (re)register your webhook URL —
    // nothing to act on beyond confirming this endpoint received it (also carries your webhook
    // secret in plaintext, which syncWebhookSecretIfRotated already handles separately when a real
    // signature mismatch is detected — see yativo.routes.ts).
    case "webhook_updated":
      return { status: "IGNORED", errorMessage: "webhook_updated is a delivery test, sent once after registering your webhook URL — nothing to act on" };
    // Your own account/business profile on Yativo (not a specific customer) — not mirrored locally.
    case "user.updated":
      return { status: "IGNORED", errorMessage: "user.updated is your Yativo account profile, not a customer record — nothing mirrored locally" };
    // Platform-wide "a payment rail was turned on/off" notices, not scoped to this account. Every
    // payin/payout method list this app shows is fetched live per-request (deposits.routes.ts,
    // beneficiaries.service.ts, payouts.service.ts) — nothing cached to invalidate.
    case "payin_method.enabled":
    case "payin_method.disabled":
    case "payout_method.enabled":
    case "payout_method.disabled":
      return { status: "IGNORED", errorMessage: `${eventType} — payment methods are always fetched live, nothing cached to invalidate` };
    // The endorsement checklist is never cached locally — every read (see
    // customers.service.ts#getCustomerEndorsements) goes live to Yativo's GET /customer, so there's
    // nothing for this event to update here. Recognized so it doesn't show up as a mysterious
    // "unrecognized" event, but intentionally a no-op.
    case "endorsement.updated":
      return { status: "IGNORED", errorMessage: "Endorsement status is always read live from Yativo — nothing to update locally" };
    // Yativo's own general customer_kyc_status isn't consumed anywhere in this app any more —
    // endorsements (see endorsement.updated above) are the only per-service approval signal this
    // platform gates on now. Recognized (per docs.yativo.com's event table) so they log as
    // expected rather than "unrecognized", but intentionally a no-op.
    case "customer.kyc.approved":
    case "customer.kyc.rejected":
      return { status: "IGNORED", errorMessage: "Yativo's general KYC status isn't used by this platform — endorsements are the only status it acts on" };
    // Documented as a distinct event from virtual_account.deposit, but docs.yativo.com gives no
    // payload example for it — unlike virtual_account.deposit's confirmed nested customer/source
    // shape. Recognized so it's visible in the admin webhook log instead of looking unrecognized,
    // but not auto-processed until a real delivery shows what it actually carries (same posture as
    // the ambiguous virtualcard.* events below).
    case "virtual_account.funded":
      return { status: "IGNORED", errorMessage: "virtual_account.funded has no documented payload shape yet — not auto-processed" };
    // Only reachable via the sandbox demo endpoint (POST /v1/demo/webhook/virtual_card_deposit) —
    // Yativo's guide is explicit that no real trigger sends this in production yet. Recognized so
    // testing it doesn't look like an unrecognized-event bug.
    case "virtual_card.deposit":
      return { status: "IGNORED", errorMessage: "virtual_card.deposit only exists behind the sandbox demo endpoint — not wired to a real trigger yet" };
    default:
      if (eventType.startsWith("virtualcard.")) {
        return { status: "IGNORED", errorMessage: `Ambiguous virtualcard.* event, not auto-processed: ${eventType}` };
      }
      return { status: "IGNORED", errorMessage: `Unrecognized eventType: ${eventType}` };
  }
}
