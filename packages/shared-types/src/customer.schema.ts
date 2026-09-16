import { z } from "zod";
import { CUSTOMER_SOURCES, CUSTOMER_STATUSES, CUSTOMER_TYPES, KYC_STATUSES } from "./enums.js";
import { portalPermissionSchema } from "./portalPermissions.js";

export const customerSchema = z.object({
  id: z.string(),
  type: z.enum(CUSTOMER_TYPES),
  fullName: z.string().nullable(),
  businessName: z.string().nullable(),
  email: z.string().email(),
  emailVerifiedAt: z.string().nullable(),
  kycStatus: z.enum(KYC_STATUSES),
  status: z.enum(CUSTOMER_STATUSES),
  yativoCustomerId: z.string().nullable(),
  twoFactorEnabled: z.boolean(),
  createdAt: z.string(),
  /** SIGNUP (self-registered) or IMPORTED (backfilled from a pre-existing Yativo customer — see POST /admin/customers/import-from-yativo). */
  source: z.enum(CUSTOMER_SOURCES),
  /** True only for an IMPORTED account that hasn't chosen its own password yet — see POST /portal/auth/setup-password. */
  requiresPasswordSetup: z.boolean(),
  // Every field above describes the BUSINESS account being operated on. These describe the
  // authenticated principal itself, and are present only when it's an invited team member rather
  // than the account owner — see resolveEffectiveCustomerId()/isPortalOwnerLevel() in the API.
  principalType: z.enum(["owner", "member"]).optional(),
  permissions: z.array(portalPermissionSchema).optional(),
  memberEmail: z.string().email().optional(),
  memberFullName: z.string().optional(),
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

// Free-form — seen live as a plain string ("Missing BVN"), an object
// ({"all_of": ["government_id_document"]}), an empty array, or null. Callers format defensively.
const flexibleEndorsementFieldSchema = z.union([z.string(), z.array(z.unknown()), z.record(z.unknown())]).nullable();

export const customerEndorsementSchema = z.object({
  /** snake_case service slug — e.g. "faster_payments", "virtual_card", "brazil". */
  service: z.string(),
  status: z.string(),
  hostedKycUrl: z.string().nullable(),
  updated: z.string().nullable(),
  /** Admin-customized label/description for this service — see EndorsementDisplaySetting. Null means no override; render the auto-formatted service slug instead. */
  displayName: z.string().nullable(),
  description: z.string().nullable(),
  /** False only when an admin has explicitly hidden this service from the customer-facing checklist — doesn't affect whether it gates any action. */
  isVisible: z.boolean(),
  /** Why a non-approved status is what it is, e.g. "Missing BVN". */
  errors: flexibleEndorsementFieldSchema,
  /** What's still needed to move this forward, e.g. {"all_of": ["government_id_document"]}. */
  requirementsDue: flexibleEndorsementFieldSchema,
  futureRequirementsDue: flexibleEndorsementFieldSchema,
  metadata: flexibleEndorsementFieldSchema,
});
export type CustomerEndorsement = z.infer<typeof customerEndorsementSchema>;

export const endorsementDisplaySettingSchema = z.object({
  service: z.string(),
  displayName: z.string().nullable(),
  description: z.string().nullable(),
  isVisible: z.boolean(),
  sortOrder: z.number().int(),
  updatedAt: z.string(),
});
export type EndorsementDisplaySetting = z.infer<typeof endorsementDisplaySettingSchema>;

export const upsertEndorsementDisplaySettingSchema = z.object({
  displayName: z.string().min(1).nullable().optional(),
  description: z.string().min(1).nullable().optional(),
  isVisible: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});
export type UpsertEndorsementDisplaySettingInput = z.infer<typeof upsertEndorsementDisplaySettingSchema>;

export const endorsementDisplaySettingsResponseSchema = z.object({
  overrides: z.array(endorsementDisplaySettingSchema),
  /** Every service slug this deployment currently knows about — every configured override plus every slug derived from live Yativo data (virtual-account rails, "virtual_card"). Not exhaustive: a brand-new slug can still show up on a live customer's endorsement list before it's ever seen here. */
  knownServices: z.array(z.string()),
});
export type EndorsementDisplaySettingsResponse = z.infer<typeof endorsementDisplaySettingsResponseSchema>;
