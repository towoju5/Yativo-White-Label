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

/** One entry from Yativo's live GET /wallet/balance — the platform's own Yativo-held wallets, admin-only (includes the internal "usdcc" card-funding wallet, which customer-facing screens never see). */
export const yativoWalletBalanceSchema = z.object({
  name: z.string(),
  slug: z.string(),
  currency: z.string(),
  symbol: z.string().nullable(),
  logoUrl: z.string().nullable(),
  balance: z.string(),
  decimalPlaces: z.number(),
});
export type YativoWalletBalance = z.infer<typeof yativoWalletBalanceSchema>;
