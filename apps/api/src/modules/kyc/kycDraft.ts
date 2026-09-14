/**
 * Snapshot of a customer's most recent KYC/KYB submission *attempt* — saved right after the
 * request body passes zod validation, before the Yativo call, so a customer who gets rejected
 * (by us or by Yativo) doesn't have to retype everything on their next attempt. Only ever holds
 * the non-sensitive subset of the form: tax IDs, BVN/NIN, ID document numbers/images,
 * proof-of-address files, and any other uploaded document files are always stripped out here and
 * never written to `Customer.kycDraft` — see SENSITIVE_PATHS below.
 */

import type { Prisma } from "@prisma/client";

type JsonRecord = Record<string, unknown>;

/**
 * Dot-paths (with "*" for "every array element") of fields to drop before persisting a draft.
 * Kept in sync with the sensitive fields in packages/shared-types/src/kyc.schema.ts — anything
 * that's a document image/file, an ID number, or a government tax ID.
 */
const INDIVIDUAL_SENSITIVE_PATHS = [
  "taxId",
  "bvn",
  "nin",
  "selfieImage",
  "residentialAddress.proofOfAddressFile",
  "identifyingInformation.*.number",
  "identifyingInformation.*.imageFront",
  "identifyingInformation.*.imageBack",
  "uploadedDocuments",
];

const BUSINESS_SENSITIVE_PATHS = [
  "taxId",
  "physicalAddress.proofOfAddressFile",
  "associatedPersons.*.identifyingInformation",
  "documents",
];

function stripPaths(value: unknown, path: string[], patterns: string[]): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stripPaths(item, [...path, "*"], patterns));
  }
  if (value !== null && typeof value === "object") {
    const result: JsonRecord = {};
    for (const [key, v] of Object.entries(value as JsonRecord)) {
      const nextPath = [...path, key];
      if (patterns.includes(nextPath.join("."))) continue;
      result[key] = stripPaths(v, nextPath, patterns);
    }
    return result;
  }
  return value;
}

export function buildIndividualKycDraft(payload: unknown): Prisma.InputJsonValue {
  return stripPaths(payload, [], INDIVIDUAL_SENSITIVE_PATHS) as Prisma.InputJsonValue;
}

export function buildBusinessKycDraft(payload: unknown): Prisma.InputJsonValue {
  return stripPaths(payload, [], BUSINESS_SENSITIVE_PATHS) as Prisma.InputJsonValue;
}
