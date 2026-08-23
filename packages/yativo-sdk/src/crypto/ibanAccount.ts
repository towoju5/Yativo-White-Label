import { z } from "zod";
import type { YativoContext } from "../client.js";
import { cryptoIbanAccountFixture } from "../fixtures/index.js";

export const cryptoIbanAccountSchema = z.object({
  iban: z.string(),
  bic: z.string(),
  accountHolderName: z.string(),
});
export type CryptoIbanAccount = z.infer<typeof cryptoIbanAccountSchema>;

export function createIbanAccountResource(ctx: YativoContext) {
  return {
    getOrCreate(accountId: string): Promise<CryptoIbanAccount> {
      return ctx.request({
        baseUrl: ctx.config.cryptoBaseUrl,
        path: `/accounts/${accountId}/iban`,
        method: "POST",
        schema: cryptoIbanAccountSchema,
        mockData: cryptoIbanAccountFixture,
      });
    },
  };
}
