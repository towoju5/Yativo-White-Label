import { randomBytes, createHash } from "node:crypto";

const REFRESH_TOKEN_BYTES = 48;

export function generateRefreshToken(): { token: string; tokenHash: string } {
  const token = randomBytes(REFRESH_TOKEN_BYTES).toString("hex");
  return { token, tokenHash: hashRefreshToken(token) };
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function parseTtlToMs(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match) throw new Error(`Invalid TTL string: ${ttl}`);
  const value = Number(match[1]);
  const unit = match[2];
  const multiplier = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit as "s" | "m" | "h" | "d"];
  return value * multiplier;
}
