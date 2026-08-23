import { z } from "zod";
import type { YativoContext } from "../client.js";
import { cryptoSwapResultFixture } from "../fixtures/index.js";

export const cryptoSwapResultSchema = z.object({
  swapId: z.string(),
  status: z.string(),
});
export type CryptoSwapResult = z.infer<typeof cryptoSwapResultSchema>;

export function createCryptoSwapResource(ctx: YativoContext) {
  return {
    execute(accountId: string, sourceCurrency: string, targetCurrency: string, amountMinor: string): Promise<CryptoSwapResult> {
      return ctx.request({
        baseUrl: ctx.config.cryptoBaseUrl,
        path: "/swap",
        method: "POST",
        body: { accountId, sourceCurrency, targetCurrency, amountMinor },
        schema: cryptoSwapResultSchema,
        mockData: cryptoSwapResultFixture,
      });
    },
  };
}
