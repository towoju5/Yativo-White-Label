import type { FastifyReply, FastifyRequest } from "fastify";
import type { PortalPermission } from "@white-label/shared-types";
import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";
import { effectiveMemberPermissions } from "../modules/portalAuth/portalAuth.service.js";

/**
 * Granular permission gate for a business's invited team members — the account owner always
 * passes (an owner's access is never a revocable "permission set", so nothing to go stale there).
 * A member login's role/permissions are checked FRESH against the DB on every call rather than
 * trusting the token's own `role`/`permissions` claims — those are only a snapshot from whenever
 * the token was issued/refreshed, so without this a demotion or permission change would silently
 * keep the old access working for up to PORTAL_JWT_ACCESS_TTL (15 minutes by default). Mirrors
 * requirePermission() on the staff side.
 */
export function requirePortalPermission(permission: PortalPermission) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const claims = request.customer;
    if (!claims) throw new UnauthorizedError();
    if (!claims.principalType || claims.principalType === "owner") return;

    const member = await request.server.prisma.customerTeamMember.findUnique({ where: { id: claims.sub } });
    if (!member || !member.isActive) throw new UnauthorizedError("This team member account is no longer active");
    if (member.role === "ADMIN") return;
    if (!effectiveMemberPermissions(member).includes(permission)) {
      throw new ForbiddenError(`Requires permission: ${permission}`);
    }
  };
}
