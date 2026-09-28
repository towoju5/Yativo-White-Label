import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../config/env.js";

const key = Buffer.from(env.KYC_ENCRYPTION_KEY, "hex");
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** AES-256-GCM under KYC_ENCRYPTION_KEY. Output is iv || auth tag || ciphertext, stored as-is in a Bytes column. */
export function encryptKycPayload(value: unknown): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptKycPayload<T = unknown>(payload: Uint8Array): T {
  const buf = Buffer.from(payload);
  if (buf.length < IV_BYTES + TAG_BYTES) throw new Error("Invalid encrypted KYC payload");
  const decipher = createDecipheriv("aes-256-gcm", key, buf.subarray(0, IV_BYTES));
  decipher.setAuthTag(buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  const plaintext = Buffer.concat([decipher.update(buf.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString("utf8");
  return JSON.parse(plaintext) as T;
}
