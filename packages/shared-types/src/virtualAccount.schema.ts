import { z } from "zod";

/** A provisioned receiving account — fields vary by rail (bank account number, PIX key, IBAN, etc.), so this stays generic. */
export const virtualAccountSchema = z.record(z.string());
export type VirtualAccount = z.infer<typeof virtualAccountSchema>;

export const virtualAccountCurrencySchema = z.object({
  /** Yativo's own rail identifier, not always a plain ISO code — e.g. "USDCOBO", "EURBASE". */
  currency: z.string(),
  /** null means this rail needs no special approval and can be provisioned immediately. */
  endorsement: z.string().nullable(),
  /** Whether the current customer can provision this currency right now. */
  eligible: z.boolean(),
  /** The customer's status for `endorsement` (e.g. "approved", "not_started") — null when `endorsement` is null. */
  endorsementStatus: z.string().nullable(),
  /** A hosted verification link to complete the required endorsement, when Yativo has issued one. */
  hostedKycUrl: z.string().nullable(),
});
export type VirtualAccountCurrency = z.infer<typeof virtualAccountCurrencySchema>;

export const createVirtualAccountSchema = z.object({
  currency: z.string(),
});
export type CreateVirtualAccountInput = z.infer<typeof createVirtualAccountSchema>;
