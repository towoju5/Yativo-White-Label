import { z } from "zod";
import { currencyCodeSchema, minorAmountSchema } from "./money.js";

/** Indicative market rates, from Yativo's GET /exchange-rates. Each rate means 1 `base` = `rate` units of that currency; null when none is available right now. */
export const exchangeRatesSchema = z.object({
  base: z.string(),
  rates: z.record(z.string(), z.number().nullable()),
  updatedAt: z.string(),
});
export type ExchangeRates = z.infer<typeof exchangeRatesSchema>;

/** A currency the customer can swap into — enabled for customers by the admin and with a live rate. */
export const swapCurrencySchema = z.object({
  code: z.string(),
  name: z.string(),
  symbol: z.string().nullable(),
  decimals: z.number().int(),
});
export type SwapCurrency = z.infer<typeof swapCurrencySchema>;

export const swapOptionsSchema = z.object({
  currencies: z.array(swapCurrencySchema),
  rates: exchangeRatesSchema,
});
export type SwapOptions = z.infer<typeof swapOptionsSchema>;

export const swapQuoteRequestSchema = z.object({
  fromCurrency: currencyCodeSchema,
  toCurrency: currencyCodeSchema,
  /** What the customer wants converted, in `fromCurrency` minor units — the fee is charged on top. */
  amountMinor: minorAmountSchema,
});
export type SwapQuoteRequest = z.infer<typeof swapQuoteRequestSchema>;

/** Held server-side until `expiresAt` — confirming within that window converts at exactly these figures. */
export const swapQuoteSchema = z.object({
  quoteId: z.string(),
  fromCurrency: z.string(),
  toCurrency: z.string(),
  amountMinor: minorAmountSchema,
  feeMinor: minorAmountSchema,
  /** amount + fee — what leaves the `fromCurrency` wallet. */
  totalDebitMinor: minorAmountSchema,
  /** What lands in the `toCurrency` wallet. */
  toAmountMinor: minorAmountSchema,
  /** 1 `fromCurrency` = `rate` `toCurrency`, as a decimal string. */
  rate: z.string(),
  rateUpdatedAt: z.string(),
  expiresAt: z.string(),
});
export type SwapQuote = z.infer<typeof swapQuoteSchema>;

export const createSwapSchema = z.object({
  /** Also the idempotency key — a quote converts at most once, so a double-click or retry returns the original swap. */
  quoteId: z.string().min(8).max(64),
});
export type CreateSwapInput = z.infer<typeof createSwapSchema>;

export const swapSchema = z.object({
  id: z.string(),
  fromCurrency: z.string(),
  toCurrency: z.string(),
  fromAmountMinor: minorAmountSchema,
  feeMinor: minorAmountSchema,
  toAmountMinor: minorAmountSchema,
  rate: z.string(),
  transactionId: z.string(),
  createdAt: z.string(),
});
export type Swap = z.infer<typeof swapSchema>;
