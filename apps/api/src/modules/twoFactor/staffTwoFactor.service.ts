import type { PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";
import qrcode from "qrcode";
import { generateBase32Secret, buildOtpauthUrl, verifyTotp, generateBackupCodes } from "../../lib/totp.js";
import { hashPassword, verifyPassword } from "../../lib/passwords.js";
import { getBranding } from "../branding/branding.service.js";
import { enqueueEmail } from "../../jobs/emailQueue.js";
import { logAdminAction } from "../../lib/adminAuditLog.js";
import { AppError, UnauthorizedError, NotFoundError } from "../../lib/errors.js";

/** Staff-side mirror of twoFactor.service.ts — same TOTP + backup-code scheme, scoped to StaffUser instead of Customer. */

const PENDING_TTL_SECONDS = 600;
const pendingKey = (staffId: string) => `2fa:pending:staff:${staffId}`;

export async function getStaffTwoFactorStatus(prisma: PrismaClient, staffId: string) {
  const staff = await prisma.staffUser.findUniqueOrThrow({ where: { id: staffId }, select: { twoFactorEnabled: true } });
  return { enabled: staff.twoFactorEnabled };
}

export async function startStaffTwoFactorSetup(prisma: PrismaClient, redis: Redis, staffId: string) {
  const staff = await prisma.staffUser.findUniqueOrThrow({ where: { id: staffId } });
  if (staff.twoFactorEnabled) throw new AppError("Two-factor authentication is already enabled.", 409, "ALREADY_ENABLED");

  const secret = generateBase32Secret();
  await redis.set(pendingKey(staffId), secret, "EX", PENDING_TTL_SECONDS);

  const branding = await getBranding(prisma);
  const otpauthUrl = buildOtpauthUrl({ secret, accountName: staff.email, issuer: branding.productName });
  const qrCodeDataUrl = await qrcode.toDataURL(otpauthUrl);
  return { secret, otpauthUrl, qrCodeDataUrl };
}

export async function confirmStaffTwoFactorSetup(prisma: PrismaClient, redis: Redis, staffId: string, code: string) {
  const pendingSecret = await redis.get(pendingKey(staffId));
  if (!pendingSecret) throw new AppError("Your setup session expired — start again.", 409, "SETUP_EXPIRED");
  if (!verifyTotp(pendingSecret, code)) {
    throw new AppError("That code doesn't match — check your authenticator app and try again.", 400, "INVALID_CODE");
  }

  const backupCodes = generateBackupCodes();
  const backupCodeHashes = await Promise.all(backupCodes.map((c) => hashPassword(c)));

  const staff = await prisma.staffUser.update({
    where: { id: staffId },
    data: { twoFactorEnabled: true, twoFactorSecret: pendingSecret, twoFactorBackupCodeHashes: backupCodeHashes },
  });
  await redis.del(pendingKey(staffId));
  try {
    await enqueueEmail({ to: staff.email, subject: "Two-factor authentication enabled", html: "<p>Two-factor authentication was just turned on for your admin account.</p>" });
  } catch {
    // Never blocks — same posture as every other auth email in this codebase.
  }
  await logAdminAction(prisma, staffId, "staff.2fa_enabled", staffId);

  return { backupCodes };
}

export async function disableStaffTwoFactor(prisma: PrismaClient, staffId: string, password: string) {
  const staff = await prisma.staffUser.findUnique({ where: { id: staffId } });
  if (!staff) throw new NotFoundError("Staff member");
  if (!staff.twoFactorEnabled) throw new AppError("Two-factor authentication isn't enabled.", 409, "NOT_ENABLED");
  if (!staff.passwordHash || !(await verifyPassword(password, staff.passwordHash))) throw new UnauthorizedError("Incorrect password");

  await prisma.staffUser.update({
    where: { id: staffId },
    data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorBackupCodeHashes: [] },
  });
  try {
    await enqueueEmail({ to: staff.email, subject: "Two-factor authentication disabled", html: "<p>Two-factor authentication was just turned off for your admin account. If this wasn't you, contact another owner/admin immediately.</p>" });
  } catch {
    // Never blocks.
  }
  await logAdminAction(prisma, staffId, "staff.2fa_disabled", staffId);
  return { enabled: false };
}
