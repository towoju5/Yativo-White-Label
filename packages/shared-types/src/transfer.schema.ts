import { z } from "zod";
import { currencyCodeSchema, minorAmountSchema } from "./money.js";

/** How the sender identified the recipient. QR is a scanned "receive" code, which carries a publicId. */
export const TRANSFER_LOOKUP_METHODS = ["EMAIL", "PHONE", "ID", "QR"] as const;
export const transferLookupMethodSchema = z.enum(TRANSFER_LOOKUP_METHODS);
export type TransferLookupMethod = z.infer<typeof transferLookupMethodSchema>;

export const transferLookupSchema = z.object({
  method: transferLookupMethodSchema,
  /** An email, a phone number (only its last 8 digits are matched), or a customer id / scanned QR payload. */
  value: z.string().trim().min(1).max(320),
});
export type TransferLookupInput = z.infer<typeof transferLookupSchema>;

/** Deliberately minimal — enough for the sender to confirm "is this who I mean?" without exposing the recipient's contact details. */
export const transferRecipientSchema = z.object({
  publicId: z.string(),
  displayName: z.string(),
  type: z.enum(["INDIVIDUAL", "BUSINESS"]),
});
export type TransferRecipient = z.infer<typeof transferRecipientSchema>;

export const transferQuoteQuerySchema = z.object({ currencyCode: currencyCodeSchema, amountMinor: minorAmountSchema });
export const transferQuoteSchema = z.object({
  currencyCode: z.string(),
  amountMinor: minorAmountSchema,
  feeMinor: minorAmountSchema,
  totalMinor: minorAmountSchema,
});
export type TransferQuote = z.infer<typeof transferQuoteSchema>;

export const createTransferSchema = z.object({
  recipientPublicId: z.string().trim().min(1).max(32),
  currencyCode: currencyCodeSchema,
  amountMinor: minorAmountSchema,
  note: z.string().trim().max(140).optional(),
  lookupMethod: transferLookupMethodSchema,
  /** Client-generated (one per "Send" screen) so a double-click or retry can't send twice. */
  idempotencyKey: z.string().min(8).max(64),
});
export type CreateTransferInput = z.infer<typeof createTransferSchema>;

export const transferSchema = z.object({
  id: z.string(),
  direction: z.enum(["SENT", "RECEIVED"]),
  counterparty: transferRecipientSchema,
  currencyCode: z.string(),
  amountMinor: minorAmountSchema,
  feeMinor: minorAmountSchema,
  note: z.string().nullable(),
  transactionId: z.string(),
  createdAt: z.string(),
});
export type Transfer = z.infer<typeof transferSchema>;

/** The signed-in customer's own receiving details — what their "Receive" QR encodes. */
export const transferProfileSchema = z.object({
  publicId: z.string(),
  displayName: z.string(),
  /** Masked, e.g. "•••• 4567" — shown so the customer knows which number others can find them by. Null when none on file. */
  phoneHint: z.string().nullable(),
});
export type TransferProfile = z.infer<typeof transferProfileSchema>;

// ── Admin ────────────────────────────────────────────────────────────────────

/** Staff see both parties in full — unlike the customer-facing DTO, which only shows a masked name. */
export const adminTransferPartySchema = z.object({
  customerId: z.string(),
  publicId: z.string(),
  name: z.string().nullable(),
  email: z.string(),
  type: z.enum(["INDIVIDUAL", "BUSINESS"]),
});
export type AdminTransferParty = z.infer<typeof adminTransferPartySchema>;

export const adminTransferSchema = z.object({
  id: z.string(),
  sender: adminTransferPartySchema,
  recipient: adminTransferPartySchema,
  currencyCode: z.string(),
  amountMinor: minorAmountSchema,
  feeMinor: minorAmountSchema,
  /** amount + fee — what left the sender's wallet. */
  totalDebitMinor: minorAmountSchema,
  note: z.string().nullable(),
  lookupMethod: z.string(),
  transactionId: z.string(),
  /** The ledger transaction's status — POSTED normally; REVERSED if staff reversed it from Transactions. */
  ledgerStatus: z.enum(["PENDING", "POSTED", "REVERSED"]),
  createdAt: z.string(),
});
export type AdminTransfer = z.infer<typeof adminTransferSchema>;

export const adminTransferListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  /** Name, email or customer ID (publicId) of either party, or the transfer/transaction id. */
  search: z.string().trim().max(200).optional(),
  /** Internal customer id — matches transfers where they're the sender OR the recipient. */
  customerId: z.string().optional(),
  currencyCode: currencyCodeSchema.optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});
export type AdminTransferListQuery = z.infer<typeof adminTransferListQuerySchema>;
