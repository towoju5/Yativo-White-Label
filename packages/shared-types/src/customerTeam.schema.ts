import { z } from "zod";
import { portalPermissionSchema } from "./portalPermissions.js";

export const CUSTOMER_TEAM_ROLES = ["OWNER", "ADMIN", "MEMBER"] as const;
export const customerTeamRoleSchema = z.enum(CUSTOMER_TEAM_ROLES);

export const customerTeamMemberSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  fullName: z.string(),
  role: customerTeamRoleSchema,
  // The effective permission set — OWNER/ADMIN get every PORTAL_PERMISSIONS key regardless of this.
  permissions: z.array(portalPermissionSchema),
  isActive: z.boolean(),
  invitedAt: z.string(),
  acceptedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type CustomerTeamMemberDto = z.infer<typeof customerTeamMemberSchema>;

/** Only ADMIN/MEMBER can be invited — a business has exactly one OWNER, the account holder itself. */
export const inviteTeamMemberSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1).max(120),
  role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
  permissions: z.array(portalPermissionSchema).default([]),
});
export type InviteTeamMemberInput = z.infer<typeof inviteTeamMemberSchema>;

export const updateTeamMemberSchema = z.object({
  role: z.enum(["ADMIN", "MEMBER"]).optional(),
  permissions: z.array(portalPermissionSchema).optional(),
});
export type UpdateTeamMemberInput = z.infer<typeof updateTeamMemberSchema>;

export const acceptTeamInviteSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});
export type AcceptTeamInviteInput = z.infer<typeof acceptTeamInviteSchema>;
