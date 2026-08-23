import { z } from "zod";

/** Every Yativo webhook arrives wrapped in this envelope; `data` varies by `eventType`. */
export const yativoWebhookEnvelopeSchema = z.object({
  eventId: z.string(),
  eventType: z.string(),
  occurredAt: z.string(),
  data: z.record(z.unknown()),
});
export type YativoWebhookEnvelope = z.infer<typeof yativoWebhookEnvelopeSchema>;

export const depositConfirmedPayloadSchema = z.object({
  yativoCustomerId: z.string(),
  currencyCode: z.string(),
  amountMinor: z.string(),
  yativoDepositId: z.string(),
  externalRef: z.string().optional(),
});
export type DepositConfirmedPayload = z.infer<typeof depositConfirmedPayloadSchema>;

export const payoutCompletedPayloadSchema = z.object({
  yativoPayoutId: z.string(),
  currencyCode: z.string(),
  amountMinor: z.string(),
  feeMinor: z.string().optional(),
  externalRef: z.string().optional(),
});
export type PayoutCompletedPayload = z.infer<typeof payoutCompletedPayloadSchema>;

export const payoutFailedPayloadSchema = z.object({
  yativoPayoutId: z.string(),
  reason: z.string(),
  externalRef: z.string().optional(),
});
export type PayoutFailedPayload = z.infer<typeof payoutFailedPayloadSchema>;

export const cardTransactionCompletedPayloadSchema = z.object({
  yativoCardId: z.string(),
  currencyCode: z.string(),
  amountMinor: z.string(),
  merchantName: z.string().optional(),
  externalRef: z.string().optional(),
});
export type CardTransactionCompletedPayload = z.infer<typeof cardTransactionCompletedPayloadSchema>;

export const swapCompletedPayloadSchema = z.object({
  yativoCustomerId: z.string(),
  sourceCurrency: z.string(),
  targetCurrency: z.string(),
  sourceAmountMinor: z.string(),
  targetAmountMinor: z.string(),
  externalRef: z.string().optional(),
});
export type SwapCompletedPayload = z.infer<typeof swapCompletedPayloadSchema>;

export const YATIVO_WEBHOOK_EVENT_TYPES = [
  "deposit.confirmed",
  "payout.completed",
  "payout.failed",
  "card.transaction.completed",
  "swap.completed",
] as const;
export type YativoWebhookEventType = (typeof YATIVO_WEBHOOK_EVENT_TYPES)[number];
