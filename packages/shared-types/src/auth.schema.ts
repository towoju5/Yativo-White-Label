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
  invitePending: z.boolean(),
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

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

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

/** Returned from POST /portal/auth/login (in place of authTokensSchema) when a non-2FA customer logs in from a location they've never signed in from before. */
export const emailStepUpChallengeSchema = z.object({
  requiresEmailStepUp: z.literal(true),
  challengeToken: z.string(),
});
export type EmailStepUpChallenge = z.infer<typeof emailStepUpChallengeSchema>;

export const portalLoginResultSchema = z.union([authTokensSchema, twoFactorChallengeSchema, emailStepUpChallengeSchema]);
export type PortalLoginResult = z.infer<typeof portalLoginResultSchema>;

/** Returned from POST /portal/auth/signup in place of authTokensSchema when
 * PlatformSettings.requireEmailVerification is on — no session is issued until the customer
 * verifies their email. */
export const pendingEmailVerificationSchema = z.object({
  pendingVerification: z.literal(true),
});
export type PendingEmailVerification = z.infer<typeof pendingEmailVerificationSchema>;

export const signupResultSchema = z.union([authTokensSchema, pendingEmailVerificationSchema]);
export type SignupResult = z.infer<typeof signupResultSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().min(1),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const resendVerificationSchema = z.object({
  email: z.string().email(),
});
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;

export const requestPasswordResetSchema = z.object({
  email: z.string().email(),
});
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const requestMagicLinkSchema = z.object({
  email: z.string().email(),
});
export type RequestMagicLinkInput = z.infer<typeof requestMagicLinkSchema>;

export const verifyMagicLinkSchema = z.object({
  token: z.string().min(1),
});
export type VerifyMagicLinkInput = z.infer<typeof verifyMagicLinkSchema>;

export const verifyTwoFactorSchema = z.object({
  challengeToken: z.string(),
  /** A 6-digit TOTP code, or a one-time backup code. */
  code: z.string().min(6),
});
export type VerifyTwoFactorInput = z.infer<typeof verifyTwoFactorSchema>;

export const verifyEmailStepUpSchema = z.object({
  challengeToken: z.string(),
  /** The 6-digit code emailed for this new-location login. */
  code: z.string().min(6).max(6),
});
export type VerifyEmailStepUpInput = z.infer<typeof verifyEmailStepUpSchema>;

// ── Staff login step-up (2FA and new-location email code) ──

/** Returned from POST /auth/login in place of authTokensSchema when the staff account has TOTP enabled. */
export const staffTwoFactorChallengeSchema = z.object({
  requiresTwoFactor: z.literal(true),
  challengeToken: z.string(),
});
export type StaffTwoFactorChallenge = z.infer<typeof staffTwoFactorChallengeSchema>;

/** Returned from POST /auth/login in place of authTokensSchema when a non-2FA staff account logs in from a location they've never signed in from before. */
export const staffEmailStepUpChallengeSchema = z.object({
  requiresEmailStepUp: z.literal(true),
  challengeToken: z.string(),
});
export type StaffEmailStepUpChallenge = z.infer<typeof staffEmailStepUpChallengeSchema>;

export const staffLoginResultSchema = z.union([authTokensSchema, staffTwoFactorChallengeSchema, staffEmailStepUpChallengeSchema]);
export type StaffLoginResult = z.infer<typeof staffLoginResultSchema>;
