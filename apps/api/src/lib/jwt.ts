import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export type StaffAccessClaims = {
  sub: string;
  aud: "admin";
  role: "OWNER" | "ADMIN" | "STAFF";
  /** The effective permission set at issue time — see resolveStaffPermissions(). Only meaningful for STAFF; OWNER/ADMIN bypass permission checks by role alone. */
  permissions: string[];
};
export type PortalAccessClaims = { sub: string; aud: "portal" };

export function signStaffAccessToken(payload: Omit<StaffAccessClaims, "aud">): string {
  return jwt.sign({ ...payload, aud: "admin" }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions["expiresIn"],
  });
}

export function verifyStaffAccessToken(token: string): StaffAccessClaims {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, { audience: "admin" }) as unknown as StaffAccessClaims;
}

export function signPortalAccessToken(payload: Omit<PortalAccessClaims, "aud">): string {
  return jwt.sign({ ...payload, aud: "portal" }, env.PORTAL_JWT_ACCESS_SECRET, {
    expiresIn: env.PORTAL_JWT_ACCESS_TTL as jwt.SignOptions["expiresIn"],
  });
}

export function verifyPortalAccessToken(token: string): PortalAccessClaims {
  return jwt.verify(token, env.PORTAL_JWT_ACCESS_SECRET, { audience: "portal" }) as unknown as PortalAccessClaims;
}

export type Portal2faChallengeClaims = { sub: string; aud: "portal-2fa" };

/** Short-lived — issued by login when a customer has 2FA enabled, redeemed by POST /portal/auth/2fa/verify. Distinct audience keeps it unusable as a real access token even if leaked. */
export function signPortal2faChallengeToken(payload: Omit<Portal2faChallengeClaims, "aud">): string {
  return jwt.sign({ ...payload, aud: "portal-2fa" }, env.PORTAL_JWT_ACCESS_SECRET, { expiresIn: "5m" });
}

export function verifyPortal2faChallengeToken(token: string): Portal2faChallengeClaims {
  return jwt.verify(token, env.PORTAL_JWT_ACCESS_SECRET, { audience: "portal-2fa" }) as unknown as Portal2faChallengeClaims;
}
