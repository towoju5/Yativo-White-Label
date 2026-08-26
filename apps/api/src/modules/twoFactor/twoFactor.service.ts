import type { PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";
import qrcode from "qrcode";
import { generateBase32Secret, buildOtpauthUrl, verifyTotp, generateBackupCodes } from "../../lib/totp.js";
import { hashPassword, verifyPassword } from "../../lib/passwords.js";
import { getBranding } from "../branding/branding.service.js";
import { sendNotificationEmail } from "../notifications/notifications.service.js";
import { AppError, UnauthorizedError } from "../../lib/errors.js";

const PENDING_TTL_SECONDS = 600;
const pendingKey = (customerId: string) => `2fa:pending:${customerId}`;

export async function getTwoFactorStatus(prisma: PrismaClient, customerId: string) {
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId }, select: { twoFactorEnabled: true } });
  return { enabled: customer.twoFactorEnabled };
}

/** Generates a new secret and stashes it in Redis (10 min TTL) — nothing is persisted to the customer row until confirmTwoFactorSetup verifies a real code against it. */
export async function startTwoFactorSetup(prisma: PrismaClient, redis: Redis, customerId: string) {
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
  if (customer.twoFactorEnabled) throw new AppError("Two-factor authentication is already enabled.", 409, "ALREADY_ENABLED");

  const secret = generateBase32Secret();
  await redis.set(pendingKey(customerId), secret, "EX", PENDING_TTL_SECONDS);

  const branding = await getBranding(prisma);
  const otpauthUrl = buildOtpauthUrl({ secret, accountName: customer.email, issuer: branding.productName });
  const qrCodeDataUrl = await qrcode.toDataURL(otpauthUrl);
  return { secret, otpauthUrl, qrCodeDataUrl };
}

export async function confirmTwoFactorSetup(prisma: PrismaClient, redis: Redis, customerId: string, code: string) {
  const pendingSecret = await redis.get(pendingKey(customerId));
  if (!pendingSecret) throw new AppError("Your setup session expired — start again.", 409, "SETUP_EXPIRED");
  if (!verifyTotp(pendingSecret, code)) {
    throw new AppError("That code doesn't match — check your authenticator app and try again.", 400, "INVALID_CODE");
  }

  const backupCodes = generateBackupCodes();
  const backupCodeHashes = await Promise.all(backupCodes.map((c) => hashPassword(c)));

  await prisma.customer.update({
    where: { id: customerId },
    data: { twoFactorEnabled: true, twoFactorSecret: pendingSecret, twoFactorBackupCodeHashes: backupCodeHashes },
  });
  await redis.del(pendingKey(customerId));
  await sendNotificationEmail(prisma, "TWO_FACTOR_ENABLED", customerId, {});

  return { backupCodes };
}

export async function disableTwoFactor(prisma: PrismaClient, customerId: string, password: string) {
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
  if (!customer.twoFactorEnabled) throw new AppError("Two-factor authentication isn't enabled.", 409, "NOT_ENABLED");
  if (!(await verifyPassword(password, customer.passwordHash))) throw new UnauthorizedError("Incorrect password");

  await prisma.customer.update({
    where: { id: customerId },
    data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorBackupCodeHashes: [] },
  });
  await sendNotificationEmail(prisma, "TWO_FACTOR_DISABLED", customerId, {});
  return { enabled: false };
}
