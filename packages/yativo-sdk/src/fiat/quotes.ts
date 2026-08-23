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

export function createQuotesResource(ctx: YativoContext) {
  return {
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
