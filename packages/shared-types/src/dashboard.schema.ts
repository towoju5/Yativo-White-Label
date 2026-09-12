import { z } from "zod";
import { currencyCodeSchema, minorAmountSchema } from "./money.js";
import { KYC_STATUSES } from "./enums.js";

export const dashboardBalanceByCurrencySchema = z.object({
  currencyCode: currencyCodeSchema,
  decimals: z.number().int(),
  symbol: z.string().nullable(),
  totalAvailableMinor: minorAmountSchema,
  totalPendingMinor: minorAmountSchema,
});

export const configReminderSchema = z.object({
  key: z.string(),
  title: z.string(),
  description: z.string(),
  actionPath: z.string(),
});
export type ConfigReminderDto = z.infer<typeof configReminderSchema>;

export const dashboardSummarySchema = z.object({
  balancesByCurrency: z.array(dashboardBalanceByCurrencySchema),
  customersByKycStatus: z.record(z.enum(KYC_STATUSES), z.number().int()),
  customerCount: z.number().int(),
  pendingPayoutsCount: z.number().int(),
  postedVolumeLast30Days: z.array(
    z.object({ currencyCode: currencyCodeSchema, totalMinor: minorAmountSchema }),
  ),
  /** Admin-actionable "you haven't set this up yet" nudges — SMTP, ops alerts, branding, etc. Empty once everything's configured. */
  configReminders: z.array(configReminderSchema),
});
export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;
