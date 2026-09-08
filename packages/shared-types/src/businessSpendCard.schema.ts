import { z } from "zod";
import { BUSINESS_SPEND_CARD_STATUSES, CARD_TYPES } from "./enums.js";
import { minorAmountSchema } from "./money.js";

// Business Spend Card — a separate product from card.schema.ts's virtual card (different Yativo
// product, one cardholder per card, business customers only). Every card object here only ever
// carries a masked PAN — this product never returns a raw card number/CVV anywhere.

export const businessSpendCardSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  yativoCardId: z.string(),
  issuanceType: z.enum(CARD_TYPES),
  status: z.enum(BUSINESS_SPEND_CARD_STATUSES),
  maskedPan: z.string().nullable(),
  expirationDate: z.string().nullable(),
  createdAt: z.string(),
});
export type BusinessSpendCardDto = z.infer<typeof businessSpendCardSchema>;

export const issueBusinessSpendCardSchema = z.object({
  customerId: z.string(),
  cardType: z.enum(CARD_TYPES).default("VIRTUAL"),
});
export type IssueBusinessSpendCardInput = z.infer<typeof issueBusinessSpendCardSchema>;

export const portalIssueBusinessSpendCardSchema = z.object({ cardType: z.enum(CARD_TYPES).default("VIRTUAL") });
export type PortalIssueBusinessSpendCardInput = z.infer<typeof portalIssueBusinessSpendCardSchema>;

export const BUSINESS_SPEND_CARD_WALLET_ACTIONS = ["fund", "withdraw"] as const;
export const businessSpendCardWalletActionSchema = z.object({
  action: z.enum(BUSINESS_SPEND_CARD_WALLET_ACTIONS),
  amountMinor: minorAmountSchema,
});
export type BusinessSpendCardWalletActionInput = z.infer<typeof businessSpendCardWalletActionSchema>;

/** Result of a wallet action — `cardEmptied`/`cardTerminated`/`terminationError` only ever populated for `withdraw`; see the integration guide's §3 for why a card auto-terminates when a withdrawal empties it, and why that termination can itself fail independently of the withdrawal. */
export const businessSpendCardWalletActionResultSchema = z.object({
  card: businessSpendCardSchema,
  cardEmptied: z.boolean().optional(),
  cardTerminated: z.boolean().optional(),
  terminationError: z.string().nullable().optional(),
});
export type BusinessSpendCardWalletActionResult = z.infer<typeof businessSpendCardWalletActionResultSchema>;

export const BUSINESS_SPEND_CARD_STATUS_ACTIONS = ["activate", "suspend", "terminate"] as const;
export const businessSpendCardStatusActionSchema = z.object({
  action: z.enum(BUSINESS_SPEND_CARD_STATUS_ACTIONS),
});
export type BusinessSpendCardStatusActionInput = z.infer<typeof businessSpendCardStatusActionSchema>;

export const businessSpendCardPinSchema = z.object({
  pin: z.string().min(4).max(6),
  reasonCode: z.string().optional(),
  comment: z.string().optional(),
});
export type BusinessSpendCardPinInput = z.infer<typeof businessSpendCardPinSchema>;

export const BUSINESS_SPEND_CARD_LIMIT_TIME_UNITS = ["TranAmount", "Daily", "Weekly", "Monthly", "Quarterly", "Yearly", "Lifetime"] as const;
export const BUSINESS_SPEND_CARD_LIMIT_OPERATIONS = ["SPENDINGLIMIT", "CASHLIMIT", "LOADLIMIT"] as const;

export const businessSpendCardLimitSchema = z.object({
  amountLimit: z.number().min(1).max(10000),
  timeUnit: z.enum(BUSINESS_SPEND_CARD_LIMIT_TIME_UNITS),
  operationName: z.enum(BUSINESS_SPEND_CARD_LIMIT_OPERATIONS),
});
export type BusinessSpendCardLimit = z.infer<typeof businessSpendCardLimitSchema>;

export const businessSpendCardLimitsSchema = z.object({
  limits: z.array(businessSpendCardLimitSchema).min(1),
});
export type BusinessSpendCardLimitsInput = z.infer<typeof businessSpendCardLimitsSchema>;

export const businessSpendCardTransactionSchema = z.object({
  txnGuid: z.string().optional(),
  yativoCardId: z.string().optional(),
  txnDate: z.string().optional(),
  description: z.string().optional(),
  amount: z.string().optional(),
  currency: z.string().optional(),
  status: z.string().optional(),
  /** Anything the issuer sent that isn't modeled above — passed through as-is. */
  raw: z.record(z.unknown()),
});
export type BusinessSpendCardTransaction = z.infer<typeof businessSpendCardTransactionSchema>;

export const adminBusinessSpendCardListItemSchema = businessSpendCardSchema.extend({
  customerName: z.string().nullable(),
});
export type AdminBusinessSpendCardListItem = z.infer<typeof adminBusinessSpendCardListItemSchema>;
