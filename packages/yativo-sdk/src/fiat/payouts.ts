import { z } from "zod";
import type { YativoContext } from "../client.js";
import { yativoEnvelope } from "../client.js";

// Confirmed against the live API: POST /payout/simple and GET /payout/fetch/{id} don't return
// identical shapes. Fetch uses `send_amount` (target-currency amount) + `debit_amount`, and
// `currency` there is the PAYOUT currency, not the debit currency. Simple's create response also
// returns a `target_amount` and `fees` — but as rich nested objects (a fee breakdown, not a
// flat scalar/map), not the flat shape implied by the docs — so both are parsed permissively and
// only surfaced when they resolve to something simple enough to be useful.
const payoutDataSchema = z
  .object({
    transaction_id: z.union([z.string(), z.number()]).optional(),
    payout_id: z.union([z.string(), z.number()]).optional(),
    id: z.union([z.string(), z.number()]).optional(),
    status: z.string().optional(),
    debit_amount: z.union([z.string(), z.number()]).optional(),
    send_amount: z.union([z.string(), z.number()]).optional(),
    target_amount: z.unknown().optional(),
    currency: z.string().optional(),
    fees: z.unknown().optional(),
    processed_at: z.string().optional(),
  })
  .passthrough();

export const fiatPayoutResultSchema = z.object({
  yativoPayoutId: z.string(),
  transactionId: z.string().optional(),
  status: z.string(),
  debitAmount: z.string().optional(),
  /** The requested amount in the payout (target) currency — not present on every response shape. */
  targetAmount: z.string().optional(),
  /** The payout currency (e.g. "MXN"), not the debit wallet currency. */
  currency: z.string().optional(),
  processedAt: z.string().optional(),
});
export type FiatPayoutResult = z.infer<typeof fiatPayoutResultSchema>;

function scalarToString(value: unknown): string | undefined {
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function toPayoutResult(data: z.infer<typeof payoutDataSchema>): FiatPayoutResult {
  const id = data.payout_id ?? data.id;
  if (id === undefined) throw new Error("Yativo payout response missing payout_id");
  return {
    yativoPayoutId: String(id),
    transactionId: data.transaction_id !== undefined ? String(data.transaction_id) : undefined,
    status: data.status ?? "pending",
    debitAmount: data.debit_amount !== undefined ? String(data.debit_amount) : undefined,
    targetAmount: data.send_amount !== undefined ? String(data.send_amount) : scalarToString(data.target_amount),
    currency: data.currency,
    processedAt: data.processed_at,
  };
}

export type CreateFiatPayoutInput = {
  idempotencyKey: string;
  /** Currency to debit from the Yativo wallet, e.g. "USD". */
  debitWallet: string;
  /** Amount in the currency's major unit (e.g. dollars, not cents). */
  amount: number;
  /**
   * The beneficiary's Yativo payment-method id (fiat/beneficiaries.ts create()). Sent as both
   * `payment_method_id` and `beneficiary_details_id` — Yativo reads these through two different
   * internal layers, and sending mismatched values charges one payout method's limits while
   * recording the payout against a different one. ALWAYS the same id.
   */
  beneficiaryPaymentMethodId: string;
  /** Locks the rate from quotes.create() — if set, this payout's beneficiary gateway must match the quote's methodId. */
  quoteId?: string;
  /**
   * Required when the resolved gateway is avenia/tazapays; the API exposes no field to identify
   * which gateway a payout method resolves to ahead of time, so callers should just always send
   * this — it's harmless (ignored) on every other gateway.
   */
  yativoCustomerId?: string;
};

export function createPayoutsResource(ctx: YativoContext) {
  return {
    async create(input: CreateFiatPayoutInput): Promise<FiatPayoutResult> {
      const res = await ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: "/payout/simple",
        method: "POST",
        headers: { "Idempotency-Key": input.idempotencyKey },
        body: {
          amount: input.amount,
          debit_wallet: input.debitWallet,
          payment_method_id: input.beneficiaryPaymentMethodId,
          beneficiary_details_id: input.beneficiaryPaymentMethodId,
          quote_id: input.quoteId,
          customer_id: input.yativoCustomerId,
        },
        schema: yativoEnvelope(payoutDataSchema),
        mockData: {
          status: "success",
          status_code: 201,
          message: "mock",
          data: {
            transaction_id: `txn-mock-${input.idempotencyKey}`,
            payout_id: `payout-mock-${input.idempotencyKey}`,
            status: "pending",
            debit_amount: input.amount,
            target_amount: input.amount,
            currency: input.debitWallet,
            fees: {},
            processed_at: new Date().toISOString(),
          },
        },
      });
      return toPayoutResult(res.data);
    },

    /** Live status for a submitted payout — poll until it leaves "pending". */
    async getStatus(yativoPayoutId: string): Promise<FiatPayoutResult> {
      const res = await ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: `/payout/fetch/${yativoPayoutId}`,
        method: "GET",
        schema: yativoEnvelope(payoutDataSchema),
        mockData: {
          status: "success",
          status_code: 200,
          message: "mock",
          data: { payout_id: yativoPayoutId, status: "completed" },
        },
      });
      return toPayoutResult(res.data);
    },
  };
}
