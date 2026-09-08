import { z } from "zod";
import { currencyCodeSchema } from "./money.js";

// ── Deposit-country / deposit-method pickers (steps 1-2 of the native deposit flow) ──

export const depositCountrySchema = z.object({
  iso3: z.string(),
  name: z.string(),
  flag: z.string().optional(),
});
export type DepositCountry = z.infer<typeof depositCountrySchema>;

export const depositFormFieldOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
});
export type DepositFormFieldOption = z.infer<typeof depositFormFieldOptionSchema>;

export const depositFormFieldSchema = z.object({
  key: z.string(),
  name: z.string(),
  type: z.string(),
  required: z.boolean(),
  options: z.array(depositFormFieldOptionSchema).optional(),
  /** Per-value validation, keyed by another field's chosen value — e.g. a document-number field that validates differently for "RFC" vs "CURP". */
  regexMap: z.record(z.string()).optional(),
});
export type DepositFormField = z.infer<typeof depositFormFieldSchema>;

export const depositMethodSchema = z.object({
  gatewayId: z.string(),
  methodName: z.string(),
  country: z.string().optional(),
  currency: z.string(),
  minimumDeposit: z.string().optional(),
  maximumDeposit: z.string().optional(),
  formFields: z.array(depositFormFieldSchema),
});
export type DepositMethod = z.infer<typeof depositMethodSchema>;

// ── Initiate deposit ──

export const createDepositSchema = z.object({
  gatewayId: z.string(),
  /** Wallet currency to credit — from the customer's own wallets (GET /portal/wallets). */
  walletCurrencyCode: currencyCodeSchema,
  /** Decimal amount (major units) in the chosen method's LOCAL currency (DepositMethod.currency), not the wallet currency. */
  amount: z.string().regex(/^\d+(\.\d+)?$/, "must be a decimal amount"),
  /** Values for the method's formFields, keyed by field.key — required whenever formFields is non-empty. */
  extraData: z.record(z.string()).optional(),
});
export type CreateDepositInput = z.infer<typeof createDepositSchema>;

export const depositResultSchema = z.object({
  depositUrl: z.string().nullable(),
  depositId: z.string().nullable(),
  localCurrency: z.string().nullable(),
  localAmount: z.string().nullable(),
  walletCurrencyCode: z.string().nullable(),
  receiveAmount: z.string().nullable(),
  exchangeRate: z.string().nullable(),
  transactionFee: z.string().nullable(),
  /**
   * What will actually be deducted from the customer's wallet for this deposit — the platform's
   * own fee (admin-configured global default, or a per-customer override if one is set), possibly
   * plus Yativo's own fee (`transactionFee`) if pricing is set to markup. In `walletCurrencyCode`
   * major units. Null when it couldn't be computed (e.g. Yativo didn't return a receive amount).
   * See getEffectiveFee — this is the same figure the deposit.confirmed webhook charges.
   */
  platformFee: z.string().nullable(),
  /** Same fee as `platformFee`, converted to `localCurrency` at the deposit's quoted `exchangeRate` — shown alongside it so the customer sees the fee in the currency they're actually paying with, not just the wallet currency. Null under the same conditions as `platformFee`, plus if the exchange-rate string didn't parse. */
  platformFeeLocal: z.string().nullable(),
  /** `receiveAmount` minus `platformFee`, in `walletCurrencyCode` major units — what actually remains in the wallet once the platform's fee posts at settlement. Can be negative if the fee exceeds the deposit; shown as-is rather than hidden, since that's a real (mis)configuration signal, not a display glitch. Null under the same conditions as `platformFee`. */
  netReceiveAmount: z.string().nullable(),
  estimatedDelivery: z.string().nullable(),
});
export type DepositResult = z.infer<typeof depositResultSchema>;
