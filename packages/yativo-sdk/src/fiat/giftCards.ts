import { z } from "zod";
import type { YativoContext } from "../client.js";
import { fiatGiftCardFixture } from "../fixtures/index.js";

export const fiatGiftCardSchema = z.object({
  giftCardId: z.string(),
  brand: z.string(),
  amountMinor: z.string(),
  currencyCode: z.string(),
  status: z.string(),
});
export type FiatGiftCard = z.infer<typeof fiatGiftCardSchema>;

export function createGiftCardsResource(ctx: YativoContext) {
  return {
    issue(brand: string, amountMinor: string, currencyCode: string): Promise<FiatGiftCard> {
      return ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: "/gift-cards",
        method: "POST",
        body: { brand, amountMinor, currencyCode },
        schema: fiatGiftCardSchema,
        mockData: { ...fiatGiftCardFixture, brand, amountMinor, currencyCode },
      });
    },
  };
}
