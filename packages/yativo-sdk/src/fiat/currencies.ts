import { z } from "zod";
import type { YativoContext } from "../client.js";
import { yativoEnvelope } from "../client.js";

const currencyDataSchema = z
  .object({
    wallet: z.string(),
    currency_name: z.string(),
    currency_full_name: z.string().optional(),
    currency_icon: z.string().optional(),
    decimal_places: z.union([z.string(), z.number()]),
    balance_type: z.string().optional(),
    logo_url: z.string().nullable().optional(),
    currency_country: z.string().nullable().optional(),
    is_active: z.boolean().optional(),
  })
  .passthrough();

export type FiatCurrency = {
  code: string;
  name: string;
  symbol: string | null;
  decimals: number;
  isFiat: boolean;
  logoUrl: string | null;
  countryCode: string | null;
  isActive: boolean;
};

function toFiatCurrency(data: z.infer<typeof currencyDataSchema>): FiatCurrency {
  return {
    code: data.wallet,
    name: data.currency_full_name ?? data.currency_name,
    symbol: data.currency_icon ?? null,
    decimals: Number(data.decimal_places),
    isFiat: (data.balance_type ?? "fiat") === "fiat",
    logoUrl: data.logo_url ?? null,
    countryCode: data.currency_country ?? null,
    isActive: data.is_active ?? true,
  };
}

export function createCurrenciesResource(ctx: YativoContext) {
  return {
    /** Every currency Yativo supports platform-wide — the authoritative source for the local Currency table (see admin's "sync currencies" action). */
    async listAll(): Promise<FiatCurrency[]> {
      const res = await ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: "/currencies/all",
        method: "GET",
        schema: yativoEnvelope(z.array(currencyDataSchema)),
        mockData: {
          status: "success",
          status_code: 200,
          message: "mock",
          data: [{ wallet: "USD", currency_name: "US Dollar", currency_full_name: "United States Dollar", currency_icon: "$", decimal_places: "2", is_active: true }],
        },
      });
      return res.data.map(toFiatCurrency);
    },
  };
}
