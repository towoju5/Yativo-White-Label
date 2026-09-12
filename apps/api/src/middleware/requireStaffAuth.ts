import type { FastifyReply, FastifyRequest } from "fastify";
import type { StaffPermission } from "@white-label/shared-types";
import { verifyStaffAccessToken, type StaffAccessClaims } from "../lib/jwt.js";
import { resolveStaffPermissions } from "../modules/auth/auth.service.js";
import { UnauthorizedError, ForbiddenError } from "../lib/errors.js";

declare module "fastify" {
  interface FastifyRequest {
    staffUser?: StaffAccessClaims;
  }
}

export async function requireStaffAuth(request: FastifyRequest, _reply: FastifyReply) {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw new UnauthorizedError("Missing staff access token");
  try {
    request.staffUser = verifyStaffAccessToken(header.slice("Bearer ".length));
  } catch {
    throw new UnauthorizedError("Invalid or expired staff access token");
  }
}

/**
 * Fetches this staff member's CURRENT role/customRole/isActive from the DB — deliberately not
 * trusting the JWT's own `role`/`permissions` claims, which are only a snapshot from whenever the
 * token was last issued/refreshed. Without this, deactivating someone or revoking a permission
 * would silently keep working against their existing token for up to JWT_ACCESS_TTL (15 minutes
 * by default) — a real gap for anything security-sensitive (see requirePermission/requireRole
 * below, and requirePortalPermission's equivalent on the customer-team side).
 */
async function loadCurrentStaffAuthority(request: FastifyRequest): Promise<{ role: "OWNER" | "ADMIN" | "STAFF"; permissions: StaffPermission[] }> {
  const staff = await request.server.prisma.staffUser.findUnique({
    where: { id: request.staffUser!.sub },
    include: { customRole: true },
  });
  if (!staff || !staff.isActive) throw new UnauthorizedError("This staff account is no longer active");
  return { role: staff.role, permissions: resolveStaffPermissions(staff) };
}

export function requireRole(...roles: Array<"OWNER" | "ADMIN" | "STAFF">) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    if (!request.staffUser) throw new UnauthorizedError();
    const { role } = await loadCurrentStaffAuthority(request);
    if (!roles.includes(role)) {
      throw new ForbiddenError(`Requires one of role: ${roles.join(", ")}`);
    }
  };
}

/**
 * Granular alternative to requireRole — OWNER and ADMIN always pass (full access is the point of
 * those two tiers), STAFF must have the given permission in their CURRENT effective set (their
 * assigned custom Role, or DEFAULT_STAFF_PERMISSIONS if unassigned — see resolveStaffPermissions()
 * in auth.service.ts), checked fresh against the DB on every call, not the token's own claim.
 */
export function requirePermission(permission: StaffPermission) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    if (!request.staffUser) throw new UnauthorizedError();
    const { role, permissions } = await loadCurrentStaffAuthority(request);
    if (role === "OWNER" || role === "ADMIN") return;
    if (!permissions.includes(permission)) {
      throw new ForbiddenError(`Requires permission: ${permission}`);
    }
  };
}
