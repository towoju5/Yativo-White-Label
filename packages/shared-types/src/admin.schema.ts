import { z } from "zod";
import { customerSchema } from "./customer.schema.js";
import { walletBalanceSchema } from "./wallet.schema.js";
import { minorAmountSchema, currencyCodeSchema } from "./money.js";
import { ENTRY_DIRECTIONS } from "./enums.js";
import { payoutSchema } from "./payout.schema.js";
import { ledgerTransactionSchema } from "./transaction.schema.js";
import { cardSchema } from "./card.schema.js";

export const customerDetailSchema = customerSchema.extend({
  wallets: z.array(walletBalanceSchema),
});
export type CustomerDetail = z.infer<typeof customerDetailSchema>;

export const rejectKycSchema = z.object({
  reason: z.string().min(1),
});
export type RejectKycInput = z.infer<typeof rejectKycSchema>;

export const adjustWalletSchema = z.object({
  direction: z.enum(ENTRY_DIRECTIONS),
  amountMinor: minorAmountSchema,
  reason: z.string().min(1),
});
export type AdjustWalletInput = z.infer<typeof adjustWalletSchema>;

export const payoutListItemSchema = payoutSchema.extend({
  customerName: z.string().nullable(),
});
export type PayoutListItem = z.infer<typeof payoutListItemSchema>;

export const adminTransactionListItemSchema = ledgerTransactionSchema.extend({
  customerId: z.string().nullable(),
  customerName: z.string().nullable(),
  amountMinor: minorAmountSchema.nullable(),
  currencyCode: currencyCodeSchema.nullable(),
  direction: z.enum(ENTRY_DIRECTIONS).nullable(),
});
export type AdminTransactionListItem = z.infer<typeof adminTransactionListItemSchema>;

export const adminCardListItemSchema = cardSchema.extend({
  customerName: z.string().nullable(),
});
export type AdminCardListItem = z.infer<typeof adminCardListItemSchema>;
