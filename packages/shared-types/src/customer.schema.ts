import { z } from "zod";
import { CUSTOMER_STATUSES, CUSTOMER_TYPES, KYC_STATUSES } from "./enums.js";

export const customerSchema = z.object({
  id: z.string(),
  type: z.enum(CUSTOMER_TYPES),
  fullName: z.string().nullable(),
  businessName: z.string().nullable(),
  email: z.string().email(),
  kycStatus: z.enum(KYC_STATUSES),
  status: z.enum(CUSTOMER_STATUSES),
  yativoCustomerId: z.string().nullable(),
  twoFactorEnabled: z.boolean(),
  createdAt: z.string(),
});
export type Customer = z.infer<typeof customerSchema>;

export const createCustomerSchema = z.object({
  type: z.enum(CUSTOMER_TYPES),
  fullName: z.string().min(1).optional(),
  businessName: z.string().min(1).optional(),
  email: z.string().email(),
  password: z.string().min(8),
  /** E.164 calling code, e.g. "+1" — every non-admin customer is registered with Yativo at signup, which requires a phone number. */
  callingCode: z.string().regex(/^\+\d{1,4}$/, "Invalid calling code"),
  /** Local number only — no leading +, spaces, or dashes. Combined with callingCode to form the E.164 phone Yativo requires. */
  phone: z.string().regex(/^\d{4,14}$/, "Invalid phone number"),
  /** ISO 3166-1 alpha-3, e.g. "USA" — Yativo requires this on customer creation. */
  countryCode: z.string().length(3),
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const customerEndorsementSchema = z.object({
  /** snake_case service slug — e.g. "faster_payments", "virtual_card", "brazil". */
  service: z.string(),
  status: z.string(),
  hostedKycUrl: z.string().nullable(),
  updated: z.string().nullable(),
});
export type CustomerEndorsement = z.infer<typeof customerEndorsementSchema>;
