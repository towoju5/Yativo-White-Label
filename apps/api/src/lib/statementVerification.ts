import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

export type StatementVerificationPayload = {
  walletId: string;
  dateFrom: string; // ISO date
  dateTo: string; // ISO date
};

/**
 * A statement is fully determined by (walletId, dateFrom, dateTo) — balances are recomputed live
 * from the ledger both at render time and at verification time. So rather than issuing/storing a
 * one-off verification record per statement, this signs those three fields directly: a stable,
 * self-contained token with no DB row and nothing to expire. The trade-off is deliberate — no
 * revocation and no visit audit trail — acceptable since the public verification endpoint only
 * ever returns non-sensitive summary data anyway (see publicStatements.routes.ts).
 */
function encode(payload: StatementVerificationPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function sign(encoded: string): string {
  return createHmac("sha256", env.STATEMENT_VERIFY_SECRET).update(encoded).digest("base64url");
}

export function signStatementToken(payload: StatementVerificationPayload): string {
  const encoded = encode(payload);
  return `${encoded}.${sign(encoded)}`;
}

export function verifyStatementToken(token: string): StatementVerificationPayload | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  const expected = sign(encoded);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (typeof payload?.walletId !== "string" || typeof payload?.dateFrom !== "string" || typeof payload?.dateTo !== "string") return null;
    return payload as StatementVerificationPayload;
  } catch {
    return null;
  }
}
