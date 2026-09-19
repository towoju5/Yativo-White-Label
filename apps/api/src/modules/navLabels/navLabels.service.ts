import type { PrismaClient } from "@prisma/client";
import type { UpsertNavLabelOverrideInput } from "@white-label/shared-types";

/**
 * Every i18n key the customer portal's nav renders, across all five visual templates (atlas,
 * aurora, meridian, nova, prime) — see the "nav" block in apps/web/src/i18n/locales/en.json. Each
 * template defines its own static array of nav items, but they all render their labels through
 * `t(key, defaultLabel)` against these same shared keys, so one override here applies everywhere
 * that key shows up. Kept in sync by hand since the template nav arrays are static, not derived
 * from any shared config.
 */
export const KNOWN_NAV_LABEL_KEYS = [
  "nav.account",
  "nav.atlas.contacts",
  "nav.atlas.home",
  "nav.atlas.profile",
  "nav.atlas.send",
  "nav.beneficiaries",
  "nav.businessSpendCards",
  "nav.cards",
  "nav.cryptoWallets",
  "nav.dashboard",
  "nav.deposit",
  "nav.home",
  "nav.logout",
  "nav.payout",
  "nav.portal",
  "nav.profileKyc",
  "nav.section.account",
  "nav.section.manage",
  "nav.sendMoney",
  "nav.settings",
  "nav.statements",
  "nav.support",
  "nav.team",
  "nav.transactions",
  "nav.virtualAccounts",
  "nav.wallets",
] as const;

function toDto(row: { key: string; translations: unknown; updatedAt: Date }) {
  return { key: row.key, translations: row.translations as Record<string, string>, updatedAt: row.updatedAt.toISOString() };
}

/** Public — the customer portal fetches this before rendering its nav (see apps/web/src/hooks/useNavLabelOverrides.ts), same access model as GET /branding. */
export async function listNavLabelOverrides(prisma: PrismaClient) {
  const overrides = await prisma.navLabelOverride.findMany({ orderBy: { key: "asc" } });
  return { overrides: overrides.map(toDto), knownKeys: [...KNOWN_NAV_LABEL_KEYS] };
}

export async function upsertNavLabelOverride(prisma: PrismaClient, key: string, input: UpsertNavLabelOverrideInput) {
  // Drop blank entries rather than storing them — an empty string would otherwise render as a
  // blank nav label instead of falling back to the shipped default the way "no override" does.
  const translations = Object.fromEntries(Object.entries(input.translations).filter(([, label]) => label.trim().length > 0));
  const row = await prisma.navLabelOverride.upsert({
    where: { key },
    update: { translations },
    create: { key, translations },
  });
  return toDto(row);
}

/** Resets a nav item back to its shipped default label in every locale — a missing row is already the default, so deleting one that doesn't exist is a no-op rather than an error. */
export async function deleteNavLabelOverride(prisma: PrismaClient, key: string) {
  await prisma.navLabelOverride.deleteMany({ where: { key } });
}
