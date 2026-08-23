import { z } from "zod";
import type { YativoContext } from "../client.js";
import { cryptoComplianceCheckFixture } from "../fixtures/index.js";

export const cryptoComplianceCheckSchema = z.object({
  checkId: z.string(),
  status: z.string(),
  riskScore: z.number(),
});
export type CryptoComplianceCheck = z.infer<typeof cryptoComplianceCheckSchema>;

export function createComplianceResource(ctx: YativoContext) {
  return {
    screenAddress(address: string): Promise<CryptoComplianceCheck> {
      return ctx.request({
        baseUrl: ctx.config.cryptoBaseUrl,
        path: "/compliance/screen",
        method: "POST",
        body: { address },
        schema: cryptoComplianceCheckSchema,
        mockData: cryptoComplianceCheckFixture,
      });
    },
  };
}
