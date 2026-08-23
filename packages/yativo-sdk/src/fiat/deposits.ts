import { z } from "zod";
import type { YativoContext } from "../client.js";
import { yativoEnvelope } from "../client.js";

// Confirmed against the live API (gateway "SPEI", MEX): the response is much richer than the
// docs show — `deposit_data.currency` is the gateway's LOCAL currency (confusingly, not what
// the field name suggests) while `deposit_data.deposit_currency` is the wallet/target currency;
// `payment_info` (when present) carries a human-readable fee breakdown. Some gateways/modes may
// omit `payment_info` entirely, so every field here is treated as optional.
const depositDataSchema = z
  .object({
    deposit_url: z.string().optional(),
    deposit_data: z
      .object({
        id: z.union([z.string(), z.number()]).optional(),
        currency: z.string().optional(),
        deposit_currency: z.string().optional(),
        amount: z.union([z.string(), z.number()]).optional(),
        receive_amount: z.union([z.string(), z.number()]).optional(),
      })
      .passthrough()
      .optional(),
    payment_info: z
      .object({
        exchange_rate: z.string().optional(),
        transaction_fee: z.string().optional(),
        estimate_delivery_time: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const fiatDepositResultSchema = z.object({
  depositUrl: z.string().nullable(),
  depositId: z.string().nullable(),
  localCurrency: z.string().nullable(),
  localAmount: z.string().nullable(),
  walletCurrencyCode: z.string().nullable(),
  receiveAmount: z.string().nullable(),
  exchangeRate: z.string().nullable(),
  transactionFee: z.string().nullable(),
  estimatedDelivery: z.string().nullable(),
});
export type FiatDepositResult = z.infer<typeof fiatDepositResultSchema>;

export type CreateFiatDepositInput = {
  yativoCustomerId: string;
  /** Payin gateway id for the chosen country/rail — see fiat/paymentMethods.ts listPayinMethodsByCountry(). */
  gatewayId: string;
  /** Wallet currency to credit (e.g. "USD") — confirmed live this is currently restricted to whichever currencies the business's deposit product is enabled for; Yativo returns a clear "Supported deposit wallets are: X" error if not. */
  walletCurrencyCode: string;
  /** Amount in the GATEWAY's local currency's major unit (e.g. pesos, not centavos) — not the wallet currency. */
  amount: number;
  /**
   * Flat, dot-notation values for the chosen method's form fields (e.g. "payer.type": "INDIVIDUAL")
   * — confirmed live these are sent as top-level body keys, NOT nested under a payment_data
   * object like beneficiaries. Omit entirely for methods with no formFields.
   */
  extraData?: Record<string, string>;
  returnUrl: string;
  /**
   * Unlike the other resources' idempotency keys, this one is expected to be fresh per call —
   * each "initiate a deposit" click is a deliberate new request, not a retry of a prior one.
   */
  idempotencyKey: string;
};

export function createDepositsResource(ctx: YativoContext) {
  return {
    async create(input: CreateFiatDepositInput): Promise<FiatDepositResult> {
      const res = await ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: "/wallet/deposits/new",
        method: "POST",
        headers: { "Idempotency-Key": input.idempotencyKey },
        body: {
          gateway: input.gatewayId,
          amount: input.amount,
          currency: input.walletCurrencyCode,
          customer_id: input.yativoCustomerId,
          redirect_url: input.returnUrl,
          ...input.extraData,
        },
        schema: yativoEnvelope(depositDataSchema),
        mockData: {
          status: "success",
          status_code: 200,
          message: "mock",
          data: {
            deposit_url: "https://sandbox.yativo.com/mock-checkout",
            deposit_data: { id: "deposit-mock-001", currency: "MXN", deposit_currency: "USD", amount: 100, receive_amount: 5.8 },
            payment_info: { exchange_rate: "1 USD = 17.2 MXN", transaction_fee: "3.4 MXN", estimate_delivery_time: "1 Day(s)" },
          },
        },
      });
      return {
        depositUrl: res.data.deposit_url ?? null,
        depositId: res.data.deposit_data?.id ? String(res.data.deposit_data.id) : null,
        localCurrency: res.data.deposit_data?.currency ?? null,
        localAmount: res.data.deposit_data?.amount != null ? String(res.data.deposit_data.amount) : null,
        walletCurrencyCode: res.data.deposit_data?.deposit_currency ?? null,
        receiveAmount: res.data.deposit_data?.receive_amount != null ? String(res.data.deposit_data.receive_amount) : null,
        exchangeRate: res.data.payment_info?.exchange_rate ?? null,
        transactionFee: res.data.payment_info?.transaction_fee ?? null,
        estimatedDelivery: res.data.payment_info?.estimate_delivery_time ?? null,
      };
    },
  };
}
