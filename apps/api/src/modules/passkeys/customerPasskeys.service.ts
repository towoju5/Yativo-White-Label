import type { PrismaClient, CustomerPasskey } from "@prisma/client";
import type { Redis } from "ioredis";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { webauthnOrigin, webauthnRpID } from "../../lib/webauthn.js";
import { getBranding } from "../branding/branding.service.js";
import { sendNotificationEmail } from "../notifications/notifications.service.js";
import { AppError, NotFoundError } from "../../lib/errors.js";

const REGISTRATION_TTL_SECONDS = 300;
const registrationChallengeKey = (customerId: string) => `webauthn:reg:customer:${customerId}`;

function toDto(row: CustomerPasskey) {
  return {
    id: row.id,
    name: row.name,
    deviceType: row.deviceType,
    backedUp: row.backedUp,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
  };
}

export async function listCustomerPasskeys(prisma: PrismaClient, customerId: string) {
  const rows = await prisma.customerPasskey.findMany({ where: { customerId }, orderBy: { createdAt: "asc" } });
  return rows.map(toDto);
}

/** Stashes the challenge in Redis (5 min TTL) — same pattern as portal 2FA setup — until verifyCustomerPasskeyRegistration redeems it. */
export async function getCustomerPasskeyRegistrationOptions(prisma: PrismaClient, redis: Redis, customerId: string, customerEmail: string) {
  const [existing, branding] = await Promise.all([
    prisma.customerPasskey.findMany({ where: { customerId }, select: { credentialId: true, transports: true } }),
    getBranding(prisma),
  ]);

  const options = await generateRegistrationOptions({
    rpName: branding.productName,
    rpID: webauthnRpID,
    userID: Buffer.from(customerId, "utf8"),
    userName: customerEmail,
    attestationType: "none",
    excludeCredentials: existing.map((p) => ({ id: p.credentialId, transports: p.transports as AuthenticatorTransportFuture[] })),
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });

  await redis.set(registrationChallengeKey(customerId), options.challenge, "EX", REGISTRATION_TTL_SECONDS);
  return options;
}

export async function verifyCustomerPasskeyRegistration(
  prisma: PrismaClient,
  redis: Redis,
  customerId: string,
  response: RegistrationResponseJSON,
  name: string,
) {
  const key = registrationChallengeKey(customerId);
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
  const row = await prisma.customerPasskey.create({
    data: {
      customerId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? [],
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      name,
    },
  });
  await sendNotificationEmail(prisma, "PASSKEY_ADDED", customerId, { passkeyName: name });
  return toDto(row);
}

export async function renameCustomerPasskey(prisma: PrismaClient, customerId: string, passkeyId: string, name: string) {
  const existing = await prisma.customerPasskey.findUnique({ where: { id: passkeyId } });
  if (!existing || existing.customerId !== customerId) throw new NotFoundError("Passkey");
  const row = await prisma.customerPasskey.update({ where: { id: passkeyId }, data: { name } });
  return toDto(row);
}

export async function deleteCustomerPasskey(prisma: PrismaClient, customerId: string, passkeyId: string) {
  const existing = await prisma.customerPasskey.findUnique({ where: { id: passkeyId } });
  if (!existing || existing.customerId !== customerId) throw new NotFoundError("Passkey");
  await prisma.customerPasskey.delete({ where: { id: passkeyId } });
  await sendNotificationEmail(prisma, "PASSKEY_REMOVED", customerId, { passkeyName: existing.name });
}
