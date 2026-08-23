import { z } from "zod";
import type { YativoContext } from "../client.js";
import { cryptoAccountFixture } from "../fixtures/index.js";

export const cryptoAccountSchema = z.object({
  accountId: z.string(),
  status: z.string(),
});
export type CryptoAccount = z.infer<typeof cryptoAccountSchema>;

export function createAccountsResource(ctx: YativoContext) {
  return {
    getOrCreate(customerId: string): Promise<CryptoAccount> {
      return ctx.request({
        baseUrl: ctx.config.cryptoBaseUrl,
        path: "/accounts",
        method: "POST",
        body: { customerId },
        schema: cryptoAccountSchema,
        mockData: cryptoAccountFixture,
      });
    },
  };
}
