import type { PrismaClient } from "@prisma/client";

/**
 * The minimum a fresh database needs before ANY customer-facing request works — no test/demo
 * data, no Yativo calls. `getPlatformSettings()` does a plain `findUnique` (no create-on-read,
 * unlike BrandingConfig) and throws NotFoundError if this row is missing, and that function is
 * called from signup, wallet operations, and card/payout issuance — so a database that only ever
 * ran `prisma migrate deploy` is missing this until something creates it. Only prisma/seed.ts
 * (via this function) and scripts/bootstrapPlatformSettings.ts create it; nothing else does.
 */
export async function bootstrapPlatformData(prisma: PrismaClient): Promise<void> {
  // Matches the currencies Yativo can actually issue deposit virtual accounts for
  // (GET /business/virtual-account/currencies-and-endorsements) — needed so payouts/cards/deposits
  // in these currencies can resolve decimals locally instead of throwing on an unseeded currency.
  const currencies = [
    { code: "USD", decimals: 2, name: "US Dollar" },
    { code: "EUR", decimals: 2, name: "Euro" },
    { code: "GBP", decimals: 2, name: "British Pound" },
    { code: "MXN", decimals: 2, name: "Mexican Peso" },
    { code: "COP", decimals: 2, name: "Colombian Peso" },
    { code: "BRL", decimals: 2, name: "Brazilian Real" },
    { code: "ARS", decimals: 2, name: "Argentine Peso" },
    { code: "PEN", decimals: 2, name: "Peruvian Sol" },
    { code: "CLP", decimals: 0, name: "Chilean Peso" },
  ];
  for (const c of currencies) {
    // USD enabled out of the box (it's also the default wallet currency below); the rest start
    // disabled — an admin opts them in from Settings → Wallet currencies once they're ready.
    // `update` also sets isEnabledForCustomers for USD specifically so re-running this against a
    // database where these rows already existed still converges to the right state.
    await prisma.currency.upsert({
      where: { code: c.code },
      update: c.code === "USD" ? { isEnabledForCustomers: true } : {},
      create: { ...c, isFiat: true, isEnabledForCustomers: c.code === "USD" },
    });
  }

  await prisma.platformSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, walletCurrencyMode: "DEFAULT_ONLY", defaultCurrencyCode: "USD" },
  });

  await prisma.brandingConfig.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
}
