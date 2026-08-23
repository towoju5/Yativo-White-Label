import { z } from "zod";
import type { YativoContext } from "../client.js";
import { cryptoForwardingRuleFixture } from "../fixtures/index.js";

export const cryptoForwardingRuleSchema = z.object({
  ruleId: z.string(),
  destinationAddress: z.string(),
  status: z.string(),
});
export type CryptoForwardingRule = z.infer<typeof cryptoForwardingRuleSchema>;

export function createForwardingRulesResource(ctx: YativoContext) {
  return {
    create(accountId: string, destinationAddress: string): Promise<CryptoForwardingRule> {
      return ctx.request({
        baseUrl: ctx.config.cryptoBaseUrl,
        path: `/accounts/${accountId}/forwarding-rules`,
        method: "POST",
        body: { destinationAddress },
        schema: cryptoForwardingRuleSchema,
        mockData: { ...cryptoForwardingRuleFixture, destinationAddress },
      });
    },
  };
}
