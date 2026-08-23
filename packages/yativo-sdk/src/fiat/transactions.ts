import { z } from "zod";
import type { YativoContext } from "../client.js";
import { fiatTransactionFixture } from "../fixtures/index.js";

export const fiatTransactionSchema = z.object({
  yativoTransactionId: z.string(),
  status: z.string(),
  amountMinor: z.string(),
  currencyCode: z.string(),
});
export type FiatTransaction = z.infer<typeof fiatTransactionSchema>;

export function createTransactionsResource(ctx: YativoContext) {
  return {
    get(yativoTransactionId: string): Promise<FiatTransaction> {
      return ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: `/transactions/${yativoTransactionId}`,
        method: "GET",
        schema: fiatTransactionSchema,
        mockData: fiatTransactionFixture,
      });
    },
  };
}
