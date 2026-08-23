import type { FastifyReply, FastifyRequest } from "fastify";
import type { StaffPermission } from "@white-label/shared-types";
import { verifyStaffAccessToken, type StaffAccessClaims } from "../lib/jwt.js";
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

export function requireRole(...roles: Array<"OWNER" | "ADMIN" | "STAFF">) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    if (!request.staffUser) throw new UnauthorizedError();
    if (!roles.includes(request.staffUser.role)) {
      throw new ForbiddenError(`Requires one of role: ${roles.join(", ")}`);
    }
  };
}

/**
 * Granular alternative to requireRole — OWNER and ADMIN always pass (full access is the point of
 * those two tiers), STAFF must have the given permission in their token's `permissions` claim
 * (baked in at login/refresh from either their assigned custom Role or DEFAULT_STAFF_PERMISSIONS —
 * see resolveStaffPermissions() in auth.service.ts). Like the role claim itself, a permission
 * change takes effect on that staff member's next token refresh, not instantly.
 */
export function requirePermission(permission: StaffPermission) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    if (!request.staffUser) throw new UnauthorizedError();
    const { role, permissions } = request.staffUser;
    if (role === "OWNER" || role === "ADMIN") return;
    if (!permissions?.includes(permission)) {
      throw new ForbiddenError(`Requires permission: ${permission}`);
    }
  };
}
