import { z } from "zod";
import { CARD_STATUSES } from "./enums.js";
import { minorAmountSchema } from "./money.js";

// Yativo only issues Visa/virtual/USD cards today — no brand, type, or currency picker anywhere
// in this schema; every card is implicitly Visa/virtual/USD.

export const cardSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  yativoCardId: z.string().nullable(),
  network: z.string(),
  last4: z.string().length(4).nullable(),
  status: z.enum(CARD_STATUSES),
  createdAt: z.string(),
});
export type CardDto = z.infer<typeof cardSchema>;

/** The card program's issuing/sponsor-bank billing address — not the cardholder's own address, since Yativo doesn't collect one at card-creation time. Still real, useful data (e.g. for AVS-checking merchants). */
export const cardBillingAddressSchema = z.object({
  line1: z.string().nullable(),
  line2: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  postalCode: z.string().nullable(),
  country: z.string().nullable(),
});
export type CardBillingAddress = z.infer<typeof cardBillingAddressSchema>;

/** Richer than `cardSchema` — fetched live from the issuer (GET /portal/cards/:id), not just the local ledger row. */
export const cardDetailSchema = cardSchema.extend({
  cardholderName: z.string().nullable(),
  cardBrand: z.string().nullable(),
  cardProgram: z.string().nullable(),
  maskedPan: z.string().nullable(),
  contactlessPayment: z.boolean().nullable(),
  balance: z.string().nullable(),
  spentThisMonth: z.string().nullable(),
  toppedUpThisMonth: z.string().nullable(),
  billingAddress: cardBillingAddressSchema.nullable(),
});
export type CardDetailDto = z.infer<typeof cardDetailSchema>;

export const issueCardSchema = z.object({
  customerId: z.string(),
  /** Initial funding in USD minor units (cents) — Yativo requires a minimum $3 starting balance, debited immediately along with a creation fee and a top-up fee. */
  amountMinor: minorAmountSchema,
});
export type IssueCardInput = z.infer<typeof issueCardSchema>;

export const portalIssueCardSchema = z.object({ amountMinor: minorAmountSchema });
export type PortalIssueCardInput = z.infer<typeof portalIssueCardSchema>;

export const cardAmountSchema = z.object({ amountMinor: minorAmountSchema });
export type CardAmountInput = z.infer<typeof cardAmountSchema>;

/**
 * The full PAN + CVV in plaintext — Yativo has no separate secure "reveal" endpoint, this is
 * just what the underlying show-card call returns. Never persisted or logged server-side; only
 * ever fetched fresh, on an explicit user action, and rendered masked-by-default in the UI.
 */
export const cardRevealSchema = z.object({
  cardNumber: z.string().optional(),
  cvv: z.string().optional(),
  expiry: z.string().optional(),
});
export type CardReveal = z.infer<typeof cardRevealSchema>;

export const cardTransactionSchema = z.object({
  id: z.string().optional(),
  amount: z.string(),
  currency: z.string().optional(),
  type: z.string().optional(),
  status: z.string().optional(),
  reference: z.string().optional(),
  balanceBefore: z.string().optional(),
  balanceAfter: z.string().optional(),
  feeAmount: z.string().optional(),
  feeType: z.string().optional(),
  description: z.string().optional(),
  cardholderName: z.string().optional(),
  transactionDate: z.string().optional(),
  createdAt: z.string().optional(),
  /** Anything the card issuer sent that isn't modeled above — passed through as-is. */
  raw: z.record(z.unknown()),
});
export type CardTransaction = z.infer<typeof cardTransactionSchema>;

export const setAirlinePaymentsSchema = z.object({ enabled: z.boolean() });
