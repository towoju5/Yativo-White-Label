import { z } from "zod";

export const sessionSchema = z.object({
  id: z.string(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
  isCurrent: z.boolean(),
});
export type SessionDto = z.infer<typeof sessionSchema>;

export const customerAuditLogEntrySchema = z.object({
  id: z.string(),
  action: z.string(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: z.string(),
});
export type CustomerAuditLogEntryDto = z.infer<typeof customerAuditLogEntrySchema>;

// ── Admin audit trail — "who did this" for every admin-visible mutation ──

export const adminAuditLogEntrySchema = z.object({
  id: z.string(),
  actorId: z.string(),
  /** "System" for the SYSTEM_ACTOR_ID sentinel, otherwise the staff member's email. Null only if the staff account itself no longer exists. */
  actorLabel: z.string().nullable(),
  action: z.string(),
  target: z.string(),
  metadata: z.record(z.unknown()).nullable(),
  createdAt: z.string(),
});
export type AdminAuditLogEntryDto = z.infer<typeof adminAuditLogEntrySchema>;

// ── Withdrawal / payout velocity limits ──

export const customerLimitSchema = z.object({
  currencyCode: z.string(),
  dailyLimitMinor: z.string().nullable(),
  monthlyLimitMinor: z.string().nullable(),
  /** True when this row is a per-customer override; false means it's just the platform default shown for reference. */
  isOverride: z.boolean(),
});
export type CustomerLimitDto = z.infer<typeof customerLimitSchema>;

export const updateCustomerLimitSchema = z.object({
  currencyCode: z.string(),
  dailyLimitMinor: z.string().nullable().optional(),
  monthlyLimitMinor: z.string().nullable().optional(),
});
export type UpdateCustomerLimitInput = z.infer<typeof updateCustomerLimitSchema>;

export const platformLimitDefaultSchema = z.object({
  currencyCode: z.string(),
  dailyLimitMinor: z.string().nullable(),
  monthlyLimitMinor: z.string().nullable(),
});
export type PlatformLimitDefaultDto = z.infer<typeof platformLimitDefaultSchema>;

export const updatePlatformLimitDefaultSchema = z.object({
  dailyLimitMinor: z.string().nullable().optional(),
  monthlyLimitMinor: z.string().nullable().optional(),
});
export type UpdatePlatformLimitDefaultInput = z.infer<typeof updatePlatformLimitDefaultSchema>;
