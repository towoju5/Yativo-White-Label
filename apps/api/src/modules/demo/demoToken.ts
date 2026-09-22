import crypto from "node:crypto";

/** Generates a high-entropy one-time demo access token. Never logged or persisted raw — only its hash is stored (see hashDemoToken). */
export function generateDemoToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** SHA-256 hash of a demo token, for storage/lookup. Deterministic (not a slow password hash) — appropriate here because the token itself is 256 bits of randomness, not a low-entropy user-chosen secret. */
export function hashDemoToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
