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
