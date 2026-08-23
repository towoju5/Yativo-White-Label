import { z } from "zod";
import type { YativoContext } from "../client.js";
import { cryptoCardFixture } from "../fixtures/index.js";

export const cryptoCardResultSchema = z.object({
  yativoCardId: z.string(),
  network: z.string(),
  last4: z.string(),
  status: z.string(),
});
export type CryptoCardResult = z.infer<typeof cryptoCardResultSchema>;

export function createCryptoCardsResource(ctx: YativoContext) {
  return {
    issue(accountId: string, currencyCode: string): Promise<CryptoCardResult> {
      return ctx.request({
        baseUrl: ctx.config.cryptoBaseUrl,
        path: "/cards",
        method: "POST",
        body: { accountId, currencyCode },
        schema: cryptoCardResultSchema,
        mockData: cryptoCardFixture,
      });
    },

    freeze(yativoCardId: string): Promise<CryptoCardResult> {
      return ctx.request({
        baseUrl: ctx.config.cryptoBaseUrl,
        path: `/cards/${yativoCardId}/freeze`,
        method: "POST",
        schema: cryptoCardResultSchema,
        mockData: { ...cryptoCardFixture, status: "FROZEN" },
      });
    },
  };
}
