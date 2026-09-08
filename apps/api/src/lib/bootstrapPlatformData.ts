import type { PrismaClient, PricingServiceType } from "@prisma/client";

/**
 * The minimum a fresh database needs before ANY customer-facing request works — no test/demo
 * data, no Yativo calls. `getPlatformSettings()` does a plain `findUnique` (no create-on-read,
 * unlike BrandingConfig) and throws NotFoundError if this row is missing, and that function is
 * called from signup, wallet operations, and card/payout issuance — so a database that only ever
 * ran `prisma migrate deploy` is missing this until something creates it. Called automatically at
 * API boot (see app.ts) so a deployed environment self-heals on its next restart with no manual
 * script run required; prisma/seed.ts and scripts/bootstrapPlatformSettings.ts also call this
 * directly for local/manual use.
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

  // Free (zero-fee, standalone) until an admin sets real pricing from Settings → Pricing.
  const pricingServices: PricingServiceType[] = [
    "PAYIN",
    "PAYOUT",
    "VIRTUAL_ACCOUNT_DEPOSIT",
    "CARD_CREATE",
    "CARD_FUND",
    "CARD_WITHDRAW",
    "CARD_TERMINATE",
    "BUSINESS_SPEND_CARD_CREATE",
    "BUSINESS_SPEND_CARD_FUND",
    "BUSINESS_SPEND_CARD_WITHDRAW",
    "BUSINESS_SPEND_CARD_TERMINATE",
    "BUSINESS_SPEND_CARD_ACTIVATE",
    "BUSINESS_SPEND_CARD_SUSPEND",
    "BUSINESS_SPEND_CARD_PIN_UPDATE",
    "BUSINESS_SPEND_CARD_LIMITS_UPDATE",
  ];
  for (const service of pricingServices) {
    // Business Spend Card withdrawals aren't free by accident (per the provider's own guide, this
    // action carries a platform-wide default fee starting at $1.00, admin-adjustable and still
    // overridable per business from Settings → Pricing) — every other service here still starts
    // at zero/standalone until an admin sets real pricing. STANDALONE, not MARKUP: unlike the
    // older card product's withdraw, Yativo's spend-card wallet endpoint never reports its own fee
    // back to us, so there's nothing to mark a fee up on top of here.
    const create =
      service === "BUSINESS_SPEND_CARD_WITHDRAW"
        ? { service, feeType: "FIXED" as const, pricingMode: "STANDALONE" as const, fixedAmountMinor: 100n }
        : { service };
    await prisma.pricingDefault.upsert({
      where: { service },
      update: {},
      create,
    });
  }
}
