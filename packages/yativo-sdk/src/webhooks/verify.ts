import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies a Yativo webhook's HMAC-SHA256 signature against the raw request
 * body. Must be called with the *raw* (unparsed) body — verifying against a
 * re-serialized JSON object is not reliable, since key ordering/whitespace
 * can differ from what was actually signed.
 */
export function verifyYativoSignature(rawBody: string | Buffer, signatureHeader: string, secret: string): boolean {
  if (!signatureHeader) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = signatureHeader.trim();

  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(provided, "hex");
  if (expectedBuf.length !== providedBuf.length) return false;

  return timingSafeEqual(expectedBuf, providedBuf);
}
