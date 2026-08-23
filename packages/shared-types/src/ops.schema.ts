import { z } from "zod";
import { RECONCILIATION_STATUSES, WEBHOOK_PROCESSING_STATUSES } from "./enums.js";
import { currencyCodeSchema, minorAmountSchema } from "./money.js";

export const webhookEventSchema = z.object({
  id: z.string(),
  provider: z.literal("YATIVO"),
  externalEventId: z.string(),
  eventType: z.string(),
  payload: z.record(z.unknown()),
  signatureValid: z.boolean(),
  processingStatus: z.enum(WEBHOOK_PROCESSING_STATUSES),
  errorMessage: z.string().nullable(),
  receivedAt: z.string(),
  processedAt: z.string().nullable(),
});
export type WebhookEventDto = z.infer<typeof webhookEventSchema>;

export const reconciliationReportSchema = z.object({
  id: z.string(),
  currencyCode: currencyCodeSchema,
  accountType: z.string(),
  expectedMinor: minorAmountSchema,
  actualMinor: minorAmountSchema,
  deltaMinor: minorAmountSchema,
  status: z.enum(RECONCILIATION_STATUSES),
  createdAt: z.string(),
});
export type ReconciliationReportDto = z.infer<typeof reconciliationReportSchema>;

export const apiKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  last4: z.string(),
  createdAt: z.string(),
  revokedAt: z.string().nullable(),
});
export type ApiKeyDto = z.infer<typeof apiKeySchema>;

export const createApiKeySchema = z.object({
  name: z.string().min(1),
});
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

export const createApiKeyResultSchema = apiKeySchema.extend({
  plaintextKey: z.string(),
});
export type CreateApiKeyResult = z.infer<typeof createApiKeyResultSchema>;
