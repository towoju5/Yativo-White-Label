import { z } from "zod";
import type { YativoContext } from "../client.js";
import { yativoEnvelope } from "../client.js";

const virtualAccountDataSchema = z
  .object({
    account_id: z.string(),
    currency: z.string(),
    // Wildly inconsistent across corridors in practice: `[]` on a freshly-created
    // account, `null`, a flat object, or an object with nested sub-objects (e.g.
    // an `address` field) — accept anything and flatten defensively below.
    account_info: z.record(z.unknown()).or(z.array(z.unknown())).nullable().optional(),
  })
  .passthrough();

/**
 * Flattened to `accountId` + `currencyCode` + whatever fields Yativo returned
 * in `account_info` (these vary a lot by country/rail — bank account number,
 * PIX key, IBAN, etc.) — all stringified so the frontend can render them
 * generically without knowing the corridor's shape up front.
 */
export const fiatVirtualAccountSchema = z.record(z.string());
export type FiatVirtualAccount = z.infer<typeof fiatVirtualAccountSchema>;

function flatten(data: z.infer<typeof virtualAccountDataSchema>): FiatVirtualAccount {
  const info = Array.isArray(data.account_info) || data.account_info == null ? {} : data.account_info;
  const flat: Record<string, string> = { accountId: data.account_id, currencyCode: data.currency };
  for (const [key, value] of Object.entries(info)) {
    if (value === null || value === undefined) continue;
    flat[key] = typeof value === "object" ? JSON.stringify(value) : String(value);
  }
  return flat;
}

const currencyEndorsementSchema = z.object({ currency: z.string(), endorsement: z.string().nullable() });
export type FiatVirtualAccountCurrency = z.infer<typeof currencyEndorsementSchema>;

export function createVirtualAccountsResource(ctx: YativoContext) {
  async function listForCustomer(yativoCustomerId: string): Promise<FiatVirtualAccount[]> {
    const res = await ctx.request({
      baseUrl: ctx.config.fiatBaseUrl,
      path: `/business/virtual-account/customer/accounts/${yativoCustomerId}`,
      method: "GET",
      schema: yativoEnvelope(z.array(virtualAccountDataSchema)),
      mockData: { status: "success", status_code: 200, message: "mock", data: [] },
    });
    return res.data.map(flatten);
  }

  return {
    listForCustomer,

    /** Currencies this business can issue deposit virtual accounts for, with their rail/endorsement. */
    async listSupportedCurrencies(): Promise<FiatVirtualAccountCurrency[]> {
      const res = await ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: "/business/virtual-account/currencies-and-endorsements",
        method: "GET",
        schema: yativoEnvelope(z.array(currencyEndorsementSchema)),
        mockData: {
          status: "success",
          status_code: 200,
          message: "mock",
          data: [{ currency: "USD", endorsement: "faster_payments" }],
        },
      });
      return res.data;
    },

    /** Fetches the customer's existing deposit virtual account for a currency, provisioning a new one if none exists. */
    async getOrCreate(yativoCustomerId: string, currencyCode: string): Promise<FiatVirtualAccount> {
      const existing = await listForCustomer(yativoCustomerId);
      const match = existing.find((a) => a.currencyCode === currencyCode);
      if (match) return match;

      const res = await ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: "/business/virtual-account/create",
        method: "POST",
        // Deterministic, not random — a customer only ever needs one VA per currency, so a retry
        // of this exact create naturally reuses the same key and Yativo can dedupe it.
        headers: { "Idempotency-Key": `va:${yativoCustomerId}:${currencyCode}` },
        body: { customer_id: yativoCustomerId, currency: currencyCode },
        schema: yativoEnvelope(virtualAccountDataSchema),
        mockData: {
          status: "success",
          status_code: 200,
          message: "mock",
          data: {
            account_id: "mock-account-id",
            currency: currencyCode,
            account_info: { accountNumber: "8801234567", bankName: "Yativo Partner Bank (Mock)" },
          },
        },
      });
      return flatten(res.data);
    },
  };
}
