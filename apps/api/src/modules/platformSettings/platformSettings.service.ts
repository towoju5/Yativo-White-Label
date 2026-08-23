import type { Currency, PlatformSettings, PrismaClient } from "@prisma/client";
import type { UpdatePlatformSettingsInput, UpdateKycRequirementsInput } from "@white-label/shared-types";
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
