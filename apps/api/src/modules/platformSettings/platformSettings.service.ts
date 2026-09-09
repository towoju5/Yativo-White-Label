import type { Currency, PlatformSettings, PrismaClient } from "@prisma/client";
import type { UpdatePlatformSettingsInput, UpdateKycRequirementsInput, UpdateYativoCustomerModeInput } from "@white-label/shared-types";
import { yativoClient } from "../../lib/yativoClient.js";
import { AppError, NotFoundError } from "../../lib/errors.js";

function currencyToDto(c: Currency) {
  return {
    code: c.code,
    name: c.name,
    symbol: c.symbol,
    decimals: c.decimals,
    logoUrl: c.logoUrl,
    countryCode: c.countryCode,
    isActive: c.isActive,
    isEnabledForCustomers: c.isEnabledForCustomers,
  };
}

function settingsToDto(s: PlatformSettings) {
  return {
    walletCurrencyMode: s.walletCurrencyMode,
    defaultCurrencyCode: s.defaultCurrencyCode,
    kycRequiredServices: s.kycRequiredServices,
    yativoCustomerMode: s.yativoCustomerMode,
    pooledYativoCustomerId: s.pooledYativoCustomerId,
    updatedAt: s.updatedAt.toISOString(),
  };
}

/** The singleton row is seeded by prisma/seed.ts — this throws rather than create-on-read so a missing row surfaces as a real deployment bug, not a silent USD default. */
export async function getPlatformSettings(prisma: PrismaClient): Promise<PlatformSettings> {
  const settings = await prisma.platformSettings.findUnique({ where: { id: 1 } });
  if (!settings) throw new NotFoundError("Platform settings");
  return settings;
}

export async function getWalletCurrencySettings(prisma: PrismaClient) {
  const [settings, currencies] = await Promise.all([getPlatformSettings(prisma), prisma.currency.findMany({ orderBy: { code: "asc" } })]);
  return { settings: settingsToDto(settings), currencies: currencies.map(currencyToDto) };
}

/** Pulls the authoritative currency list from Yativo and upserts into the local table — new currencies default to disabled-for-customers, existing rows keep their current enabled flag untouched. */
export async function syncCurrenciesFromYativo(prisma: PrismaClient) {
  const currencies = await yativoClient.fiat.currencies.listAll();
  for (const c of currencies) {
    await prisma.currency.upsert({
      where: { code: c.code },
      update: { name: c.name, decimals: c.decimals, isFiat: c.isFiat, symbol: c.symbol, logoUrl: c.logoUrl, countryCode: c.countryCode, isActive: c.isActive },
      create: { code: c.code, name: c.name, decimals: c.decimals, isFiat: c.isFiat, symbol: c.symbol, logoUrl: c.logoUrl, countryCode: c.countryCode, isActive: c.isActive },
    });
  }
  return getWalletCurrencySettings(prisma);
}

export async function updatePlatformSettings(prisma: PrismaClient, input: UpdatePlatformSettingsInput) {
  if (input.defaultCurrencyCode) {
    const currency = await prisma.currency.findUnique({ where: { code: input.defaultCurrencyCode } });
    if (!currency) throw new NotFoundError("Currency");
    if (!currency.isEnabledForCustomers) {
      throw new AppError("The default currency must be enabled for customers first.", 409, "CURRENCY_NOT_ENABLED");
    }
  }
  const settings = await prisma.platformSettings.update({ where: { id: 1 }, data: input });
  return settingsToDto(settings);
}

export async function updateKycRequirements(prisma: PrismaClient, input: UpdateKycRequirementsInput) {
  const settings = await prisma.platformSettings.update({ where: { id: 1 }, data: { kycRequiredServices: input.kycRequiredServices } });
  return settingsToDto(settings);
}

/**
 * Switches between per-customer Yativo registration and one shared, admin-provided customer_id
 * for everyone (see YativoCustomerMode). `migrateExisting: true` additionally re-points every
 * customer's yativoCustomerId to the pooled one, including customers who already had their own —
 * an explicit, opt-in bulk action (never implied by just switching the mode) since it overwrites
 * data that can't be recovered from this app alone.
 */
export async function updateYativoCustomerMode(prisma: PrismaClient, input: UpdateYativoCustomerModeInput) {
  // Pooled mode bypasses per-customer KYC (see requireKycApproved.ts) — every customer must be
  // individually verified, so this platform no longer allows switching into it.
  if (input.mode === "POOLED") {
    throw new AppError("Pooled Yativo customer mode is disabled — every customer must complete their own KYC.", 400, "POOLED_MODE_DISABLED");
  }

  const settings = await prisma.platformSettings.update({
    where: { id: 1 },
    data: { yativoCustomerMode: input.mode, pooledYativoCustomerId: null },
  });

  return { settings: settingsToDto(settings), migratedCount: 0 };
}

export async function setCurrencyEnabled(prisma: PrismaClient, code: string, isEnabledForCustomers: boolean) {
  const currency = await prisma.currency.findUnique({ where: { code } });
  if (!currency) throw new NotFoundError("Currency");

  if (!isEnabledForCustomers) {
    const settings = await getPlatformSettings(prisma);
    if (settings.defaultCurrencyCode === code) {
      throw new AppError("Can't disable the current default wallet currency — pick a different default first.", 409, "IS_DEFAULT_CURRENCY");
    }
  }

  const updated = await prisma.currency.update({ where: { code }, data: { isEnabledForCustomers } });
  return currencyToDto(updated);
}
