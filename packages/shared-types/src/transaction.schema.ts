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

/** Combined "Transaction history" row — customer-scoped, so (unlike the admin list item) it never carries another customer's identity or a platform-side account type. */
export const customerTransactionListItemSchema = ledgerTransactionSchema.extend({
  amountMinor: minorAmountSchema.nullable(),
  currencyCode: currencyCodeSchema.nullable(),
  direction: z.enum(ENTRY_DIRECTIONS).nullable(),
});
export type CustomerTransactionListItem = z.infer<typeof customerTransactionListItemSchema>;

/** One row of a Statement of Account export/email — every row carries its own credit/debit direction plus the running balance immediately after it. */
export const statementDocumentLineSchema = z.object({
  date: z.string(),
  description: z.string(),
  type: z.enum(LEDGER_TRANSACTION_TYPES),
  status: z.enum(LEDGER_TRANSACTION_STATUSES),
  direction: z.enum(ENTRY_DIRECTIONS),
  amountMinor: minorAmountSchema,
  balanceAfterMinor: minorAmountSchema,
});
export type StatementDocumentLine = z.infer<typeof statementDocumentLineSchema>;

export const statementDocumentSchema = z.object({
  currencyCode: currencyCodeSchema,
  decimals: z.number(),
  dateFrom: z.string(),
  dateTo: z.string(),
  openingBalanceMinor: minorAmountSchema,
  closingBalanceMinor: minorAmountSchema,
  lines: z.array(statementDocumentLineSchema),
});
export type StatementDocument = z.infer<typeof statementDocumentSchema>;

export const STATEMENT_FORMATS = ["PDF", "EXCEL"] as const;
export const statementFormatSchema = z.enum(STATEMENT_FORMATS);
export type StatementFormat = z.infer<typeof statementFormatSchema>;

export const exportStatementQuerySchema = z.object({
  format: statementFormatSchema,
  dateFrom: z.string(),
  dateTo: z.string(),
});
export type ExportStatementQuery = z.infer<typeof exportStatementQuerySchema>;

export const emailStatementSchema = z.object({
  format: statementFormatSchema,
  dateFrom: z.string(),
  dateTo: z.string(),
});
export type EmailStatementInput = z.infer<typeof emailStatementSchema>;

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
  /** The platform's own fee, already reflected in amountMinor's debit but broken out here for the receipt. */
  platformFeeMinor: minorAmountSchema,
});
export type TransactionDetailPayout = z.infer<typeof transactionDetailPayoutSchema>;

export const transactionDetailDepositSchema = z.object({
  /**
   * Total fee actually absorbed by the customer (the provider's own cut plus this platform's
   * markup, combined into one figure) — never broken out into pieces client-side. This platform
   * is built on top of a payments provider, but that's an internal implementation detail: the
   * customer should only ever see "you received X, fee was Y", never which portion went where.
   */
  totalFeeMinor: minorAmountSchema,
  currencyCode: currencyCodeSchema,
  /** Human-readable rate/local-amount strings, e.g. "1 USD = 1346.4584 NGN". */
  exchangeRate: z.string().nullable(),
  localCurrency: z.string().nullable(),
  localAmount: z.string().nullable(),
});
export type TransactionDetailDeposit = z.infer<typeof transactionDetailDepositSchema>;

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
  /** Present only when type === "DEPOSIT" and this deposit went through the native gateway flow (not every deposit source populates this). */
  deposit: transactionDetailDepositSchema.nullable(),
});
export type TransactionDetail = z.infer<typeof transactionDetailSchema>;

// ── Admin-only detail — the customer-facing schemas above deliberately combine/hide the
// provider's own cut and identity; this is the one place that breakdown is allowed to surface. ──

export const adminTransactionDetailEntrySchema = z.object({
  accountId: z.string(),
  accountType: z.string(),
  /** null for a platform-side account (settlement, suspense, fee revenue, ...) with no owning customer. */
  customerId: z.string().nullable(),
  customerEmail: z.string().nullable(),
  direction: z.enum(ENTRY_DIRECTIONS),
  amountMinor: minorAmountSchema,
  currencyCode: currencyCodeSchema,
});
export type AdminTransactionDetailEntry = z.infer<typeof adminTransactionDetailEntrySchema>;

export const adminTransactionDetailDepositSchema = z.object({
  yativoDepositId: z.string(),
  grossAmountMinor: minorAmountSchema.nullable(),
  yativoFeeMinor: minorAmountSchema.nullable(),
  platformFeeMinor: minorAmountSchema,
  currencyCode: currencyCodeSchema,
  exchangeRate: z.string().nullable(),
  localCurrency: z.string().nullable(),
  localAmount: z.string().nullable(),
});
export type AdminTransactionDetailDeposit = z.infer<typeof adminTransactionDetailDepositSchema>;

export const adminTransactionDetailPayoutSchema = z.object({
  id: z.string(),
  beneficiaryName: z.string(),
  beneficiaryDetails: z.record(z.unknown()),
  yativoPayoutId: z.string().nullable(),
  amountMinor: minorAmountSchema,
  platformFeeMinor: minorAmountSchema,
  currencyCode: currencyCodeSchema,
});
export type AdminTransactionDetailPayout = z.infer<typeof adminTransactionDetailPayoutSchema>;

export const adminTransactionDetailSchema = z.object({
  id: z.string(),
  type: z.enum(LEDGER_TRANSACTION_TYPES),
  status: z.enum(LEDGER_TRANSACTION_STATUSES),
  description: z.string().nullable(),
  externalRef: z.string().nullable(),
  externalSource: z.enum(LEDGER_EXTERNAL_SOURCES),
  idempotencyKey: z.string(),
  metadata: z.record(z.unknown()).nullable(),
  createdAt: z.string(),
  postedAt: z.string().nullable(),
  reversedAt: z.string().nullable(),
  /** Every entry this transaction touched, across every account — including platform-side ones a customer never sees. */
  entries: z.array(adminTransactionDetailEntrySchema),
  payout: adminTransactionDetailPayoutSchema.nullable(),
  deposit: adminTransactionDetailDepositSchema.nullable(),
});
export type AdminTransactionDetail = z.infer<typeof adminTransactionDetailSchema>;
