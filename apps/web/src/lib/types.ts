export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * The bare `LedgerTransactionDto` journal header has no single amount/currency
 * (that lives on its `LedgerEntry` lines). The admin ledger browser endpoint
 * is expected to return a joined/denormalized view for display purposes —
 * these fields are optional so the UI degrades gracefully either way.
 */
export interface AdminTransactionRow {
  id: string;
  type: string;
  status: string;
  description: string | null;
  externalSource: string;
  externalRef: string | null;
  createdAt: string;
  amountMinor?: string;
  currencyCode?: string;
  direction?: "DEBIT" | "CREDIT";
  customerId?: string;
  customerEmail?: string;
}

