import type { PrismaClient } from "@prisma/client";
import type { UpsertEndorsementDisplaySettingInput } from "@white-label/shared-types";
import { yativoClient } from "../../lib/yativoClient.js";

function toDto(row: { service: string; displayName: string | null; description: string | null; isVisible: boolean; sortOrder: number; updatedAt: Date }) {
  return {
    service: row.service,
    displayName: row.displayName,
    description: row.description,
    isVisible: row.isVisible,
    sortOrder: row.sortOrder,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * `knownServices` is a best-effort catalog, not an exhaustive one — Yativo has no endpoint that
 * lists every possible endorsement service, so this unions every slug this deployment has actually
 * seen: the currencies-and-endorsements rails, the hardcoded "virtual_card" card requirement, and
 * anything an admin has already configured. A brand-new slug can still show up on a live
 * customer's endorsement list before it appears here — the admin UI lets one be added by hand.
 */
export async function listEndorsementDisplaySettings(prisma: PrismaClient) {
  const [overrides, currencies] = await Promise.all([
    prisma.endorsementDisplaySetting.findMany({ orderBy: [{ sortOrder: "asc" }, { service: "asc" }] }),
    yativoClient.fiat.virtualAccounts.listSupportedCurrencies(),
  ]);
  const known = new Set<string>(["virtual_card"]);
  for (const c of currencies) if (c.endorsement) known.add(c.endorsement);
  for (const o of overrides) known.add(o.service);
  return { overrides: overrides.map(toDto), knownServices: Array.from(known).sort() };
}

export async function upsertEndorsementDisplaySetting(prisma: PrismaClient, service: string, input: UpsertEndorsementDisplaySettingInput) {
  const row = await prisma.endorsementDisplaySetting.upsert({
    where: { service },
    update: input,
    create: { service, ...input },
  });
  return toDto(row);
}

/** Resets a service back to defaults (auto-formatted name, visible) — a missing row is already the default, so deleting one that doesn't exist is a no-op rather than an error. */
export async function deleteEndorsementDisplaySetting(prisma: PrismaClient, service: string) {
  await prisma.endorsementDisplaySetting.deleteMany({ where: { service } });
}
