/**
 * Encrypted-at-rest store of each customer's full KYC/KYB payload (see the
 * EncryptedKycSubmission model) — the complete counterpart to kycDraft.ts's deliberately
 * non-sensitive snapshot. Written after every successful submit/update, read back only to
 * pre-fill that same customer's "Update KYC" wizard.
 */

import type { PrismaClient, CustomerType } from "@prisma/client";
import type { UploadedFile } from "@white-label/yativo-sdk";
import { encryptKycPayload, decryptKycPayload } from "../../lib/kycEncryption.js";

export type StoredKycFile = { fieldPath: string; filename: string; mimetype: string; base64: string };
export type StoredKycSubmission = { payload: Record<string, unknown>; files: StoredKycFile[] };

export async function saveEncryptedKycSubmission(
  prisma: PrismaClient,
  customerId: string,
  type: CustomerType,
  action: "SUBMIT" | "UPDATE",
  payload: object,
  files: Map<string, UploadedFile>,
): Promise<void> {
  const record: StoredKycSubmission = {
    payload: payload as Record<string, unknown>,
    files: [...files].map(([fieldPath, f]) => ({ fieldPath, filename: f.filename, mimetype: f.mimetype, base64: f.buffer.toString("base64") })),
  };
  await prisma.encryptedKycSubmission.create({
    data: { customerId, type, action, ciphertext: encryptKycPayload(record) },
  });
}

export async function loadLatestKycSubmission(prisma: PrismaClient, customerId: string): Promise<(StoredKycSubmission & { type: CustomerType; createdAt: Date }) | null> {
  const row = await prisma.encryptedKycSubmission.findFirst({ where: { customerId }, orderBy: { createdAt: "desc" } });
  if (!row) return null;
  return { ...decryptKycPayload<StoredKycSubmission>(row.ciphertext), type: row.type, createdAt: row.createdAt };
}
