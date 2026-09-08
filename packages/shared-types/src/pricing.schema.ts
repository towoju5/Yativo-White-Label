import { z } from "zod";
import { minorAmountSchema } from "./money.js";

export const PRICING_SERVICES = [
  "PAYIN",
  "PAYOUT",
  "VIRTUAL_ACCOUNT_DEPOSIT",
  "CARD_CREATE",
  "CARD_FUND",
  "CARD_WITHDRAW",
  "CARD_TERMINATE",
  "BUSINESS_SPEND_CARD_CREATE",
  "BUSINESS_SPEND_CARD_FUND",
  "BUSINESS_SPEND_CARD_WITHDRAW",
  "BUSINESS_SPEND_CARD_TERMINATE",
  "BUSINESS_SPEND_CARD_ACTIVATE",
  "BUSINESS_SPEND_CARD_SUSPEND",
  "BUSINESS_SPEND_CARD_PIN_UPDATE",
  "BUSINESS_SPEND_CARD_LIMITS_UPDATE",
] as const;
export const pricingServiceSchema = z.enum(PRICING_SERVICES);
export type PricingService = z.infer<typeof pricingServiceSchema>;

export const FEE_TYPES = ["FIXED", "PERCENTAGE", "COMBINED"] as const;
export const feeTypeSchema = z.enum(FEE_TYPES);
export type FeeType = z.infer<typeof feeTypeSchema>;

/** MARKUP adds the configured fee on top of whatever Yativo itself reports as its own fee for that
 * transaction (0 for services where Yativo never reports one — see pricing.service.ts); STANDALONE
 * charges only the configured fee, ignoring Yativo's own cost entirely. */
export const PRICING_MODES = ["STANDALONE", "MARKUP"] as const;
export const pricingModeSchema = z.enum(PRICING_MODES);
export type PricingMode = z.infer<typeof pricingModeSchema>;

const percentageBpsSchema = z.number().int().min(0).max(10000);

export const pricingRuleSchema = z.object({
  service: pricingServiceSchema,
  feeType: feeTypeSchema,
  pricingMode: pricingModeSchema,
  fixedAmountMinor: minorAmountSchema,
  percentageBps: percentageBpsSchema,
  updatedAt: z.string(),
});
export type PricingRule = z.infer<typeof pricingRuleSchema>;

export const updatePricingDefaultSchema = z.object({
  feeType: feeTypeSchema,
  pricingMode: pricingModeSchema,
  fixedAmountMinor: minorAmountSchema,
  percentageBps: percentageBpsSchema,
});
export type UpdatePricingDefaultInput = z.infer<typeof updatePricingDefaultSchema>;

/** One row per PricingService for a specific customer — `source` says whether it's their own override or just the platform default falling through. */
export const customerPricingRuleSchema = z.object({
  service: pricingServiceSchema,
  source: z.enum(["DEFAULT", "OVERRIDE"]),
  feeType: feeTypeSchema,
  pricingMode: pricingModeSchema,
  fixedAmountMinor: minorAmountSchema,
  percentageBps: percentageBpsSchema,
});
export type CustomerPricingRule = z.infer<typeof customerPricingRuleSchema>;

export const upsertPricingOverrideSchema = z.object({
  feeType: feeTypeSchema,
  pricingMode: pricingModeSchema,
  fixedAmountMinor: minorAmountSchema,
  percentageBps: percentageBpsSchema,
});
export type UpsertPricingOverrideInput = z.infer<typeof upsertPricingOverrideSchema>;
