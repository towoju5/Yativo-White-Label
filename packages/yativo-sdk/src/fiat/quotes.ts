import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { YativoContext } from "../client.js";
import { yativoEnvelope } from "../client.js";

// Confirmed live (two independent corridors, USD→NGN and USD→MXN) AND against Yativo's own docs:
// `payout_data.customer_receive_amount` does NOT actually hold a to_currency figure despite its
// name and despite the docs saying it should — it's just an echo of the from_currency `amount` we
// sent. The real to_currency receive figure lives at `calculator.customer_receive_amount.payout_currency`.
// `payout_data.customer_total_amount_due` DOES correctly hold the from_currency debit total (fees
// included) — confirmed to equal `calculator.total_amount.wallet_currency` in both test corridors.
const moneyPairSchema = z.object({ wallet_currency: z.union([z.string(), z.number()]), payout_currency: z.union([z.string(), z.number()]) }).passthrough();

const calculatorSchema = z
  .object({
    customer_receive_amount: moneyPairSchema.optional(),
    total_amount: moneyPairSchema.optional(),
    amount_due: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

const payoutDataSchema = z
  .object({
    customer_receive_amount: z.union([z.string(), z.number()]).optional(),
    customer_total_amount_due: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

const exchangeRateDataSchema = z
  .object({
    quote_id: z.string(),
    quote_expire_at: z.string(),
    rate: z.union([z.string(), z.number()]),
    payout_data: payoutDataSchema.optional(),
    calculator: calculatorSchema.optional(),
  })
  .passthrough();

export const fiatQuoteSchema = z.object({
  quoteId: z.string(),
  fromCurrency: z.string(),
  toCurrency: z.string(),
  methodId: z.string(),
  amount: z.number(),
  rate: z.string(),
  /** What the recipient actually gets, in `toCurrency` major units — sourced from calculator.customer_receive_amount.payout_currency (see note above), NOT payout_data's same-named field. */
  customerReceiveAmount: z.string().optional(),
  /** Total the sender is debited, in `fromCurrency` major units (rate-converted plus fees) — this is what CreateFiatPayoutInput.amount should be set to. */
  customerTotalAmountDue: z.string().optional(),
  expiresAt: z.string(),
});
export type FiatQuote = z.infer<typeof fiatQuoteSchema>;

export type GetFiatQuoteInput = {
  /** The wallet currency that will be debited to fund this payout (must be one of the gateway's supported `base_currency` values — e.g. Mexico's SPEI only accepts EUR/USD in, even though it pays out in MXN). */
  fromCurrency: string;
  toCurrency: string;
  /** The payout gateway id (see fiat/paymentMethods.ts) — the payout submission's method must match this if quoteId is passed along. */
  methodId: number;
  /**
   * Amount in `fromCurrency` major units (the debit/wallet side), before fees — confirmed against
   * Yativo's own docs ("The amount field is denominated in from_currency") and against live
   * cross-currency arithmetic (a USD→MXN quote for amount=1000 produced a ~$1021 debit and a
   * ~16,834 MXN receive — i.e. debit ≈ amount + fee, receive ≈ amount × rate — only consistent
   * with amount being the FROM-side figure). This is the SAME convention as payouts.create()'s
   * `amount`, which is also debit-side — they are not opposite conventions.
   */
  amount: number;
};

// Confirmed live: Yativo formats numeric-as-string amounts with thousands-separator commas once
// the value crosses 1000 (e.g. "1,021.00") — invisible in small test amounts, but Number() on a
// comma-containing string silently returns NaN, which then serialized as the literal string
// "NaN" and failed minorAmountSchema's integer regex downstream. Strip commas before any numeric
// string from this endpoint is used.
function cleanNumericString(value: string | number): string {
  return typeof value === "number" ? String(value) : value.replace(/,/g, "");
}

// Confirmed live 2026-09-12 (COP->COP corridor, method_type "payin") — this is a COMPLETELY
// different response shape from the payout quote above, not a subset/superset of it. No
// `calculator`/`payout_data` nesting, no `rate` field (it's `exchange_rate`), and it carries its
// own fee breakdown directly at the top level. `credited_amount` can be NEGATIVE when Yativo's
// fees exceed the deposit amount (observed live: depositing 100 COP produced a -3052.23 credited
// amount) — this must be surfaced to the customer, never clamped or hidden.
const payinExchangeRateDataSchema = z
  .object({
    quote_id: z.string(),
    quote_expire_at: z.string(),
    from_currency: z.string(),
    to_currency: z.string(),
    deposit_amount: z.union([z.string(), z.number()]),
    exchange_rate: z.union([z.string(), z.number()]),
    // Exact composition of these three (fixed vs percentage vs "float") isn't documented anywhere
    // found — only `total_fees` (their sum) is treated as authoritative; the individual
    // breakdown fields are passed through for display only, never relied on arithmetically.
    fixed_fee: z.union([z.string(), z.number()]).optional(),
    float_fee: z.union([z.string(), z.number()]).optional(),
    percentage_fee: z.union([z.string(), z.number()]).optional(),
    total_fees: z.union([z.string(), z.number()]).optional(),
    credited_amount: z.union([z.string(), z.number()]),
  })
  .passthrough();

export const fiatPayinQuoteSchema = z.object({
  quoteId: z.string(),
  fromCurrency: z.string(),
  toCurrency: z.string(),
  /** In `fromCurrency` major units — what the customer pays. */
  depositAmount: z.string(),
  exchangeRate: z.string(),
  /** Yativo's own total fee (fixed + percentage combined), in `toCurrency` (wallet) major units. "0" when Yativo didn't return a total_fees figure at all. */
  totalFees: z.string(),
  /** depositAmount converted to `toCurrency` minus totalFees — the amount that would land in the wallet before this platform's own fee. Can be negative; never clamp this. */
  creditedAmount: z.string(),
  expiresAt: z.string(),
});
export type FiatPayinQuote = z.infer<typeof fiatPayinQuoteSchema>;

export type GetPayinQuoteInput = {
  /** The deposit method's LOCAL currency — what the customer is paying with. */
  fromCurrency: string;
  /** The wallet currency being credited. */
  toCurrency: string;
  /** The payin gateway id. */
  methodId: number;
  /** In `fromCurrency` major units. */
  amount: number;
};

export function createQuotesResource(ctx: YativoContext) {
  return {
    /** For deposits (method_type "payin") — a structurally different response from the payout quote below, see payinExchangeRateDataSchema's comment. */
    async createPayin(input: GetPayinQuoteInput): Promise<FiatPayinQuote> {
      const res = await ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: "/exchange-rate",
        method: "POST",
        headers: { "Idempotency-Key": randomUUID() },
        body: {
          from_currency: input.fromCurrency,
          to_currency: input.toCurrency,
          method_id: input.methodId,
          method_type: "payin",
          amount: input.amount,
        },
        schema: yativoEnvelope(payinExchangeRateDataSchema),
        mockData: {
          status: "success",
          status_code: 200,
          message: "mock",
          data: {
            quote_id: "quote-mock-payin-001",
            quote_expire_at: new Date(Date.now() + 5 * 60_000).toISOString(),
            from_currency: input.fromCurrency,
            to_currency: input.toCurrency,
            deposit_amount: input.amount,
            exchange_rate: 1,
            total_fees: 0,
            credited_amount: input.amount,
          },
        },
      });

      return {
        quoteId: res.data.quote_id,
        fromCurrency: res.data.from_currency,
        toCurrency: res.data.to_currency,
        depositAmount: cleanNumericString(res.data.deposit_amount),
        exchangeRate: cleanNumericString(res.data.exchange_rate),
        totalFees: res.data.total_fees !== undefined ? cleanNumericString(res.data.total_fees) : "0",
        creditedAmount: cleanNumericString(res.data.credited_amount),
        expiresAt: res.data.quote_expire_at,
      };
    },

    /** For payouts (method_type "payout") only — see createPayin above for the structurally different deposit case. */
    async create(input: GetFiatQuoteInput): Promise<FiatQuote> {
      const res = await ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: "/exchange-rate",
        method: "POST",
        headers: { "Idempotency-Key": randomUUID() },
        body: {
          from_currency: input.fromCurrency,
          to_currency: input.toCurrency,
          method_id: input.methodId,
          method_type: "payout",
          amount: input.amount,
        },
        schema: yativoEnvelope(exchangeRateDataSchema),
        mockData: {
          status: "success",
          status_code: 200,
          message: "mock",
          data: {
            quote_id: "quote-mock-001",
            quote_expire_at: new Date(Date.now() + 5 * 60_000).toISOString(),
            rate: "1.00",
            payout_data: { customer_receive_amount: input.amount, customer_total_amount_due: input.amount },
            calculator: { customer_receive_amount: { wallet_currency: input.amount, payout_currency: input.amount }, amount_due: input.amount },
          },
        },
      });

      const receiveAmount = res.data.calculator?.customer_receive_amount?.payout_currency ?? res.data.payout_data?.customer_receive_amount;
      const totalDue = res.data.calculator?.total_amount?.wallet_currency ?? res.data.calculator?.amount_due ?? res.data.payout_data?.customer_total_amount_due;

      return {
        quoteId: res.data.quote_id,
        fromCurrency: input.fromCurrency,
        toCurrency: input.toCurrency,
        methodId: String(input.methodId),
        amount: input.amount,
        rate: cleanNumericString(res.data.rate),
        customerReceiveAmount: receiveAmount !== undefined ? cleanNumericString(receiveAmount) : undefined,
        customerTotalAmountDue: totalDue !== undefined ? cleanNumericString(totalDue) : undefined,
        expiresAt: res.data.quote_expire_at,
      };
    },
  };
}
