import { z } from "zod";
import { currencyCodeSchema, minorAmountSchema } from "./money.js";
import { LEDGER_TRANSACTION_TYPES } from "./enums.js";

/** One row of platform fee revenue for a given transaction type + currency, within the requested date range. */
export const platformProfitByTypeSchema = z.object({
  type: z.enum(LEDGER_TRANSACTION_TYPES),
  currencyCode: currencyCodeSchema,
  amountMinor: minorAmountSchema,
});
export type PlatformProfitByType = z.infer<typeof platformProfitByTypeSchema>;

export const platformProfitTotalSchema = z.object({
  currencyCode: currencyCodeSchema,
  amountMinor: minorAmountSchema,
});
export type PlatformProfitTotal = z.infer<typeof platformProfitTotalSchema>;

export const platformProfitReportSchema = z.object({
  byType: z.array(platformProfitByTypeSchema),
  totalsByCurrency: z.array(platformProfitTotalSchema),
});
export type PlatformProfitReport = z.infer<typeof platformProfitReportSchema>;
