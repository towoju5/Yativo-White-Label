import { z } from "zod";
import type { YativoContext } from "../client.js";
import { fiatSwapRouteFixture, fiatSwapResultFixture } from "../fixtures/index.js";

export const fiatSwapRouteSchema = z.object({
  routeId: z.string(),
  sourceCurrency: z.string(),
  targetCurrency: z.string(),
  rate: z.string(),
});
export type FiatSwapRoute = z.infer<typeof fiatSwapRouteSchema>;

export const fiatSwapResultSchema = z.object({
  swapId: z.string(),
  status: z.string(),
});
export type FiatSwapResult = z.infer<typeof fiatSwapResultSchema>;

export function createSwapsResource(ctx: YativoContext) {
  return {
    getRoute(sourceCurrency: string, targetCurrency: string): Promise<FiatSwapRoute> {
      return ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: "/swaps/route",
        method: "GET",
        query: { sourceCurrency, targetCurrency },
        schema: fiatSwapRouteSchema,
        mockData: { ...fiatSwapRouteFixture, sourceCurrency, targetCurrency },
      });
    },

    execute(routeId: string, amountMinor: string): Promise<FiatSwapResult> {
      return ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: "/swaps",
        method: "POST",
        body: { routeId, amountMinor },
        schema: fiatSwapResultSchema,
        mockData: fiatSwapResultFixture,
      });
    },
  };
}
