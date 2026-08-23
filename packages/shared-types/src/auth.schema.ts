import { z } from "zod";
import { STAFF_ROLES } from "./enums.js";
import { staffPermissionSchema } from "./permissions.js";

export const staffLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export type StaffLoginInput = z.infer<typeof staffLoginSchema>;

export const portalLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export type PortalLoginInput = z.infer<typeof portalLoginSchema>;

export const staffUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  role: z.enum(STAFF_ROLES),
  isActive: z.boolean(),
  customRoleId: z.string().nullable(),
  customRoleName: z.string().nullable(),
  /** The effective permission set — OWNER/ADMIN get every STAFF_PERMISSIONS key regardless of customRole. */
  permissions: z.array(staffPermissionSchema),
  invitedByEmail: z.string().nullable(),
  createdAt: z.string(),
});
export type StaffUserDto = z.infer<typeof staffUserSchema>;

export const inviteStaffSchema = z.object({
  email: z.string().email(),
  role: z.enum(STAFF_ROLES),
  customRoleId: z.string().nullable().optional(),
});
export type InviteStaffInput = z.infer<typeof inviteStaffSchema>;

export const updateStaffSchema = z.object({
  role: z.enum(STAFF_ROLES).optional(),
  customRoleId: z.string().nullable().optional(),
});
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;

export const resetStaffPasswordResultSchema = z.object({ tempPassword: z.string() });
export type ResetStaffPasswordResult = z.infer<typeof resetStaffPasswordResultSchema>;

export const roleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  permissions: z.array(staffPermissionSchema),
  staffCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type RoleDto = z.infer<typeof roleSchema>;

export const createRoleSchema = z.object({
  name: z.string().min(1).max(60),
  description: z.string().max(300).optional(),
  permissions: z.array(staffPermissionSchema).default([]),
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  description: z.string().max(300).nullable().optional(),
  permissions: z.array(staffPermissionSchema).optional(),
});
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

export const authTokensSchema = z.object({
  accessToken: z.string(),
});
export type AuthTokens = z.infer<typeof authTokensSchema>;

/** Returned from POST /portal/auth/login in place of authTokensSchema when the customer has 2FA enabled. */
export const twoFactorChallengeSchema = z.object({
  requiresTwoFactor: z.literal(true),
  challengeToken: z.string(),
});
export type TwoFactorChallenge = z.infer<typeof twoFactorChallengeSchema>;

export const portalLoginResultSchema = z.union([authTokensSchema, twoFactorChallengeSchema]);
export type PortalLoginResult = z.infer<typeof portalLoginResultSchema>;

export const verifyTwoFactorSchema = z.object({
  challengeToken: z.string(),
  /** A 6-digit TOTP code, or a one-time backup code. */
  code: z.string().min(6),
});
export type VerifyTwoFactorInput = z.infer<typeof verifyTwoFactorSchema>;
