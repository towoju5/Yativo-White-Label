import type { PrismaClient, StaffPasskey } from "@prisma/client";
import type { Redis } from "ioredis";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { webauthnOrigin, webauthnRpID } from "../../lib/webauthn.js";
import { getBranding } from "../branding/branding.service.js";
import { AppError, NotFoundError } from "../../lib/errors.js";

const REGISTRATION_TTL_SECONDS = 300;
const registrationChallengeKey = (staffUserId: string) => `webauthn:reg:staff:${staffUserId}`;

function toDto(row: StaffPasskey) {
  return {
    id: row.id,
    name: row.name,
    deviceType: row.deviceType,
    backedUp: row.backedUp,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
  };
}

export async function listStaffPasskeys(prisma: PrismaClient, staffUserId: string) {
  const rows = await prisma.staffPasskey.findMany({ where: { staffUserId }, orderBy: { createdAt: "asc" } });
  return rows.map(toDto);
}

/** Stashes the challenge in Redis (5 min TTL) — same pattern as portal 2FA setup — until verifyStaffPasskeyRegistration redeems it. */
export async function getStaffPasskeyRegistrationOptions(prisma: PrismaClient, redis: Redis, staffUserId: string, staffEmail: string) {
  const [existing, branding] = await Promise.all([
    prisma.staffPasskey.findMany({ where: { staffUserId }, select: { credentialId: true, transports: true } }),
    getBranding(prisma),
  ]);

  const options = await generateRegistrationOptions({
    rpName: branding.productName,
    rpID: webauthnRpID,
    userID: Buffer.from(staffUserId, "utf8"),
    userName: staffEmail,
    attestationType: "none",
    excludeCredentials: existing.map((p) => ({ id: p.credentialId, transports: p.transports as AuthenticatorTransportFuture[] })),
    // residentKey: "required" is what makes this a real passkey (discoverable credential) rather
    // than a plain WebAuthn second factor — it's what lets login work without typing an email first.
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });

  await redis.set(registrationChallengeKey(staffUserId), options.challenge, "EX", REGISTRATION_TTL_SECONDS);
  return options;
}

export async function verifyStaffPasskeyRegistration(
  prisma: PrismaClient,
  redis: Redis,
  staffUserId: string,
  response: RegistrationResponseJSON,
  name: string,
) {
  const key = registrationChallengeKey(staffUserId);
  const expectedChallenge = await redis.get(key);
  if (!expectedChallenge) throw new AppError("Your passkey setup session expired — start again.", 409, "SETUP_EXPIRED");
  await redis.del(key);

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: webauthnOrigin,
    expectedRPID: webauthnRpID,
  });
  if (!verification.verified || !verification.registrationInfo) {
    throw new AppError("Couldn't verify that passkey — please try again.", 400, "VERIFICATION_FAILED");
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  const row = await prisma.staffPasskey.create({
    data: {
      staffUserId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? [],
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      name,
    },
  });
  return toDto(row);
}

export async function renameStaffPasskey(prisma: PrismaClient, staffUserId: string, passkeyId: string, name: string) {
  const existing = await prisma.staffPasskey.findUnique({ where: { id: passkeyId } });
  if (!existing || existing.staffUserId !== staffUserId) throw new NotFoundError("Passkey");
  const row = await prisma.staffPasskey.update({ where: { id: passkeyId }, data: { name } });
  return toDto(row);
}

export async function deleteStaffPasskey(prisma: PrismaClient, staffUserId: string, passkeyId: string) {
  const existing = await prisma.staffPasskey.findUnique({ where: { id: passkeyId } });
  if (!existing || existing.staffUserId !== staffUserId) throw new NotFoundError("Passkey");
  await prisma.staffPasskey.delete({ where: { id: passkeyId } });
}
