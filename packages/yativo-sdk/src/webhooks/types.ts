import { z } from "zod";

/**
 * The standard envelope every Yativo webhook uses EXCEPT gift card events (`{ event, data, ... }`,
 * no `payload` key) and the `virtualcard.*` family (no envelope at all — the request body IS the
 * event data). There's no delivery id, timestamp, or API-version field here — Yativo's own guide
 * says to derive idempotency from fields inside `payload` instead (see deriveExternalEventId in
 * apps/api/src/webhooks/yativo.routes.ts).
 */
export const yativoWebhookEnvelopeSchema = z.object({
  "event.type": z.string(),
  payload: z.record(z.unknown()),
});
export type YativoWebhookEnvelope = z.infer<typeof yativoWebhookEnvelopeSchema>;

export const DEPOSIT_STATUSES = ["pending", "processing", "success", "failed", "cancelled", "expired"] as const;

/** `deposit.created` / `deposit.updated` — a native gateway pay-in (see modules/deposits). Raw fields are snake_case; this transforms to the camelCase shape handlers consume. */
const rawDepositEventSchema = z
  .object({
    id: z.string(),
    currency: z.string(),
    // The wallet-side currency, when it differs from the gateway's local `currency` — falls back
    // to `currency` since not every corridor's example payload includes this field.
    deposit_currency: z.string().optional(),
    amount: z.union([z.string(), z.number()]),
    receive_amount: z.union([z.string(), z.number()]).optional(),
    status: z.enum(DEPOSIT_STATUSES),
    customer_id: z.string(),
    deposit_id: z.string().optional(),
    transaction_id: z.string().optional(),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
  })
  .passthrough();

export const depositEventPayloadSchema = rawDepositEventSchema.transform((d) => ({
  id: d.id,
  currencyCode: d.deposit_currency ?? d.currency,
  // Decimal major-unit string — NOT minor units, unlike almost everything else in this app.
  // Convert via majorToMinor(amount, currency.decimals) once the currency's decimals are known.
  amount: String(d.amount),
  receiveAmount: d.receive_amount !== undefined ? String(d.receive_amount) : undefined,
  status: d.status,
  yativoCustomerId: d.customer_id,
  yativoDepositId: d.deposit_id ?? d.id,
  updatedAt: d.updated_at,
  createdAt: d.created_at,
}));
export type DepositEventPayload = z.infer<typeof depositEventPayloadSchema>;

export const PAYOUT_STATUSES = ["pending", "processing", "completed", "failed", "cancelled", "refunded"] as const;

/** `payout.updated` — the ONLY payout event Yativo sends; there's no separate created/completed/failed split, so this replaces what were previously two handlers. No fee field exists on the real payload. */
const rawPayoutEventSchema = z
  .object({
    id: z.string(),
    payout_id: z.string().optional(),
    customer_id: z.string(),
    beneficiary_id: z.string().optional(),
    currency: z.string(),
    amount: z.union([z.string(), z.number()]),
    status: z.enum(PAYOUT_STATUSES),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
  })
  .passthrough();

export const payoutEventPayloadSchema = rawPayoutEventSchema.transform((d) => ({
  yativoPayoutId: d.payout_id ?? d.id,
  yativoCustomerId: d.customer_id,
  currencyCode: d.currency,
  // Decimal major-unit string, same caveat as deposits above.
  amount: String(d.amount),
  status: d.status,
  updatedAt: d.updated_at,
  createdAt: d.created_at,
}));
export type PayoutEventPayload = z.infer<typeof payoutEventPayloadSchema>;

/** `virtual_account.deposit` — funds landing in a long-lived virtual account, a genuinely different event from deposit.created/updated (see modules/virtualAccounts). Yativo's guide confirms `amount_recevied` is a real (misspelled) field name — don't "fix" it when mapping. */
const rawVirtualAccountDepositSchema = z
  .object({
    transaction_id: z.string(),
    currency: z.string(),
    amount: z.union([z.string(), z.number()]),
    amount_recevied: z.union([z.string(), z.number()]).optional(),
    status: z.string(),
    account_number: z.string().optional(),
    customer: z.object({ customer_id: z.string(), customer_name: z.string().optional(), customer_email: z.string().optional() }).optional(),
  })
  .passthrough();

export const virtualAccountDepositPayloadSchema = rawVirtualAccountDepositSchema.transform((d) => ({
  transactionId: d.transaction_id,
  currencyCode: d.currency,
  amount: String(d.amount),
  grossAmount: d.amount_recevied !== undefined ? String(d.amount_recevied) : undefined,
  status: d.status,
  yativoCustomerId: d.customer?.customer_id,
  accountNumber: d.account_number,
}));
export type VirtualAccountDepositPayload = z.infer<typeof virtualAccountDepositPayloadSchema>;

/**
 * `virtualcard.transaction.debit` — a card purchase. No envelope, and (per Yativo's own guide)
 * most events in this family carry no field naming the event at all — this app only acts on the
 * one shape it can identify with confidence; see yativo.routes.ts for how it's distinguished from
 * the same-shaped `.reversed`/`.declined`/etc. siblings, which are recorded but not auto-processed.
 * `amount` is in CENTS on every virtualcard.* event (the one family that isn't decimal).
 */
const rawVirtualCardTransactionSchema = z
  .object({
    id: z.string(),
    amount: z.union([z.string(), z.number()]),
    cardId: z.string(),
    reason: z.string().optional(),
    status: z.string().optional(),
    companyId: z.string().optional(),
    narrative: z.string().optional(),
    reference: z.string().optional(),
  })
  .passthrough();

export const virtualCardTransactionPayloadSchema = rawVirtualCardTransactionSchema.transform((d) => ({
  id: d.id,
  // Already minor units (cents) — our cards are always USD/2-decimals, so no conversion needed.
  amountMinor: String(Math.round(Number(d.amount))),
  yativoCardId: d.cardId,
  merchantName: d.narrative,
  reference: d.reference,
}));
export type VirtualCardTransactionPayload = z.infer<typeof virtualCardTransactionPayloadSchema>;

/** `virtualcard.deactivated` — the one event in the virtualcard.* family that DOES carry an explicit `event` field, sent when Yativo auto-freezes a card after repeated failed charge attempts. */
export const virtualCardDeactivatedPayloadSchema = z.object({
  cardId: z.string(),
  reason: z.string().optional(),
});
export type VirtualCardDeactivatedPayload = z.infer<typeof virtualCardDeactivatedPayloadSchema>;

// ⚠️ Not documented in Yativo's webhook guide — kept from before this file was corrected against
// that guide, in case it's real but simply omitted from the doc. Verify against a live delivery
// before relying on it; it may need the same kind of field-name/units fix the other events got.
export const swapCompletedPayloadSchema = z.object({
  yativoCustomerId: z.string(),
  sourceCurrency: z.string(),
  targetCurrency: z.string(),
  sourceAmountMinor: z.string(),
  targetAmountMinor: z.string(),
  externalRef: z.string().optional(),
});
export type SwapCompletedPayload = z.infer<typeof swapCompletedPayloadSchema>;

/** The standard-envelope event types this app recognizes (whether or not it has business logic wired up for all of them yet) — used only for documentation/reference, not for parsing. */
export const YATIVO_WEBHOOK_EVENT_TYPES = [
  "deposit.created",
  "deposit.updated",
  "payout.updated",
  "customer.created",
  "customer.updated",
  "virtual_account.created",
  "virtual_account.updated",
  "virtual_account.deposit",
  "metadata.created",
  "tracking.created",
  "crypto.wallet.created",
  "crypto_deposit",
  "giftcard.status_changed",
  "webhook_updated",
] as const;
export type YativoWebhookEventType = (typeof YATIVO_WEBHOOK_EVENT_TYPES)[number];
