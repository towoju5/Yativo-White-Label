import { randomBytes, createHash } from "node:crypto";
import type { ApiKey, PrismaClient } from "@prisma/client";
import { NotFoundError } from "../../lib/errors.js";

export function apiKeyToDto(key: ApiKey) {
  return {
    id: key.id,
    name: key.name,
    last4: key.last4,
    createdAt: key.createdAt.toISOString(),
    revokedAt: key.revokedAt?.toISOString() ?? null,
  };
}

export async function listApiKeys(prisma: PrismaClient) {
  const keys = await prisma.apiKey.findMany({ orderBy: { createdAt: "desc" } });
  return keys.map(apiKeyToDto);
}

/** Returns the plaintext key once — only the sha256 hash + last4 are ever persisted. */
export async function createApiKey(prisma: PrismaClient, createdById: string, name: string) {
  const raw = randomBytes(32).toString("hex");
  const plaintextKey = `wlk_${raw}`;
  const last4 = raw.slice(-4);
  const keyHash = createHash("sha256").update(plaintextKey).digest("hex");

  const key = await prisma.apiKey.create({ data: { name, keyHash, last4, createdById } });
  return { ...apiKeyToDto(key), plaintextKey };
}

export async function revokeApiKey(prisma: PrismaClient, id: string) {
  const key = await prisma.apiKey.findUnique({ where: { id } });
  if (!key) throw new NotFoundError("ApiKey");
  await prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
}
