import type { FriendlyTransactionStatus, LedgerTransactionStatus } from "@white-label/shared-types";

/** Shared badge styling + display label for the 5-value friendly transaction status, used by every transaction/payout/statement list and detail view. */
export const TRANSACTION_STATUS_VARIANT: Record<FriendlyTransactionStatus, "success" | "warning" | "destructive" | "secondary"> = {
  PENDING: "warning",
  PROCESSING: "secondary",
  FAILED: "destructive",
  REVERSED: "destructive",
  SUCCESS: "success",
};

export const TRANSACTION_STATUS_LABEL: Record<FriendlyTransactionStatus, string> = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  FAILED: "Failed",
  REVERSED: "Reversed",
  SUCCESS: "Success",
};

/**
 * The admin transaction filter still queries the raw 3-value ledger status server-side (filtering
 * on a derived value would mean computing it for every row before pagination could apply) — this
 * maps each friendly filter option onto the closest raw value. FAILED and REVERSED both resolve to
 * raw REVERSED, so filtering by either currently returns the same underlying set; an admin who
 * needs to tell them apart still can from each row's own badge.
 */
export const FRIENDLY_STATUS_FILTER_VALUE: Record<FriendlyTransactionStatus, LedgerTransactionStatus> = {
  PENDING: "PENDING",
  PROCESSING: "PENDING",
  SUCCESS: "POSTED",
  FAILED: "REVERSED",
  REVERSED: "REVERSED",
};
