import type { AccountType, LedgerExternalSource, LedgerTransactionType, EntryDirection } from "@prisma/client";

export type EntryLine = {
  accountId: string;
  direction: EntryDirection;
  amountMinor: bigint;
  currencyCode: string;
};

export type PostTransactionInput = {
  type: LedgerTransactionType;
  status: "PENDING" | "POSTED";
  idempotencyKey: string;
  externalSource: LedgerExternalSource;
  externalRef?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  reversalOfId?: string;
  lines: EntryLine[];
  /**
   * Account ids (must be CUSTOMER_WALLET accounts already touched by `lines`)
   * whose available balance must not go negative as a result of this
   * posting. Checked *after* insert, still inside the same locked
   * transaction — so under concurrent postings on the same account, the
   * second transaction blocks on the row lock until the first commits, then
   * sees the first's effect and is correctly rejected (rolled back) if it
   * would overdraw. Without this, a balance check done before opening the
   * transaction is a time-of-check-to-time-of-use race: two concurrent
   * requests can both read a sufficient balance and both post.
   */
  enforceNonNegativeOn?: string[];
};

// Normal balance side per account type — the direction that *increases* the
// account. CUSTOMER_WALLET and SUSPENSE_PENDING are liability-like (the
// platform owes this out), so they grow on CREDIT; the Yativo-facing
// settlement/clearing/reserve accounts are asset-like and grow on DEBIT.
export const ACCOUNT_NORMAL_BALANCE: Record<AccountType, EntryDirection> = {
  CUSTOMER_WALLET: "CREDIT",
  PLATFORM_FEE_REVENUE: "CREDIT",
  SUSPENSE_PENDING: "CREDIT",
  YATIVO_SETTLEMENT: "DEBIT",
  YATIVO_CLEARING: "DEBIT",
  PLATFORM_RESERVE: "DEBIT",
};
