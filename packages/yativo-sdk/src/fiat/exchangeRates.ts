import { z } from "zod";
import type { YativoContext } from "../client.js";
import { yativoEnvelope } from "../client.js";

// Rates are documented as numbers, but every other numeric field on this API has turned up as a
// string at some point (sometimes with thousands commas — see quotes.ts) — accept both.
const rateValueSchema = z.union([z.number(), z.string()]).nullable();

const exchangeRatesDataSchema = z
  .object({
    base: z.string(),
    rates: z.record(z.string(), rateValueSchema),
    updated_at: z.string(),
  })
  .passthrough();

export type FiatExchangeRates = {
  base: string;
  /** 1 `base` = `rate` units of the keyed currency. Null when Yativo has no rate for it right now. */
  rates: Record<string, number | null>;
  updatedAt: string;
};

function toRate(value: number | string | null): number | null {
  if (value === null) return null;
  const n = typeof value === "number" ? value : Number(value.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Fixed mock-mode table — enough currencies that a mock-mode swap between the usual wallets works end to end. */
const MOCK_RATES: Record<string, number> = {
  USD: 1,
  EUR: 0.9187,
  GBP: 0.7891,
  CAD: 1.3712,
  MXN: 18.6024,
  BRL: 5.4321,
  ARS: 1185.5,
  CLP: 941.2,
  COP: 4102.75,
  PEN: 3.7519,
  NGN: 1548.3,
  USDC: 1,
  USDT: 1,
};

export function createExchangeRatesResource(ctx: YativoContext) {
  return {
    /**
     * GET /exchange-rates — indicative market rates for every supported wallet currency, no fees
     * included. Refreshes about once a minute and is rate-limited to ONE call per minute per
     * account (429 + Retry-After beyond that), so callers must cache rather than call per request.
     */
    async list(base = "USD"): Promise<FiatExchangeRates> {
      const res = await ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: "/exchange-rates",
        method: "GET",
        query: { base },
        schema: yativoEnvelope(exchangeRatesDataSchema),
        mockData: {
          status: "success",
          status_code: 200,
          message: "mock",
          data: {
            base,
            rates: Object.fromEntries(Object.entries(MOCK_RATES).map(([code, rate]) => [code, rate / (MOCK_RATES[base] ?? 1)])),
            updated_at: new Date().toISOString(),
          },
        },
      });

      return {
        base: res.data.base,
        rates: Object.fromEntries(Object.entries(res.data.rates).map(([code, rate]) => [code.toUpperCase(), toRate(rate)])),
        updatedAt: res.data.updated_at,
      };
    },
  };
}
