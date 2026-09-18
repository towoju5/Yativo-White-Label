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
//
// Each entry also carries the currency's display metadata (name/slug/logo/symbol) — this is the
// platform's own live list of which currencies actually have a Yativo wallet, so it doubles as
// the source for which currencies to offer customers (see listBalances/syncCurrenciesFromYativo),
// rather than Yativo's full platform-wide catalog. One entry, slug "usdcc", is the Bluebanc Card
// Wallet used internally to fund cards — not a real customer-facing currency.
const walletBalanceEntrySchema = z
  .object({
    name: z.string(),
    slug: z.string(),
    meta: z
      .object({
        logo: z.string().optional(),
        symbol: z.string().optional(),
        fullname: z.string().optional(),
        precision: z.union([z.string(), z.number()]).optional(),
      })
      .passthrough()
      .optional(),
    currency: z.string(),
    balance: z.union([z.string(), z.number()]),
    decimal_places: z.union([z.string(), z.number()]),
    deleted_at: z.string().nullable().optional(),
  })
  .passthrough();
export type WalletBalanceEntry = z.infer<typeof walletBalanceEntrySchema>;

export function createWalletsResource(ctx: YativoContext) {
  async function fetchAllBalances(): Promise<WalletBalanceEntry[]> {
    const res = await ctx.request({
      baseUrl: ctx.config.fiatBaseUrl,
      path: "/wallet/balance",
      method: "GET",
      schema: yativoEnvelope(z.array(walletBalanceEntrySchema)),
      mockData: {
        status: "success",
        status_code: 200,
        message: "mock",
        data: [
          {
            name: "USD",
            slug: "usd",
            meta: { symbol: "$", fullname: "US Dollar" },
            currency: "USD",
            balance: fiatWalletBalanceFixture.availableMinor,
            decimal_places: 2,
            deleted_at: null,
          },
        ],
      },
    });
    return res.data;
  }

  async function fetchBalance(currencyCode: string): Promise<FiatWalletBalance> {
    const entries = await fetchAllBalances();
    // Matched by slug (unique per wallet), NOT by the `currency` field — multiple entries can
    // share the same `currency` (e.g. the internal "usdcc" Bluebanc Card Wallet is also
    // denominated in "USD"), so matching on `currency` could silently resolve to the wrong
    // wallet's balance depending on response ordering. slug === currencyCode.toLowerCase() always
    // identifies the one real currency wallet unambiguously.
    const entry = entries.find((c) => c.slug === currencyCode.toLowerCase());
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

    /** Every wallet balance entry as Yativo returns it (name, slug, meta, balance) — the platform's live list of which currencies actually have a Yativo wallet. Includes the internal "usdcc" card-funding wallet; callers that build a customer-facing currency list must filter it out themselves. */
    listBalances(): Promise<WalletBalanceEntry[]> {
      return fetchAllBalances();
    },
  };
}
