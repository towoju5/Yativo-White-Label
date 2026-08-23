import { z } from "zod";
import { currencyCodeSchema, minorAmountSchema } from "./money.js";

export const beneficiarySchema = z.object({
  id: z.string(),
  customerId: z.string(),
  name: z.string(),
  type: z.string(),
  yativoBeneficiaryId: z.string().nullable(),
  details: z.record(z.unknown()),
  createdAt: z.string(),
});
export type Beneficiary = z.infer<typeof beneficiarySchema>;

export const createBeneficiarySchema = z.object({
  name: z.string().min(1),
  type: z.enum(["BANK_ACCOUNT", "CRYPTO_ADDRESS", "CARD"]),
  details: z.record(z.unknown()),
});
export type CreateBeneficiaryInput = z.infer<typeof createBeneficiarySchema>;

/**
 * Only the nickname is editable. Yativo has no update-beneficiary endpoint, so the actual payout
 * routing details (`details.paymentData` — account number, bank code, wallet address, ...) can't
 * be safely edited in place: Yativo would still route a payout using whatever it has on file for
 * this beneficiary regardless of what we change locally. If those details are wrong, the correct
 * fix is to remove this beneficiary and add a new one.
 */
export const updateBeneficiarySchema = z.object({
  name: z.string().min(1).max(120),
});
export type UpdateBeneficiaryInput = z.infer<typeof updateBeneficiarySchema>;

// ── Payout-country / payout-method / form pickers (steps 1-3 of the Yativo payout flow) ──

export const payoutCountrySchema = z.object({
  iso3: z.string(),
  iso2: z.string(),
  name: z.string(),
});
export type PayoutCountry = z.infer<typeof payoutCountrySchema>;

export const payoutMethodSchema = z.object({
  gatewayId: z.string(),
  methodName: z.string(),
  gateway: z.string().optional(),
  country: z.string().optional(),
  currency: z.string().optional(),
  paymentMode: z.string().optional(),
  minimumWithdrawal: z.string().optional(),
  maximumWithdrawal: z.string().optional(),
  fixedCharge: z.string().optional(),
  floatCharge: z.string().optional(),
  estimatedDelivery: z.string().optional(),
});
export type PayoutMethod = z.infer<typeof payoutMethodSchema>;

export const beneficiaryFormFieldOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
});
export type BeneficiaryFormFieldOption = z.infer<typeof beneficiaryFormFieldOptionSchema>;

export const beneficiaryFormFieldSchema = z.object({
  key: z.string(),
  name: z.string(),
  type: z.string(),
  required: z.boolean(),
  options: z.array(beneficiaryFormFieldOptionSchema).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  /** This field only applies when the field named by `when.key` currently has value `when.value`. */
  when: z.object({ key: z.string(), value: z.string() }).optional(),
  /** Only meaningful for type: "hidden" — the fixed value to submit in payment_data verbatim; never render this field as an input. */
  defaultValue: z.string().optional(),
});
export type BeneficiaryFormField = z.infer<typeof beneficiaryFormFieldSchema>;

// ── Quote (Yativo's /exchange-rate — step 6, don't skip it) ──

export const quoteRequestSchema = z.object({
  beneficiaryId: z.string(),
  /** Wallet currency to debit — the beneficiary's own currency is the payout side and is looked up server-side. */
  debitCurrency: currencyCodeSchema,
  /**
   * Decimal amount (major units, e.g. "1000.00") in `debitCurrency` — how much to send FROM the
   * wallet, before fees. Confirmed against both Yativo's official docs and live behavior (a
   * cross-currency test: requesting amount=1000 for a USD→MXN corridor at a ~16.83 rate produced
   * a ~$1021 debit and a ~16,834 MXN receive, not the reverse) that /exchange-rate's `amount` is
   * ALWAYS denominated in from_currency (the debit side), never the payout/receive side — despite
   * an earlier, never-arithmetic-checked assumption in this codebase that it was the receive-side
   * figure. A plain decimal string rather than minorAmountSchema since decimals are resolved
   * server-side from debitCurrency.
   */
  sendAmount: z.string().regex(/^\d+(\.\d+)?$/, "must be a decimal amount"),
});
export type QuoteRequest = z.infer<typeof quoteRequestSchema>;

export const quoteSchema = z.object({
  quoteId: z.string(),
  debitCurrency: currencyCodeSchema,
  payoutCurrency: currencyCodeSchema,
  debitDecimals: z.number().int(),
  payoutDecimals: z.number().int(),
  methodId: z.string(),
  rate: z.string(),
  /** What the sender pays and the recipient receives, in each currency's minor units. */
  debitAmountMinor: minorAmountSchema,
  receiveAmountMinor: minorAmountSchema,
  /** Quotes expire ~5 minutes after issuance — re-quote past this. */
  expiresAt: z.string(),
});
export type Quote = z.infer<typeof quoteSchema>;

export const createPayoutSchema = z.object({
  beneficiaryId: z.string(),
  currencyCode: currencyCodeSchema,
  amountMinor: minorAmountSchema,
  // Required, not optional: the portal flow always quotes before submitting (see quoteRequestSchema)
  // so the payout method on submission is guaranteed to match the quote's locked rate.
  quoteId: z.string(),
  memo: z.string().optional(),
});
export type CreatePayoutInput = z.infer<typeof createPayoutSchema>;

export const payoutSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  beneficiaryId: z.string(),
  currencyCode: currencyCodeSchema,
  amountMinor: minorAmountSchema,
  status: z.enum(["PENDING", "POSTED", "REVERSED"]),
  transactionId: z.string(),
  yativoPayoutId: z.string().nullable(),
  createdAt: z.string(),
});
export type Payout = z.infer<typeof payoutSchema>;

/** Live status pulled directly from Yativo (GET /payout/fetch/{payout_id}) — step 9, for polling after submit. */
export const payoutStatusSchema = z.object({
  yativoPayoutId: z.string(),
  status: z.string(),
  debitAmount: z.string().optional(),
  targetAmount: z.string().optional(),
  currency: z.string().optional(),
  processedAt: z.string().optional(),
});
export type PayoutStatus = z.infer<typeof payoutStatusSchema>;
