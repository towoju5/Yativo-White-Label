import type { CustomerTeamMember, PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";
import { randomUUID } from "node:crypto";
import { generateAuthenticationOptions, verifyAuthenticationResponse, type AuthenticationResponseJSON, type AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { PORTAL_PERMISSIONS } from "@white-label/shared-types";
import { env } from "../../config/env.js";
import { hashPassword, verifyPassword } from "../../lib/passwords.js";
import { signPortalAccessToken, signPortal2faChallengeToken, verifyPortal2faChallengeToken } from "../../lib/jwt.js";
import { generateRefreshToken, hashRefreshToken, parseTtlToMs } from "../../lib/refreshTokens.js";
import { webauthnOrigin, webauthnRpID } from "../../lib/webauthn.js";
import { sendNotificationEmail } from "../notifications/notifications.service.js";
import { enqueueEmail } from "../../jobs/emailQueue.js";
import { UnauthorizedError, ConflictError, EmailNotVerifiedError } from "../../lib/errors.js";
import { ensureYativoCustomer, tryEnsureYativoCustomer } from "../../lib/ensureYativoCustomer.js";
import { provisionDefaultWallets, tryProvisionDefaultWallets } from "../wallets/wallets.service.js";
import { verifyTotp } from "../../lib/totp.js";
import { getPlatformSettings } from "../platformSettings/platformSettings.service.js";
import { logCustomerAction } from "../security/auditLog.service.js";
import logger from "../../lib/logger.js";
import type { CreateCustomerInput } from "@white-label/shared-types";

/** Best-effort request context, captured for the "active sessions" list in portal Settings — never used for anything security-critical itself. */
export type SessionMeta = { ip?: string; userAgent?: string };

async function issueSession(prisma: PrismaClient, customerId: string, meta: SessionMeta = {}) {
  const { token: refreshToken, tokenHash } = generateRefreshToken();
  const row = await prisma.customerRefreshToken.create({
    data: {
      customerId,
      tokenHash,
      expiresAt: new Date(Date.now() + parseTtlToMs(env.PORTAL_JWT_REFRESH_TTL)),
      ip: meta.ip,
      userAgent: meta.userAgent,
      lastUsedAt: new Date(),
    },
  });
  // Explicit, not just implied by isPortalOwnerLevel's bypass — mirrors resolveStaffPermissions
  // giving OWNER/ADMIN the full list outright, so any future permission check reading
  // `customer.permissions` directly (rather than going through the bypass) sees the account
  // owner as fully permitted rather than as having none.
  const accessToken = signPortalAccessToken({ sub: customerId, permissions: [...PORTAL_PERMISSIONS], sessionId: row.id });
  return { accessToken, refreshToken };
}

/** A team member's effective permission set — ADMIN gets everything, mirroring the staff-side OWNER/ADMIN bypass. */
function effectiveMemberPermissions(member: CustomerTeamMember): string[] {
  return member.role === "ADMIN" ? [...PORTAL_PERMISSIONS] : member.permissions;
}

async function issueMemberSession(prisma: PrismaClient, member: CustomerTeamMember) {
  const accessToken = signPortalAccessToken({
    sub: member.id,
    principalType: "member",
    businessCustomerId: member.businessCustomerId,
    role: member.role === "ADMIN" ? "ADMIN" : "MEMBER",
    permissions: effectiveMemberPermissions(member),
  });
  const { token: refreshToken, tokenHash } = generateRefreshToken();
  await prisma.customerTeamRefreshToken.create({
    data: { memberId: member.id, tokenHash, expiresAt: new Date(Date.now() + parseTtlToMs(env.PORTAL_JWT_REFRESH_TTL)) },
  });
  return { accessToken, refreshToken };
}

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Generates and emails a fresh verification link, overwriting any previous unredeemed token. */
async function issueEmailVerification(prisma: PrismaClient, customerId: string, email: string, name: string) {
  const { token, tokenHash } = generateRefreshToken();
  await prisma.customer.update({
    where: { id: customerId },
    data: { emailVerificationTokenHash: tokenHash, emailVerificationExpiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS) },
  });
  const verifyUrl = `${env.WEB_APP_URL}/portal/verify-email?token=${token}`;
  await enqueueEmail({
    to: email,
    subject: "Verify your email address",
    html: `<p>Hi ${name},</p><p>Please confirm your email address to finish setting up your account. <a href="${verifyUrl}">Verify your email</a>. This link expires in 24 hours.</p>`,
  });
}

/**
 * Every non-admin customer must be registered on Yativo — collected here (not deferred to KYC)
 * so the invariant holds from the moment an account exists, not just once someone gets around to
 * submitting identity verification. Registration is NOT best-effort on this path: if Yativo
 * rejects it, the whole signup is rolled back (the local row is deleted) rather than leaving a
 * customer who exists locally but was never actually registered — better to fail signup loudly
 * than silently violate the invariant this was built to guarantee.
 */
export async function signupCustomer(prisma: PrismaClient, input: CreateCustomerInput, meta: SessionMeta = {}) {
  const existing = await prisma.customer.findUnique({ where: { email: input.email } });
  if (existing) throw new ConflictError("An account with this email already exists");

  const passwordHash = await hashPassword(input.password);
  const customer = await prisma.customer.create({
    data: {
      type: input.type,
      fullName: input.fullName,
      businessName: input.businessName,
      email: input.email,
      passwordHash,
      phone: `${input.callingCode}${input.phone}`,
      countryCode: input.countryCode,
    },
  });

  try {
    await ensureYativoCustomer(prisma, customer);
  } catch (err) {
    logger.error({ err, customerId: customer.id }, "Yativo registration failed at signup — rolling back the new account");
    await prisma.customer.delete({ where: { id: customer.id } });
    throw err;
  }

  // Wallet currency policy is admin-controlled (see modules/platformSettings): every customer
  // always gets defaultCurrencyCode, and ALL_AUTOMATIC additionally provisions every other
  // enabled currency up front rather than waiting for a self-service add or a deposit.
  await provisionDefaultWallets(prisma, customer.id);

  const name = customer.fullName ?? customer.businessName ?? customer.email;
  // A verification email always goes out regardless of the setting below, so turning
  // requireEmailVerification on later never strands a customer with no way to verify.
  await issueEmailVerification(prisma, customer.id, customer.email, name);
  await sendNotificationEmail(prisma, "WELCOME", customer.id, {});

  const settings = await getPlatformSettings(prisma);
  if (settings.requireEmailVerification) {
    return { customer, pendingVerification: true as const };
  }

  const { accessToken, refreshToken } = await issueSession(prisma, customer.id, meta);
  return { customer, accessToken, refreshToken, pendingVerification: false as const };
}

export async function verifyCustomerEmail(prisma: PrismaClient, token: string): Promise<void> {
  const tokenHash = hashRefreshToken(token);
  const customer = await prisma.customer.findUnique({ where: { emailVerificationTokenHash: tokenHash } });
  if (!customer || !customer.emailVerificationExpiresAt || customer.emailVerificationExpiresAt < new Date()) {
    throw new UnauthorizedError("This verification link is invalid or has expired");
  }
  await prisma.customer.update({
    where: { id: customer.id },
    data: { emailVerifiedAt: new Date(), emailVerificationTokenHash: null, emailVerificationExpiresAt: null },
  });
}

/** Silently no-ops for an unknown email or an already-verified account — never reveals which via timing or response. */
export async function resendVerificationEmail(prisma: PrismaClient, email: string): Promise<void> {
  const customer = await prisma.customer.findUnique({ where: { email } });
  if (!customer || customer.emailVerifiedAt) return;
  const name = customer.fullName ?? customer.businessName ?? customer.email;
  await issueEmailVerification(prisma, customer.id, customer.email, name);
}

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour — shorter-lived than email verification since it grants account takeover, not just address confirmation.

/** Silently no-ops for an unknown email — never reveals which via timing or response, same as resendVerificationEmail. */
export async function requestPasswordReset(prisma: PrismaClient, email: string): Promise<void> {
  const customer = await prisma.customer.findUnique({ where: { email } });
  if (!customer) return;

  const { token, tokenHash } = generateRefreshToken();
  await prisma.customer.update({
    where: { id: customer.id },
    data: { passwordResetTokenHash: tokenHash, passwordResetExpiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS) },
  });
  const resetUrl = `${env.WEB_APP_URL}/portal/reset-password?token=${token}`;
  const name = customer.fullName ?? customer.businessName ?? "there";
  await enqueueEmail({
    to: customer.email,
    subject: "Reset your password",
    html: `<p>Hi ${name},</p><p>We got a request to reset your password. <a href="${resetUrl}">Choose a new password</a>. This link expires in 1 hour. If you didn't request this, you can safely ignore this email — your password won't change.</p>`,
  });
}

/** Redeems a reset link — revokes every active session on success, same as changeCustomerPassword, since a password reset is exactly the situation where any existing session might not be the account owner's. */
export async function resetPassword(prisma: PrismaClient, token: string, newPassword: string, meta: SessionMeta = {}): Promise<void> {
  const tokenHash = hashRefreshToken(token);
  const customer = await prisma.customer.findUnique({ where: { passwordResetTokenHash: tokenHash } });
  if (!customer || !customer.passwordResetExpiresAt || customer.passwordResetExpiresAt < new Date()) {
    throw new UnauthorizedError("This reset link is invalid or has expired");
  }
  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.customer.update({ where: { id: customer.id }, data: { passwordHash, passwordResetTokenHash: null, passwordResetExpiresAt: null } }),
    prisma.customerRefreshToken.updateMany({ where: { customerId: customer.id, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  await logCustomerAction(prisma, customer.id, "Reset password", meta);
}

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000; // 15 minutes — short-lived since redeeming it is an immediate, full login, not just an identity confirmation.

/** Silently no-ops for an unknown email — same anti-enumeration posture as resendVerificationEmail/requestPasswordReset. Password login still works regardless of this — this is only which flow the login page presents by default (see PlatformSettings.customerLoginMethod). */
export async function requestMagicLink(prisma: PrismaClient, email: string): Promise<void> {
  const customer = await prisma.customer.findUnique({ where: { email } });
  if (!customer) return;
  if (customer.status === "FROZEN") return;

  const { token, tokenHash } = generateRefreshToken();
  await prisma.customer.update({
    where: { id: customer.id },
    data: { magicLinkTokenHash: tokenHash, magicLinkExpiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS) },
  });
  const magicLinkUrl = `${env.WEB_APP_URL}/portal/magic-link?token=${token}`;
  const name = customer.fullName ?? customer.businessName ?? "there";
  await enqueueEmail({
    to: customer.email,
    subject: "Your sign-in link",
    html: `<p>Hi ${name},</p><p><a href="${magicLinkUrl}">Click here to sign in</a>. This link expires in 15 minutes and can only be used once. If you didn't request this, you can safely ignore this email.</p>`,
  });
}

/** Redeems a magic link into a real session — a single-use, short-lived token stands in for password+2FA together, same trust level this app already gives a passkey login. */
export async function verifyMagicLink(prisma: PrismaClient, token: string, meta: SessionMeta = {}) {
  const tokenHash = hashRefreshToken(token);
  const customer = await prisma.customer.findUnique({ where: { magicLinkTokenHash: tokenHash } });
  if (!customer || !customer.magicLinkExpiresAt || customer.magicLinkExpiresAt < new Date()) {
    throw new UnauthorizedError("This sign-in link is invalid or has expired");
  }
  if (customer.status === "FROZEN") throw new UnauthorizedError("This account has been frozen — contact support");

  await prisma.customer.update({ where: { id: customer.id }, data: { magicLinkTokenHash: null, magicLinkExpiresAt: null, lastLoginAt: new Date() } });
  await Promise.all([tryEnsureYativoCustomer(prisma, customer), tryProvisionDefaultWallets(prisma, customer.id)]);

  const { accessToken, refreshToken } = await issueSession(prisma, customer.id, meta);
  await logCustomerAction(prisma, customer.id, "Signed in (magic link)", meta);
  return { customer, accessToken, refreshToken };
}

export async function loginCustomer(prisma: PrismaClient, email: string, password: string, meta: SessionMeta = {}) {
  const customer = await prisma.customer.findUnique({ where: { email } });
  if (!customer) {
    // Not a business account owner — check whether this is an invited team member's own login
    // before giving up. A pending (not-yet-accepted) invite has no passwordHash, so it can never
    // pass verifyPassword and correctly falls through to the generic "invalid" error below.
    const member = await prisma.customerTeamMember.findUnique({ where: { email } });
    if (!member?.passwordHash || !(await verifyPassword(password, member.passwordHash))) {
      throw new UnauthorizedError("Invalid email or password");
    }
    if (!member.isActive) throw new UnauthorizedError("This account has been deactivated — contact your business administrator");
    const { accessToken, refreshToken } = await issueMemberSession(prisma, member);
    return { requiresTwoFactor: false as const, principalType: "member" as const, member, accessToken, refreshToken };
  }
  if (!(await verifyPassword(password, customer.passwordHash))) {
    throw new UnauthorizedError("Invalid email or password");
  }
  if (customer.status === "FROZEN") throw new UnauthorizedError("This account has been frozen — contact support");

  const settings = await getPlatformSettings(prisma);
  if (settings.requireEmailVerification && !customer.emailVerifiedAt) throw new EmailNotVerifiedError();

  // 2FA-enabled accounts don't get a session from password alone — the challenge token proves
  // the password step already passed, and POST /portal/auth/2fa/verify redeems it for the real
  // session once the TOTP/backup code checks out. lastLoginAt/Yativo self-heal happen there too.
  if (customer.twoFactorEnabled) {
    return { requiresTwoFactor: true as const, challengeToken: signPortal2faChallengeToken({ sub: customer.id }) };
  }

  await prisma.customer.update({ where: { id: customer.id }, data: { lastLoginAt: new Date() } });

  // Every customer is expected to be registered on Yativo — this is the self-healing checkpoint
  // for anyone who reached a usable state without going through a KYC submission (see
  // tryEnsureYativoCustomer's doc comment). Best-effort: never blocks login.
  // Independent of each other (wallet provisioning never depends on yativoCustomerId) — run
  // together instead of back-to-back on every login.
  await Promise.all([tryEnsureYativoCustomer(prisma, customer), tryProvisionDefaultWallets(prisma, customer.id)]);

  const { accessToken, refreshToken } = await issueSession(prisma, customer.id, meta);
  await logCustomerAction(prisma, customer.id, "Signed in", meta);
  return { requiresTwoFactor: false as const, principalType: "owner" as const, customer, accessToken, refreshToken };
}

/** Redeems a login's 2FA challenge token for a real session — accepts either a live 6-digit TOTP code or a one-time backup code (removed from the account once used). */
export async function verifyTwoFactorLogin(prisma: PrismaClient, challengeToken: string, code: string, meta: SessionMeta = {}) {
  let customerId: string;
  try {
    customerId = verifyPortal2faChallengeToken(challengeToken).sub;
  } catch {
    throw new UnauthorizedError("This verification step has expired — please sign in again");
  }

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer || !customer.twoFactorEnabled || !customer.twoFactorSecret) {
    throw new UnauthorizedError("Two-factor authentication is no longer enabled for this account");
  }

  const normalizedCode = code.trim();
  let usedBackupCode = false;
  if (/^\d{6}$/.test(normalizedCode)) {
    if (!verifyTotp(customer.twoFactorSecret, normalizedCode)) throw new UnauthorizedError("Invalid verification code");
  } else {
    let matchedIndex = -1;
    for (let i = 0; i < customer.twoFactorBackupCodeHashes.length; i++) {
      if (await verifyPassword(normalizedCode, customer.twoFactorBackupCodeHashes[i]!)) {
        matchedIndex = i;
        break;
      }
    }
    if (matchedIndex === -1) throw new UnauthorizedError("Invalid verification code");
    usedBackupCode = true;
    const remaining = customer.twoFactorBackupCodeHashes.filter((_, i) => i !== matchedIndex);
    await prisma.customer.update({ where: { id: customer.id }, data: { twoFactorBackupCodeHashes: remaining } });
  }

  await prisma.customer.update({ where: { id: customer.id }, data: { lastLoginAt: new Date() } });
  // Independent of each other (wallet provisioning never depends on yativoCustomerId) — run
  // together instead of back-to-back on every login.
  await Promise.all([tryEnsureYativoCustomer(prisma, customer), tryProvisionDefaultWallets(prisma, customer.id)]);

  const { accessToken, refreshToken } = await issueSession(prisma, customer.id, meta);
  await logCustomerAction(prisma, customer.id, "Signed in (2FA)", meta);
  return { customer, accessToken, refreshToken, usedBackupCode };
}

export async function refreshCustomerSession(prisma: PrismaClient, refreshToken: string, meta: SessionMeta = {}) {
  const tokenHash = hashRefreshToken(refreshToken);

  // No customer include here — every field this function needs (customerId) is already a plain
  // column on the token row itself, so fetching the full related Customer (passwordHash,
  // twoFactorSecret, ...) on every session refresh would be pure waste.
  const existing = await prisma.customerRefreshToken.findUnique({ where: { tokenHash } });
  if (existing) {
    if (existing.revokedAt || existing.expiresAt < new Date()) throw new UnauthorizedError("Invalid or expired refresh token");
    await prisma.customerRefreshToken.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });
    const { token: newRefreshToken, tokenHash: newHash } = generateRefreshToken();
    const row = await prisma.customerRefreshToken.create({
      data: {
        customerId: existing.customerId,
        tokenHash: newHash,
        expiresAt: new Date(Date.now() + parseTtlToMs(env.PORTAL_JWT_REFRESH_TTL)),
        // Rotation carries the session's device identity forward — a refresh isn't a new device,
        // just a new token for the same one, so this keeps the "active sessions" list showing one
        // stable row per device instead of a new one on every silent refresh. ip/userAgent are
        // refreshed to whatever this request actually reports (a laptop could move networks).
        ip: meta.ip ?? existing.ip,
        userAgent: meta.userAgent ?? existing.userAgent,
        lastUsedAt: new Date(),
      },
    });
    const accessToken = signPortalAccessToken({ sub: existing.customerId, permissions: [...PORTAL_PERMISSIONS], sessionId: row.id });
    return { accessToken, refreshToken: newRefreshToken };
  }

  // Not a business owner's refresh token — check the team-member table before giving up.
  const memberToken = await prisma.customerTeamRefreshToken.findUnique({ where: { tokenHash }, include: { member: true } });
  if (!memberToken || memberToken.revokedAt || memberToken.expiresAt < new Date()) {
    throw new UnauthorizedError("Invalid or expired refresh token");
  }
  if (!memberToken.member.isActive) throw new UnauthorizedError("This account has been deactivated — contact your business administrator");
  await prisma.customerTeamRefreshToken.update({ where: { id: memberToken.id }, data: { revokedAt: new Date() } });
  return issueMemberSession(prisma, memberToken.member);
}

/** Revokes every other active session on change — a new password should mean anyone else's stolen session stops working, same as the staff-side changePassword. */
export async function changeCustomerPassword(prisma: PrismaClient, customerId: string, currentPassword: string, newPassword: string, meta: SessionMeta = {}) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new UnauthorizedError("Account not found");
  if (!(await verifyPassword(currentPassword, customer.passwordHash))) {
    throw new UnauthorizedError("Current password is incorrect");
  }
  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.customer.update({ where: { id: customerId }, data: { passwordHash } }),
    prisma.customerRefreshToken.updateMany({ where: { customerId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  await logCustomerAction(prisma, customerId, "Changed password", meta);
}

export async function logoutCustomer(prisma: PrismaClient, refreshToken: string) {
  const tokenHash = hashRefreshToken(refreshToken);
  await Promise.all([
    prisma.customerRefreshToken.updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: new Date() } }),
    prisma.customerTeamRefreshToken.updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
}

const PASSKEY_LOGIN_TTL_SECONDS = 300;
const passkeyLoginFlowKey = (flowId: string) => `webauthn:login:customer:${flowId}`;

/**
 * No `allowCredentials` — this is a discoverable-credential ("usernameless") flow: the browser's
 * own passkey picker shows every customer passkey registered for this RP, so there's no email
 * step. The challenge is keyed by a random flowId (not a user id) since the user isn't known yet.
 */
export async function getCustomerPasskeyLoginOptions(redis: Redis) {
  const options = await generateAuthenticationOptions({ rpID: webauthnRpID, userVerification: "required" });
  const flowId = randomUUID();
  await redis.set(passkeyLoginFlowKey(flowId), options.challenge, "EX", PASSKEY_LOGIN_TTL_SECONDS);
  return { flowId, options };
}

/** A passkey is a single strong, phishing-resistant, user-verified factor — it stands in for password+2FA together, so this skips straight to issuing a session even for accounts with TOTP 2FA enabled. */
export async function verifyCustomerPasskeyLogin(prisma: PrismaClient, redis: Redis, flowId: string, response: AuthenticationResponseJSON, meta: SessionMeta = {}) {
  const key = passkeyLoginFlowKey(flowId);
  const expectedChallenge = await redis.get(key);
  if (!expectedChallenge) throw new UnauthorizedError("This sign-in attempt expired — please try again");
  await redis.del(key);

  const passkey = await prisma.customerPasskey.findUnique({ where: { credentialId: response.id }, include: { customer: true } });
  if (!passkey) throw new UnauthorizedError("This passkey isn't registered");
  if (passkey.customer.status === "FROZEN") throw new UnauthorizedError("This account has been frozen — contact support");

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

  await prisma.customerPasskey.update({
    where: { id: passkey.id },
    data: { counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() },
  });
  await prisma.customer.update({ where: { id: passkey.customer.id }, data: { lastLoginAt: new Date() } });
  await Promise.all([tryEnsureYativoCustomer(prisma, passkey.customer), tryProvisionDefaultWallets(prisma, passkey.customer.id)]);

  const { accessToken, refreshToken } = await issueSession(prisma, passkey.customer.id, meta);
  await logCustomerAction(prisma, passkey.customer.id, "Signed in (passkey)", meta);
  return { customer: passkey.customer, accessToken, refreshToken };
}
