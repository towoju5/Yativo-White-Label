import type { Redis } from "ioredis";
import { randomInt, createHash } from "node:crypto";

const TTL_SECONDS = 10 * 60;

function key(kind: string, principalId: string): string {
  return `stepup-email:${kind}:${principalId}`;
}

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** A short-lived numeric code for a new-location login challenge — same hash-not-raw-value posture as every other credential in this codebase, just in Redis (10 min TTL) instead of a DB column, mirroring the pending-TOTP-secret pattern in twoFactor.service.ts. `kind` namespaces customer vs. staff challenges under the same Redis key scheme. */
export async function issueEmailStepUpCode(redis: Redis, kind: "portal" | "staff", principalId: string): Promise<string> {
  const code = randomInt(100000, 1000000).toString();
  await redis.set(key(kind, principalId), hashCode(code), "EX", TTL_SECONDS);
  return code;
}

/** Single-use: deletes the stored hash on a correct match so the same code can't be replayed. */
export async function verifyEmailStepUpCode(redis: Redis, kind: "portal" | "staff", principalId: string, code: string): Promise<boolean> {
  const stored = await redis.get(key(kind, principalId));
  if (!stored) return false;
  const ok = stored === hashCode(code.trim());
  if (ok) await redis.del(key(kind, principalId));
  return ok;
}
