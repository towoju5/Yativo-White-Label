import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export type StaffAccessClaims = {
  sub: string;
  aud: "admin";
  role: "OWNER" | "ADMIN" | "STAFF";
  /** The effective permission set at issue time — see resolveStaffPermissions(). Only meaningful for STAFF; OWNER/ADMIN bypass permission checks by role alone. */
  permissions: string[];
};
/**
 * `sub` is the Customer id for the business owner's own login, or the CustomerTeamMember id for
 * an invited team member's login. `principalType`/`businessCustomerId`/`permissions` are optional
 * so a token issued before team members existed keeps working: every consumer treats a missing
 * `principalType` as `"owner"` with `sub` as the customer id — today's exact behavior — so no
 * portal user is forced to re-login when this rolls out. See requirePortalPermission() and
 * resolveEffectiveCustomerId() for how the two principal types are told apart at request time.
 */
export type PortalAccessClaims = {
  sub: string;
  aud: "portal";
  principalType?: "owner" | "member";
  businessCustomerId?: string;
  /** Only meaningful for a member token — ADMIN bypasses `permissions` entirely, same as OWNER. */
  role?: "ADMIN" | "MEMBER";
  permissions?: string[];
  /** The CustomerRefreshToken row id this access token was issued alongside — lets the "active sessions" list (security/sessions.routes.ts) identify which row is the caller's own current session. Optional so a token issued before this existed keeps working (just never matches as current). */
  sessionId?: string;
};

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

export type PortalStepUpChallengeClaims = { sub: string; aud: "portal-stepup" };

/** Short-lived — issued when a 2FA-less customer logs in from a country they've never signed in from before. Redeemed by POST /portal/auth/step-up/verify against a one-time code emailed to them. */
export function signPortalStepUpChallengeToken(payload: Omit<PortalStepUpChallengeClaims, "aud">): string {
  return jwt.sign({ ...payload, aud: "portal-stepup" }, env.PORTAL_JWT_ACCESS_SECRET, { expiresIn: "10m" });
}

export function verifyPortalStepUpChallengeToken(token: string): PortalStepUpChallengeClaims {
  return jwt.verify(token, env.PORTAL_JWT_ACCESS_SECRET, { audience: "portal-stepup" }) as unknown as PortalStepUpChallengeClaims;
}

export type StaffTwoFactorChallengeClaims = { sub: string; aud: "admin-2fa" };

/** Staff-side counterpart of Portal2faChallengeClaims — issued by login when a staff account has TOTP enabled, redeemed by POST /auth/2fa/verify. */
export function signStaffTwoFactorChallengeToken(payload: Omit<StaffTwoFactorChallengeClaims, "aud">): string {
  return jwt.sign({ ...payload, aud: "admin-2fa" }, env.JWT_ACCESS_SECRET, { expiresIn: "5m" });
}

export function verifyStaffTwoFactorChallengeToken(token: string): StaffTwoFactorChallengeClaims {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, { audience: "admin-2fa" }) as unknown as StaffTwoFactorChallengeClaims;
}

export type StaffStepUpChallengeClaims = { sub: string; aud: "admin-stepup" };

/** Staff-side counterpart of PortalStepUpChallengeClaims — issued when a non-2FA staff account logs in from a new country. Redeemed by POST /auth/step-up/verify. */
export function signStaffStepUpChallengeToken(payload: Omit<StaffStepUpChallengeClaims, "aud">): string {
  return jwt.sign({ ...payload, aud: "admin-stepup" }, env.JWT_ACCESS_SECRET, { expiresIn: "10m" });
}

export function verifyStaffStepUpChallengeToken(token: string): StaffStepUpChallengeClaims {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, { audience: "admin-stepup" }) as unknown as StaffStepUpChallengeClaims;
}
