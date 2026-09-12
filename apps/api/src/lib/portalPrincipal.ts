import type { PortalAccessClaims } from "./jwt.js";

/**
 * The Customer id whose data an authenticated portal request should operate on — the account
 * holder's own id for an owner token, or the business's id (never the member's own id) for a team
 * member token. Every portal module that scopes a query by "the current customer" must resolve
 * through this instead of reading `claims.sub` directly, so a team member's actions land on the
 * business's records rather than a nonexistent Customer row for their own id.
 */
export function resolveEffectiveCustomerId(claims: PortalAccessClaims): string {
  return claims.principalType === "member" && claims.businessCustomerId ? claims.businessCustomerId : claims.sub;
}
