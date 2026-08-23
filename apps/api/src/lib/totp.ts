import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TIME_STEP_SECONDS = 30;
const DIGITS = 6;

export function generateBase32Secret(byteLength = 20): string {
  const buf = randomBytes(byteLength);
  let bits = "";
  for (const byte of buf) bits += byte.toString(2).padStart(8, "0");
  let secret = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    secret += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  return secret;
}

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, "");
  let bits = "";
  for (const char of clean) {
    const value = BASE32_ALPHABET.indexOf(char);
    if (value === -1) continue;
    bits += value.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

/** RFC 4226 HOTP — the counter-based primitive TOTP is built on. */
function hotp(secret: Buffer, counter: number): string {
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", secret).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  const code =
    ((hmac[offset]! & 0x7f) << 24) | ((hmac[offset + 1]! & 0xff) << 16) | ((hmac[offset + 2]! & 0xff) << 8) | (hmac[offset + 3]! & 0xff);
  return String(code % 10 ** DIGITS).padStart(DIGITS, "0");
}

/** RFC 6238 TOTP — HOTP keyed by the current 30-second time step. */
export function generateTotp(secretBase32: string, atTimeMs = Date.now()): string {
  const counter = Math.floor(atTimeMs / 1000 / TIME_STEP_SECONDS);
  return hotp(base32Decode(secretBase32), counter);
}

/** Accepts the previous/next time step too, to tolerate normal clock drift between server and authenticator app. */
export function verifyTotp(secretBase32: string, code: string, window = 1): boolean {
  const normalized = code.trim();
  if (!/^\d{6}$/.test(normalized)) return false;
  const now = Date.now();
  for (let step = -window; step <= window; step++) {
    const expected = generateTotp(secretBase32, now + step * TIME_STEP_SECONDS * 1000);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(normalized))) return true;
  }
  return false;
}

export function buildOtpauthUrl(opts: { secret: string; accountName: string; issuer: string }): string {
  const label = encodeURIComponent(`${opts.issuer}:${opts.accountName}`);
  const params = new URLSearchParams({ secret: opts.secret, issuer: opts.issuer, algorithm: "SHA1", digits: String(DIGITS), period: String(TIME_STEP_SECONDS) });
  return `otpauth://totp/${label}?${params.toString()}`;
}

const BACKUP_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I — avoids transcription errors

export function generateBackupCodes(count = 8, length = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = randomBytes(length);
    let code = "";
    for (const b of bytes) code += BACKUP_CODE_ALPHABET[b % BACKUP_CODE_ALPHABET.length];
    codes.push(code);
  }
  return codes;
}
