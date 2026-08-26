import type { PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";
import { randomUUID } from "node:crypto";
import { generateAuthenticationOptions, verifyAuthenticationResponse, type AuthenticationResponseJSON, type AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { env } from "../../config/env.js";
import { hashPassword, verifyPassword } from "../../lib/passwords.js";
import { signPortalAccessToken, signPortal2faChallengeToken, verifyPortal2faChallengeToken } from "../../lib/jwt.js";
import { generateRefreshToken, hashRefreshToken, parseTtlToMs } from "../../lib/refreshTokens.js";
import { webauthnOrigin, webauthnRpID } from "../../lib/webauthn.js";
import { UnauthorizedError, ConflictError } from "../../lib/errors.js";
import { ensureCustomerWalletAccount } from "../ledger/accounts.js";
import { ensureYativoCustomer, tryEnsureYativoCustomer } from "../../lib/ensureYativoCustomer.js";
import { getPlatformSettings } from "../platformSettings/platformSettings.service.js";
import { verifyTotp } from "../../lib/totp.js";
import logger from "../../lib/logger.js";
import type { CreateCustomerInput } from "@white-label/shared-types";

async function issueSession(prisma: PrismaClient, customerId: string) {
  const accessToken = signPortalAccessToken({ sub: customerId });
  const { token: refreshToken, tokenHash } = generateRefreshToken();
  await prisma.customerRefreshToken.create({
    data: { customerId, tokenHash, expiresAt: new Date(Date.now() + parseTtlToMs(env.PORTAL_JWT_REFRESH_TTL)) },
  });
  return { accessToken, refreshToken };
}

/**
 * Every non-admin customer must be registered on Yativo — collected here (not deferred to KYC)
 * so the invariant holds from the moment an account exists, not just once someone gets around to
 * submitting identity verification. Registration is NOT best-effort on this path: if Yativo
 * rejects it, the whole signup is rolled back (the local row is deleted) rather than leaving a
 * customer who exists locally but was never actually registered — better to fail signup loudly
 * than silently violate the invariant this was built to guarantee.
 */
export async function signupCustomer(prisma: PrismaClient, input: CreateCustomerInput) {
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
  const settings = await getPlatformSettings(prisma);
  await ensureCustomerWalletAccount(prisma, customer.id, settings.defaultCurrencyCode);
  if (settings.walletCurrencyMode === "ALL_AUTOMATIC") {
    const enabledCurrencies = await prisma.currency.findMany({ where: { isEnabledForCustomers: true } });
    for (const currency of enabledCurrencies) {
      if (currency.code === settings.defaultCurrencyCode) continue;
      await ensureCustomerWalletAccount(prisma, customer.id, currency.code);
    }
  }

  const { accessToken, refreshToken } = await issueSession(prisma, customer.id);
  return { customer, accessToken, refreshToken };
}

export async function loginCustomer(prisma: PrismaClient, email: string, password: string) {
  const customer = await prisma.customer.findUnique({ where: { email } });
  if (!customer || !(await verifyPassword(password, customer.passwordHash))) {
    throw new UnauthorizedError("Invalid email or password");
  }
  if (customer.status === "FROZEN") throw new UnauthorizedError("This account has been frozen — contact support");

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
  await tryEnsureYativoCustomer(prisma, customer);

  const { accessToken, refreshToken } = await issueSession(prisma, customer.id);
  return { requiresTwoFactor: false as const, customer, accessToken, refreshToken };
}

/** Redeems a login's 2FA challenge token for a real session — accepts either a live 6-digit TOTP code or a one-time backup code (removed from the account once used). */
export async function verifyTwoFactorLogin(prisma: PrismaClient, challengeToken: string, code: string) {
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
  await tryEnsureYativoCustomer(prisma, customer);

  const { accessToken, refreshToken } = await issueSession(prisma, customer.id);
  return { customer, accessToken, refreshToken, usedBackupCode };
}

export async function refreshCustomerSession(prisma: PrismaClient, refreshToken: string) {
  const tokenHash = hashRefreshToken(refreshToken);
  const existing = await prisma.customerRefreshToken.findUnique({ where: { tokenHash }, include: { customer: true } });
  if (!existing || existing.revokedAt || existing.expiresAt < new Date()) {
    throw new UnauthorizedError("Invalid or expired refresh token");
  }

  await prisma.customerRefreshToken.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });
  const { token: newRefreshToken, tokenHash: newHash } = generateRefreshToken();
  await prisma.customerRefreshToken.create({
    data: { customerId: existing.customerId, tokenHash: newHash, expiresAt: new Date(Date.now() + parseTtlToMs(env.PORTAL_JWT_REFRESH_TTL)) },
  });

  const accessToken = signPortalAccessToken({ sub: existing.customer.id });
  return { customer: existing.customer, accessToken, refreshToken: newRefreshToken };
}

export async function logoutCustomer(prisma: PrismaClient, refreshToken: string) {
  const tokenHash = hashRefreshToken(refreshToken);
  await prisma.customerRefreshToken.updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: new Date() } });
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
export async function verifyCustomerPasskeyLogin(prisma: PrismaClient, redis: Redis, flowId: string, response: AuthenticationResponseJSON) {
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
  await tryEnsureYativoCustomer(prisma, passkey.customer);

  const { accessToken, refreshToken } = await issueSession(prisma, passkey.customer.id);
  return { customer: passkey.customer, accessToken, refreshToken };
}
