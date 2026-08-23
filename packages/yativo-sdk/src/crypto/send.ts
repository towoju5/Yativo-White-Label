import { z } from "zod";
import type { YativoContext } from "../client.js";
import { cryptoSendResultFixture } from "../fixtures/index.js";

export const cryptoSendResultSchema = z.object({
  sendId: z.string(),
  status: z.string(),
  txHash: z.string(),
});
export type CryptoSendResult = z.infer<typeof cryptoSendResultSchema>;

export type CryptoSendInput = {
  accountId: string;
  currencyCode: string;
  amountMinor: string;
  destinationAddress: string;
  idempotencyKey: string;
};

export function createSendResource(ctx: YativoContext) {
  return {
    send(input: CryptoSendInput): Promise<CryptoSendResult> {
      return ctx.request({
        baseUrl: ctx.config.cryptoBaseUrl,
        path: "/send",
        method: "POST",
        body: input,
        schema: cryptoSendResultSchema,
        mockData: cryptoSendResultFixture,
      });
    },
  };
}
