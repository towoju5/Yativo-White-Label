import type { PrismaClient, StaffRole } from "@prisma/client";
import type { Redis } from "ioredis";
import { randomUUID } from "node:crypto";
import { generateAuthenticationOptions, verifyAuthenticationResponse, type AuthenticationResponseJSON, type AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { STAFF_PERMISSIONS, DEFAULT_STAFF_PERMISSIONS, type StaffPermission, type CreateRoleInput, type UpdateRoleInput } from "@white-label/shared-types";
import { env } from "../../config/env.js";
import { hashPassword, verifyPassword } from "../../lib/passwords.js";
import { signStaffAccessToken } from "../../lib/jwt.js";
import { generateRefreshToken, hashRefreshToken, parseTtlToMs } from "../../lib/refreshTokens.js";
import { webauthnOrigin, webauthnRpID } from "../../lib/webauthn.js";
import { UnauthorizedError, ConflictError, ForbiddenError, NotFoundError, AppError } from "../../lib/errors.js";

const staffWithRole = { include: { customRole: true } } as const;
type StaffWithRole = { role: StaffRole; customRole: { permissions: string[] } | null };

/**
 * The effective permission set at token-issue time — OWNER/ADMIN get every key (informational;
 * they bypass permission checks by role alone), STAFF gets their assigned custom role's set or,
 * if unassigned, the backward-compatible default. Cast from Prisma's plain `string[]` is safe:
 * createRole/updateRole only ever write values already validated against staffPermissionSchema.
 */
export function resolveStaffPermissions(user: StaffWithRole): StaffPermission[] {
  if (user.role === "OWNER" || user.role === "ADMIN") return [...STAFF_PERMISSIONS];
  return (user.customRole ? user.customRole.permissions : [...DEFAULT_STAFF_PERMISSIONS]) as StaffPermission[];
}

async function issueSession(prisma: PrismaClient, user: { id: string; role: StaffRole; customRole: { permissions: string[] } | null }) {
  const accessToken = signStaffAccessToken({ sub: user.id, role: user.role, permissions: resolveStaffPermissions(user) });
  const { token: refreshToken, tokenHash } = generateRefreshToken();
  await prisma.refreshToken.create({
    data: { staffUserId: user.id, tokenHash, expiresAt: new Date(Date.now() + parseTtlToMs(env.JWT_REFRESH_TTL)) },
  });
  return { accessToken, refreshToken };
}

export async function registerFirstOwner(prisma: PrismaClient, email: string, password: string) {
  const count = await prisma.staffUser.count();
  if (count > 0) throw new ConflictError("An owner already exists — ask them to invite you from Team settings");
  const passwordHash = await hashPassword(password);
  return prisma.staffUser.create({ data: { email, passwordHash, role: "OWNER" } });
}

export async function loginStaff(prisma: PrismaClient, email: string, password: string) {
  const user = await prisma.staffUser.findUnique({ where: { email }, ...staffWithRole });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new UnauthorizedError("Invalid email or password");
  }
  if (!user.isActive) throw new UnauthorizedError("This account has been deactivated");
  const { accessToken, refreshToken } = await issueSession(prisma, user);
  return { user, accessToken, refreshToken };
}

export async function refreshStaffSession(prisma: PrismaClient, refreshToken: string) {
  const tokenHash = hashRefreshToken(refreshToken);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash }, include: { staffUser: { ...staffWithRole } } });
  if (!existing || existing.revokedAt || existing.expiresAt < new Date()) {
    throw new UnauthorizedError("Invalid or expired refresh token");
  }
  if (!existing.staffUser.isActive) throw new UnauthorizedError("This account has been deactivated");

  await prisma.refreshToken.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });
  const { accessToken, refreshToken: newRefreshToken } = await issueSession(prisma, existing.staffUser);
  return { user: existing.staffUser, accessToken, refreshToken: newRefreshToken };
}

export async function logoutStaff(prisma: PrismaClient, refreshToken: string) {
  const tokenHash = hashRefreshToken(refreshToken);
  await prisma.refreshToken.updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: new Date() } });
}

const PASSKEY_LOGIN_TTL_SECONDS = 300;
const passkeyLoginFlowKey = (flowId: string) => `webauthn:login:staff:${flowId}`;

/**
 * No `allowCredentials` — this is a discoverable-credential ("usernameless") flow: the browser's
 * own passkey picker shows every staff passkey registered for this RP, so there's no email step.
 * The challenge is keyed by a random flowId (not a user id) since the user isn't known yet.
 */
export async function getStaffPasskeyLoginOptions(redis: Redis) {
  const options = await generateAuthenticationOptions({ rpID: webauthnRpID, userVerification: "required" });
  const flowId = randomUUID();
  await redis.set(passkeyLoginFlowKey(flowId), options.challenge, "EX", PASSKEY_LOGIN_TTL_SECONDS);
  return { flowId, options };
}

/** A passkey is a single strong, phishing-resistant, user-verified factor — it stands in for password+2FA together rather than needing a second step on top. */
export async function verifyStaffPasskeyLogin(prisma: PrismaClient, redis: Redis, flowId: string, response: AuthenticationResponseJSON) {
  const key = passkeyLoginFlowKey(flowId);
  const expectedChallenge = await redis.get(key);
  if (!expectedChallenge) throw new UnauthorizedError("This sign-in attempt expired — please try again");
  await redis.del(key);

  const passkey = await prisma.staffPasskey.findUnique({ where: { credentialId: response.id }, include: { staffUser: { ...staffWithRole } } });
  if (!passkey) throw new UnauthorizedError("This passkey isn't registered");
  if (!passkey.staffUser.isActive) throw new UnauthorizedError("This account has been deactivated");

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: webauthnOrigin,
    expectedRPID: webauthnRpID,
    credential: {
      id: passkey.credentialId,
      publicKey: new Uint8Array(passkey.publicKey),
      counter: passkey.counter,
      transports: passkey.transports as AuthenticatorTransportFuture[],
    },
  });
  if (!verification.verified) throw new UnauthorizedError("Couldn't verify this passkey");

  await prisma.staffPasskey.update({
    where: { id: passkey.id },
    data: { counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() },
  });

  const { accessToken, refreshToken } = await issueSession(prisma, passkey.staffUser);
  return { user: passkey.staffUser, accessToken, refreshToken };
}

function generateTempPassword(): string {
  return generateRefreshToken().token.slice(0, 16);
}

export async function inviteStaff(
  prisma: PrismaClient,
  invitedById: string,
  invitedByRole: StaffRole,
  email: string,
  role: StaffRole,
  customRoleId?: string | null,
) {
  if (role === "OWNER" && invitedByRole !== "OWNER") {
    throw new ForbiddenError("Only an existing owner can invite another owner.");
  }
  const existing = await prisma.staffUser.findUnique({ where: { email } });
  if (existing) throw new ConflictError("A staff user with this email already exists");
  if (customRoleId && !(await prisma.role.findUnique({ where: { id: customRoleId } }))) throw new NotFoundError("Role");

  // Scaffold: issues a temporary password instead of a real email invite flow (TODO: wire to an email provider).
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  const user = await prisma.staffUser.create({
    data: { email, passwordHash, role, invitedById, customRoleId: role === "STAFF" ? (customRoleId ?? null) : null },
    ...staffWithRole,
  });
  return { user, tempPassword };
}

async function ownerCount(prisma: PrismaClient, excludeId?: string) {
  return prisma.staffUser.count({ where: { role: "OWNER", isActive: true, ...(excludeId ? { id: { not: excludeId } } : {}) } });
}

export async function updateStaff(
  prisma: PrismaClient,
  actingStaffId: string,
  actingRole: StaffRole,
  targetId: string,
  input: { role?: StaffRole; customRoleId?: string | null },
) {
  if (targetId === actingStaffId) throw new AppError("You can't change your own role — ask another owner or admin.", 400, "CANNOT_EDIT_SELF");
  const target = await prisma.staffUser.findUnique({ where: { id: targetId } });
  if (!target) throw new NotFoundError("Staff member");

  if (input.role) {
    if (input.role === "OWNER" && actingRole !== "OWNER") throw new ForbiddenError("Only an existing owner can promote someone to owner.");
    if (target.role === "OWNER" && input.role !== "OWNER" && (await ownerCount(prisma, targetId)) === 0) {
      throw new AppError("Can't change the last owner's role — promote someone else to owner first.", 409, "LAST_OWNER");
    }
  }
  if (input.customRoleId && !(await prisma.role.findUnique({ where: { id: input.customRoleId } }))) throw new NotFoundError("Role");

  const nextRole = input.role ?? target.role;
  const updated = await prisma.staffUser.update({
    where: { id: targetId },
    data: {
      role: input.role,
      // A custom role only ever applies to the STAFF tier — clear it if the update takes them out of STAFF.
      customRoleId: nextRole === "STAFF" ? (input.customRoleId !== undefined ? input.customRoleId : undefined) : null,
    },
    ...staffWithRole,
  });
  return updated;
}

async function setActive(prisma: PrismaClient, actingStaffId: string, targetId: string, isActive: boolean) {
  if (targetId === actingStaffId) throw new AppError("You can't deactivate your own account.", 400, "CANNOT_EDIT_SELF");
  const target = await prisma.staffUser.findUnique({ where: { id: targetId } });
  if (!target) throw new NotFoundError("Staff member");
  if (!isActive && target.role === "OWNER" && (await ownerCount(prisma, targetId)) === 0) {
    throw new AppError("Can't deactivate the last active owner.", 409, "LAST_OWNER");
  }
  const updated = await prisma.staffUser.update({
    where: { id: targetId },
    data: { isActive, deactivatedAt: isActive ? null : new Date() },
    ...staffWithRole,
  });
  if (!isActive) await prisma.refreshToken.updateMany({ where: { staffUserId: targetId, revokedAt: null }, data: { revokedAt: new Date() } });
  return updated;
}

export const deactivateStaff = (prisma: PrismaClient, actingStaffId: string, targetId: string) => setActive(prisma, actingStaffId, targetId, false);
export const reactivateStaff = (prisma: PrismaClient, actingStaffId: string, targetId: string) => setActive(prisma, actingStaffId, targetId, true);

/** Hard delete — only allowed for staff nobody else's invite chain depends on, to keep the invitedBy audit trail intact for everyone else. Deactivate is the safe default; this is for cleaning up a mistaken invite. */
export async function deleteStaff(prisma: PrismaClient, actingStaffId: string, targetId: string) {
  if (targetId === actingStaffId) throw new AppError("You can't remove your own account.", 400, "CANNOT_EDIT_SELF");
  const target = await prisma.staffUser.findUnique({ where: { id: targetId } });
  if (!target) throw new NotFoundError("Staff member");
  if (target.role === "OWNER" && (await ownerCount(prisma, targetId)) === 0) {
    throw new AppError("Can't remove the last active owner.", 409, "LAST_OWNER");
  }
  const invitedCount = await prisma.staffUser.count({ where: { invitedById: targetId } });
  if (invitedCount > 0) {
    throw new AppError(
      `${target.email} invited ${invitedCount} other staff member(s) still on the team — reassign or remove them first.`,
      409,
      "HAS_INVITEES",
    );
  }
  await prisma.$transaction([
    prisma.refreshToken.deleteMany({ where: { staffUserId: targetId } }),
    prisma.apiKey.deleteMany({ where: { createdById: targetId } }),
    prisma.staffUser.delete({ where: { id: targetId } }),
  ]);
}

export async function resetStaffPassword(prisma: PrismaClient, targetId: string) {
  const target = await prisma.staffUser.findUnique({ where: { id: targetId } });
  if (!target) throw new NotFoundError("Staff member");
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  await prisma.$transaction([
    prisma.staffUser.update({ where: { id: targetId }, data: { passwordHash } }),
    prisma.refreshToken.updateMany({ where: { staffUserId: targetId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  return { tempPassword };
}

// ── Roles ────────────────────────────────────────────────────────────────

export async function listRoles(prisma: PrismaClient) {
  const roles = await prisma.role.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { staff: true } } } });
  return roles.map((r) => ({ ...r, permissions: r.permissions as StaffPermission[], staffCount: r._count.staff }));
}

export async function createRole(prisma: PrismaClient, input: CreateRoleInput) {
  const existing = await prisma.role.findUnique({ where: { name: input.name } });
  if (existing) throw new ConflictError(`A role named "${input.name}" already exists.`);
  const role = await prisma.role.create({ data: { name: input.name, description: input.description ?? null, permissions: input.permissions } });
  return { ...role, permissions: role.permissions as StaffPermission[], staffCount: 0 };
}

export async function updateRole(prisma: PrismaClient, roleId: string, input: UpdateRoleInput) {
  const existing = await prisma.role.findUnique({ where: { id: roleId } });
  if (!existing) throw new NotFoundError("Role");
  if (input.name && input.name !== existing.name) {
    const clash = await prisma.role.findUnique({ where: { name: input.name } });
    if (clash) throw new ConflictError(`A role named "${input.name}" already exists.`);
  }
  const role = await prisma.role.update({
    where: { id: roleId },
    data: { name: input.name, description: input.description, permissions: input.permissions },
    include: { _count: { select: { staff: true } } },
  });
  return { ...role, permissions: role.permissions as StaffPermission[], staffCount: role._count.staff };
}

export async function deleteRole(prisma: PrismaClient, roleId: string) {
  const role = await prisma.role.findUnique({ where: { id: roleId }, include: { _count: { select: { staff: true } } } });
  if (!role) throw new NotFoundError("Role");
  if (role._count.staff > 0) {
    throw new AppError(`${role._count.staff} staff member(s) are assigned to "${role.name}" — reassign them first.`, 409, "ROLE_IN_USE");
  }
  await prisma.role.delete({ where: { id: roleId } });
}
