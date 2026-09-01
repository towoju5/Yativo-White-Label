import type { FastifyReply, FastifyRequest } from "fastify";
import type { PortalPermission } from "@white-label/shared-types";
import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";
import { isPortalOwnerLevel } from "../lib/portalPrincipal.js";

/**
 * Granular permission gate for a business's invited team members — the account owner (and an
 * ADMIN-tier member) always passes; a MEMBER-tier login must have the given permission in their
 * token's `permissions` claim (baked in at login from their assigned permission set — see
 * customerTeam.service.ts). Mirrors requirePermission() on the staff side. A permission change
 * takes effect on that member's next token refresh, not instantly.
 */
export function requirePortalPermission(permission: PortalPermission) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    if (!request.customer) throw new UnauthorizedError();
    if (isPortalOwnerLevel(request.customer)) return;
    if (!request.customer.permissions?.includes(permission)) {
      throw new ForbiddenError(`Requires permission: ${permission}`);
    }
  };
}
