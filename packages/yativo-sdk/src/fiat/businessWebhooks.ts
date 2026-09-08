import { z } from "zod";
import type { YativoContext } from "../client.js";
import { yativoEnvelope } from "../client.js";

const webhookRecordSchema = z.object({
  id: z.string(),
  user_id: z.number().optional(),
  url: z.string(),
  secret: z.string(),
  events: z.string().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type YativoWebhookRecord = { id: string; url: string; secret: string };

/**
 * Webhook management lives under `/v1/business/webhook` — NOT under fiatBaseUrl's `/api/v1`
 * prefix (confirmed against Yativo's webhook guide, e.g. `POST https://api.yativo.com/v1/business/webhook`).
 * Same host as the fiat API, different path, so this derives it from fiatBaseUrl rather than
 * needing its own configured URL.
 */
function businessBaseUrl(fiatBaseUrl: string): string {
  return fiatBaseUrl.replace(/\/api\/v1\/?$/, "/v1");
}

export function createBusinessWebhooksResource(ctx: YativoContext) {
  return {
    /** GET /v1/business/webhook — the account's registered webhook(s), each with its current signing secret. Authenticated with X-Api-Key/X-Api-Secret (sent automatically by ctx.request), NOT a signature check — this is the trusted channel used to confirm a secret rotation is real. */
    async list(): Promise<YativoWebhookRecord[]> {
      const res = await ctx.request({
        baseUrl: businessBaseUrl(ctx.config.fiatBaseUrl),
        path: "/business/webhook",
        method: "GET",
        schema: yativoEnvelope(z.array(webhookRecordSchema)),
        mockData: { status: "success", status_code: 200, message: "mock", data: [] },
      });
      return res.data.map((w) => ({ id: w.id, url: w.url, secret: w.secret }));
    },
  };
}
