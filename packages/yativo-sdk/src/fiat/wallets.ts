import { z } from "zod";
import type { YativoContext } from "../client.js";
import { yativoEnvelope } from "../client.js";
import { fiatWalletBalanceFixture } from "../fixtures/index.js";

export const fiatWalletBalanceSchema = z.object({
  currencyCode: z.string(),
  availableMinor: z.string(),
  pendingMinor: z.string(),
});
export type FiatWalletBalance = z.infer<typeof fiatWalletBalanceSchema>;

// Confirmed live: GET /wallets/{code}/balance and /wallets/{code}/settlement-balance (this
// resource's original scaffold) both 404 ("could not find a matching route") — there is no
// dedicated settlement-balance endpoint, and no per-currency path variant either. The one real
// endpoint is GET /wallet/balance (singular), which returns every currency's balance at once, as
// a decimal MAJOR-unit string (e.g. "3514.23", sometimes "351423" with no fractional part for a
// round number) — not already in minor units. Reconciliation was comparing this raw major-unit
// string directly against the ledger's minor-unit figures with no conversion, which is the exact
// off-by-10^decimals mismatch reported live.
const walletBalanceEntrySchema = z
  .object({
    currency: z.string(),
    balance: z.union([z.string(), z.number()]),
    decimal_places: z.union([z.string(), z.number()]),
  })
  .passthrough();

export function createWalletsResource(ctx: YativoContext) {
  async function fetchBalance(currencyCode: string): Promise<FiatWalletBalance> {
    const res = await ctx.request({
      baseUrl: ctx.config.fiatBaseUrl,
      path: "/wallet/balance",
      method: "GET",
      schema: yativoEnvelope(z.array(walletBalanceEntrySchema)),
      mockData: {
        status: "success",
        status_code: 200,
        message: "mock",
        data: [{ currency: currencyCode, balance: fiatWalletBalanceFixture.availableMinor, decimal_places: 2 }],
      },
    });
    const entry = res.data.find((c) => c.currency === currencyCode);
    if (!entry) return { currencyCode, availableMinor: "0", pendingMinor: "0" };

    const decimals = Number(entry.decimal_places);
    const majorAmount = Number(String(entry.balance).replace(/,/g, ""));
    const availableMinor = Math.round(majorAmount * 10 ** decimals).toString();
    // The endpoint doesn't distinguish a "pending" figure at this level.
    return { currencyCode, availableMinor, pendingMinor: "0" };
  }

  return {
    /** Balance of the platform's own Yativo-held wallet for a currency (used by reconciliation). */
    getBalance(currencyCode: string): Promise<FiatWalletBalance> {
      return fetchBalance(currencyCode);
    },

    /** No distinct settlement-balance source exists on Yativo's side (confirmed live) — same endpoint as getBalance, kept as a separate method so callers' intent stays legible. */
    getSettlementBalance(currencyCode: string): Promise<FiatWalletBalance> {
      return fetchBalance(currencyCode);
    },
  };
}
