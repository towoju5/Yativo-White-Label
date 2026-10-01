import type { FastifyReply, FastifyRequest } from "fastify";
import { verifyTotp } from "../lib/totp.js";
import { verifyPassword } from "../lib/passwords.js";
import { verifyEmailStepUpCode } from "../lib/emailStepUp.js";
import { logAdminAction } from "../lib/adminAuditLog.js";
import { AppError, UnauthorizedError } from "../lib/errors.js";

export const STEP_UP_HEADER = "x-step-up-code";

/** Long enough to cover verifyTotp's ±1 step window, so a code can't be replayed for a second action. */
const USED_TOTP_TTL_SECONDS = 120;

export type StepUpMethod = "totp" | "email";

/**
 * Per-action re-verification for sensitive admin operations (reversals, card actions, staff and
 * security changes, ...) so a stray click can't trigger them. Every protected request must carry a
 * fresh code in the `x-step-up-code` header — no grace window, each action asks again:
 * - staff with 2FA enabled: a current authenticator code (single-use) or one of their backup codes;
 * - staff without 2FA: an emailed code, requested via POST /admin/step-up/email.
 *
 * Missing or wrong codes answer 428 with `stepUp: { method, action }` so the web client can prompt
 * and retry (see apiFetch in apps/web/src/lib/api-client.ts). Must run after requireStaffAuth.
 */
export function requireStepUp(action: string) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    if (!request.staffUser) throw new UnauthorizedError();
    const { prisma, redis } = request.server;
    const staffId = request.staffUser.sub;
    const staff = await prisma.staffUser.findUnique({
      where: { id: staffId },
      select: { isActive: true, twoFactorEnabled: true, twoFactorSecret: true, twoFactorBackupCodeHashes: true },
    });
    if (!staff || !staff.isActive) throw new UnauthorizedError("This staff account is no longer active");

    const method: StepUpMethod = staff.twoFactorEnabled && staff.twoFactorSecret ? "totp" : "email";
    const extra = { stepUp: { method, action } };
    const header = request.headers[STEP_UP_HEADER];
    const code = (Array.isArray(header) ? header[0] : header)?.trim();
    if (!code) {
      throw new AppError("Confirm this action with a verification code.", 428, "STEP_UP_REQUIRED", extra);
    }

    let ok = false;
    if (method === "email") {
      ok = await verifyEmailStepUpCode(redis, "staff-action", staffId, code);
    } else if (/^\d{6}$/.test(code)) {
      if (verifyTotp(staff.twoFactorSecret!, code)) {
        const fresh = await redis.set(`stepup:totp-used:${staffId}:${code}`, "1", "EX", USED_TOTP_TTL_SECONDS, "NX");
        if (!fresh) {
          throw new AppError("That code was already used — wait for the next one in your authenticator app.", 428, "STEP_UP_INVALID", extra);
        }
        ok = true;
      }
    } else {
      const index = await findBackupCode(staff.twoFactorBackupCodeHashes, code);
      if (index !== -1) {
        await prisma.staffUser.update({
          where: { id: staffId },
          data: { twoFactorBackupCodeHashes: staff.twoFactorBackupCodeHashes.filter((_, i) => i !== index) },
        });
        ok = true;
      }
    }

    if (!ok) throw new AppError("Invalid or expired verification code.", 428, "STEP_UP_INVALID", extra);
    await logAdminAction(prisma, staffId, "staff.step_up_verified", staffId, { action, method, route: request.routeOptions.url });
  };
}

async function findBackupCode(hashes: string[], code: string): Promise<number> {
  for (let i = 0; i < hashes.length; i++) {
    if (await verifyPassword(code, hashes[i]!)) return i;
  }
  return -1;
}
