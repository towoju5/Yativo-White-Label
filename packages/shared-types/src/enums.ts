export const ACCOUNT_TYPES = [
  "CUSTOMER_WALLET",
  "PLATFORM_FEE_REVENUE",
  "YATIVO_SETTLEMENT",
  "YATIVO_CLEARING",
  "SUSPENSE_PENDING",
  "PLATFORM_RESERVE",
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const LEDGER_TRANSACTION_TYPES = [
  "DEPOSIT",
  "PAYOUT",
  "SWAP",
  "CARD_TOPUP",
  "CARD_WITHDRAWAL",
  "FEE",
  "REFUND",
  "CHARGEBACK",
  "ADJUSTMENT",
  "TRANSFER",
] as const;
export type LedgerTransactionType = (typeof LEDGER_TRANSACTION_TYPES)[number];

export const LEDGER_TRANSACTION_STATUSES = ["PENDING", "POSTED", "REVERSED"] as const;
export type LedgerTransactionStatus = (typeof LEDGER_TRANSACTION_STATUSES)[number];

/**
 * The customer/admin-facing status vocabulary for any transaction (deposit, payout, card funding,
 * swap, ...), derived server-side from the raw 3-value LEDGER_TRANSACTION_STATUSES plus whether an
 * external submission/settlement actually happened — see deriveFriendlyStatus in the API's
 * ledger module. Every list/detail DTO shown to a person uses this instead of the raw enum:
 * - PENDING: a hold exists but hasn't been sent to the external system yet.
 * - PROCESSING: sent to the external system (Yativo, a card processor, ...), awaiting confirmation.
 * - FAILED: a hold was released without ever succeeding.
 * - REVERSED: this transaction DID succeed at some point, and that success was later undone
 *   (a refund, chargeback, or manual admin reversal) — never used for something that just failed.
 * - SUCCESS: posted and final.
 */
export const FRIENDLY_TRANSACTION_STATUSES = ["PENDING", "PROCESSING", "FAILED", "REVERSED", "SUCCESS"] as const;
export type FriendlyTransactionStatus = (typeof FRIENDLY_TRANSACTION_STATUSES)[number];

export const LEDGER_EXTERNAL_SOURCES = ["YATIVO_WEBHOOK", "MANUAL", "SYSTEM"] as const;
export type LedgerExternalSource = (typeof LEDGER_EXTERNAL_SOURCES)[number];

export const ENTRY_DIRECTIONS = ["DEBIT", "CREDIT"] as const;
export type EntryDirection = (typeof ENTRY_DIRECTIONS)[number];

export const CUSTOMER_TYPES = ["INDIVIDUAL", "BUSINESS"] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export const CUSTOMER_STATUSES = ["ACTIVE", "FROZEN"] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export const KYC_STATUSES = ["NOT_STARTED", "PENDING", "APPROVED", "REJECTED"] as const;
export type KycStatus = (typeof KYC_STATUSES)[number];

export const CUSTOMER_SOURCES = ["SIGNUP", "IMPORTED"] as const;
export type CustomerSource = (typeof CUSTOMER_SOURCES)[number];

export const CUSTOMER_IMPORT_STATUSES = ["RUNNING", "COMPLETED", "FAILED"] as const;
export type CustomerImportStatus = (typeof CUSTOMER_IMPORT_STATUSES)[number];

export const STAFF_ROLES = ["OWNER", "ADMIN", "STAFF"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const WEBHOOK_PROCESSING_STATUSES = ["PENDING", "PROCESSED", "FAILED", "IGNORED"] as const;
export type WebhookProcessingStatus = (typeof WEBHOOK_PROCESSING_STATUSES)[number];

export const RECONCILIATION_STATUSES = ["MATCH", "MISMATCH"] as const;
export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number];

export const CARD_STATUSES = ["ACTIVE", "FROZEN", "CLOSED"] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];

export const CARD_TYPES = ["VIRTUAL", "PHYSICAL"] as const;
export type CardType = (typeof CARD_TYPES)[number];

export const BUSINESS_SPEND_CARD_STATUSES = ["ACTIVE", "SUSPENDED", "TERMINATED"] as const;
export type BusinessSpendCardStatus = (typeof BUSINESS_SPEND_CARD_STATUSES)[number];

export const TEMPLATE_IDS = ["nova", "atlas", "meridian", "prime", "aurora"] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];
