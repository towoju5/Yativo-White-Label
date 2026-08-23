import { z } from "zod";
import type { YativoContext } from "../client.js";
import { cryptoGatewayFixture } from "../fixtures/index.js";

export const cryptoGatewaySchema = z.object({
  gatewayId: z.string(),
  depositAddress: z.string(),
  network: z.string(),
});
export type CryptoGateway = z.infer<typeof cryptoGatewaySchema>;

export function createGatewayResource(ctx: YativoContext) {
  return {
    getOrCreateDepositAddress(accountId: string, network: string): Promise<CryptoGateway> {
      return ctx.request({
        baseUrl: ctx.config.cryptoBaseUrl,
        path: `/accounts/${accountId}/gateway`,
        method: "POST",
        body: { network },
        schema: cryptoGatewaySchema,
        mockData: { ...cryptoGatewayFixture, network },
      });
    },
  };
}
