import { z } from "zod";
import { currencyCodeSchema, minorAmountSchema } from "./money.js";

export const walletBalanceSchema = z.object({
  walletId: z.string(),
  customerId: z.string(),
  currencyCode: currencyCodeSchema,
  decimals: z.number().int(),
  /** e.g. "$", "₦" — null when this currency wasn't synced with one (see Currency.symbol). */
  symbol: z.string().nullable(),
  availableMinor: minorAmountSchema,
  pendingMinor: minorAmountSchema,
  updatedAt: z.string(),
});
export type WalletBalance = z.infer<typeof walletBalanceSchema>;

export const walletListItemSchema = walletBalanceSchema.extend({
  customerName: z.string().optional(),
});
export type WalletListItem = z.infer<typeof walletListItemSchema>;
