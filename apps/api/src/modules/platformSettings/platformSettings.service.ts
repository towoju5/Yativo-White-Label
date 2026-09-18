import type { Currency, PlatformSettings, PrismaClient } from "@prisma/client";
import type { UpdatePlatformSettingsInput, UpdateKycRequirementsInput, UpdateEmailVerificationInput, UpdateCustomerLoginMethodInput } from "@white-label/shared-types";
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
    requireEmailVerification: s.requireEmailVerification,
    customerLoginMethod: s.customerLoginMethod,
    currencySyncFrequency: s.currencySyncFrequency,
    lastCurrencySyncAt: s.lastCurrencySyncAt ? s.lastCurrencySyncAt.toISOString() : null,
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

/** Never synced into the local Currency table or shown to customers — the Bluebanc Card Wallet entry Yativo's wallet/balance endpoint returns alongside real currencies (see wallets.ts's listBalances doc comment). Its "usdcc" slug is also 5 chars, longer than Currency.code's CHAR(3) column. */
const HIDDEN_WALLET_SLUGS = new Set(["usdcc"]);

/**
 * Pulls the platform's own live Yativo wallet list and upserts into the local table — this is
 * only the currencies this platform actually holds a funded Yativo wallet for (GET
 * /wallet/balance), not Yativo's full platform-wide currency catalog, so a currency never shows
 * up here (and therefore is never offered to customers) unless the admin has actually enabled a
 * wallet for it on Yativo's side. New currencies default to disabled-for-customers, existing rows
 * keep their current enabled flag untouched. Called both by the admin's on-demand "Sync from
 * Yativo" button and by the scheduled background job (see jobs/currencySyncScheduler.ts), which is
 * why it stamps lastCurrencySyncAt itself rather than leaving that to the caller.
 */
export async function syncCurrenciesFromYativo(prisma: PrismaClient) {
  const [balances, settings] = await Promise.all([yativoClient.fiat.wallets.listBalances(), getPlatformSettings(prisma)]);
  const liveCodes = new Set<string>();

  for (const entry of balances) {
    if (HIDDEN_WALLET_SLUGS.has(entry.slug)) continue;
    const code = entry.slug.toUpperCase();
    liveCodes.add(code);
    const name = entry.meta?.fullname ?? entry.name;
    const symbol = entry.meta?.symbol ?? null;
    const logoUrl = entry.meta?.logo ?? null;
    const decimals = Number(entry.decimal_places);
    const isActive = !entry.deleted_at;
    await prisma.currency.upsert({
      where: { code },
      update: { name, decimals, symbol, logoUrl, isActive },
      create: { code, name, decimals, isFiat: true, symbol, logoUrl, isActive },
    });
  }

  // A currency synced in previously (back when this pulled from Yativo's full platform-wide
  // catalog, or a wallet that's since been closed on Yativo's side) but no longer present in the
  // live wallet list is no longer something this platform actually holds — pull it back out of
  // circulation so it stops being offered to customers. Never touches the current default
  // currency even if it drops out, since updatePlatformSettings requires the default to stay
  // enabled — an admin has to pick a new default first if that ever genuinely happens.
  await prisma.currency.updateMany({
    where: { code: { notIn: [...liveCodes, settings.defaultCurrencyCode] }, isEnabledForCustomers: true },
    data: { isEnabledForCustomers: false, isActive: false },
  });

  await prisma.platformSettings.update({ where: { id: 1 }, data: { lastCurrencySyncAt: new Date() } });
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

export async function updateEmailVerificationSetting(prisma: PrismaClient, input: UpdateEmailVerificationInput) {
  const settings = await prisma.platformSettings.update({ where: { id: 1 }, data: { requireEmailVerification: input.requireEmailVerification } });
  return settingsToDto(settings);
}

export async function updateCustomerLoginMethod(prisma: PrismaClient, input: UpdateCustomerLoginMethodInput) {
  const settings = await prisma.platformSettings.update({ where: { id: 1 }, data: { customerLoginMethod: input.customerLoginMethod } });
  return settingsToDto(settings);
}

/** Public — no staff auth, fetched by the portal login page before the customer authenticates. */
export async function getPortalAuthConfig(prisma: PrismaClient) {
  const settings = await getPlatformSettings(prisma);
  return { loginMethod: settings.customerLoginMethod };
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
