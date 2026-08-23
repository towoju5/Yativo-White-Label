import { z } from "zod";
import {
  ENTRY_DIRECTIONS,
  LEDGER_EXTERNAL_SOURCES,
  LEDGER_TRANSACTION_STATUSES,
  LEDGER_TRANSACTION_TYPES,
} from "./enums.js";
import { currencyCodeSchema, minorAmountSchema } from "./money.js";

export const ledgerEntryLineSchema = z.object({
  accountId: z.string(),
  direction: z.enum(ENTRY_DIRECTIONS),
  amountMinor: minorAmountSchema,
  currencyCode: currencyCodeSchema,
});
export type LedgerEntryLine = z.infer<typeof ledgerEntryLineSchema>;

export const postTransactionInputSchema = z.object({
  type: z.enum(LEDGER_TRANSACTION_TYPES),
  status: z.enum(["PENDING", "POSTED"]),
  idempotencyKey: z.string().min(1),
  externalSource: z.enum(LEDGER_EXTERNAL_SOURCES),
  externalRef: z.string().optional(),
  description: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  lines: z.array(ledgerEntryLineSchema).min(2),
});
export type PostTransactionInput = z.infer<typeof postTransactionInputSchema>;

export const ledgerTransactionSchema = z.object({
  id: z.string(),
  type: z.enum(LEDGER_TRANSACTION_TYPES),
  status: z.enum(LEDGER_TRANSACTION_STATUSES),
  idempotencyKey: z.string(),
  externalSource: z.enum(LEDGER_EXTERNAL_SOURCES),
  externalRef: z.string().nullable(),
  description: z.string().nullable(),
  metadata: z.record(z.unknown()).nullable(),
  reversalOfId: z.string().nullable(),
  createdAt: z.string(),
  postedAt: z.string().nullable(),
  reversedAt: z.string().nullable(),
});
export type LedgerTransactionDto = z.infer<typeof ledgerTransactionSchema>;

export const statementLineSchema = z.object({
  entryId: z.string(),
  transactionId: z.string(),
  transactionType: z.enum(LEDGER_TRANSACTION_TYPES),
  status: z.enum(LEDGER_TRANSACTION_STATUSES),
  direction: z.enum(ENTRY_DIRECTIONS),
  amountMinor: minorAmountSchema,
  currencyCode: currencyCodeSchema,
  description: z.string().nullable(),
  runningBalanceMinor: minorAmountSchema.optional(),
  createdAt: z.string(),
});
export type StatementLine = z.infer<typeof statementLineSchema>;

/** One entry on a transaction detail, scoped to the customer's own account only (a platform-side counter-account like SUSPENSE_PENDING is never shown to the customer). */
export const transactionDetailEntrySchema = z.object({
  accountType: z.string(),
  direction: z.enum(ENTRY_DIRECTIONS),
  amountMinor: minorAmountSchema,
  currencyCode: currencyCodeSchema,
});
export type TransactionDetailEntry = z.infer<typeof transactionDetailEntrySchema>;

export const transactionDetailPayoutSchema = z.object({
  id: z.string(),
  beneficiaryName: z.string(),
  beneficiaryDetails: z.record(z.unknown()),
  yativoPayoutId: z.string().nullable(),
  amountMinor: minorAmountSchema,
  currencyCode: currencyCodeSchema,
});
export type TransactionDetailPayout = z.infer<typeof transactionDetailPayoutSchema>;

/** Full detail for one transaction — the customer-facing "view details / print receipt" view, for any transaction type (deposit, payout, fee, card top-up, adjustment, ...). */
export const transactionDetailSchema = z.object({
  id: z.string(),
  type: z.enum(LEDGER_TRANSACTION_TYPES),
  status: z.enum(LEDGER_TRANSACTION_STATUSES),
  description: z.string().nullable(),
  /** The provider-side reference — a Yativo deposit id for a DEPOSIT, for example. */
  externalRef: z.string().nullable(),
  externalSource: z.enum(LEDGER_EXTERNAL_SOURCES),
  createdAt: z.string(),
  postedAt: z.string().nullable(),
  reversedAt: z.string().nullable(),
  entries: z.array(transactionDetailEntrySchema),
  /** Present only when type === "PAYOUT". */
  payout: transactionDetailPayoutSchema.nullable(),
});
export type TransactionDetail = z.infer<typeof transactionDetailSchema>;
