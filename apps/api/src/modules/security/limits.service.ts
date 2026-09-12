import type { PrismaClient } from "@prisma/client";
import { AppError } from "../../lib/errors.js";
import { formatMinorAmount } from "../../lib/formatMoney.js";

function startOfDay(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/** Sum of this customer's payouts in `currencyCode` since `since`, excluding reversed ones — pending payouts already count (the money's committed the moment the hold is posted, not just once Yativo confirms it). */
async function sumPayoutsSince(prisma: PrismaClient, customerId: string, currencyCode: string, since: Date): Promise<bigint> {
  const payouts = await prisma.payout.findMany({
    where: { customerId, currencyCode, createdAt: { gte: since }, transaction: { status: { not: "REVERSED" } } },
    select: { amountMinor: true },
  });
  return payouts.reduce((sum, p) => sum + p.amountMinor, 0n);
}

/**
 * Throws if `amountMinor` would push this customer over their daily or monthly payout limit for
 * `currencyCode`. A customer's own CustomerLimits row (if any) overrides the platform default for
 * that currency; a currency with neither has no limit at all — this is opt-in, not a default cap
 * every deployment suddenly gets.
 */
export async function checkPayoutLimit(prisma: PrismaClient, customerId: string, currencyCode: string, amountMinor: bigint): Promise<void> {
  const [override, defaults] = await Promise.all([
    prisma.customerLimits.findUnique({ where: { customerId_currencyCode: { customerId, currencyCode } } }),
    prisma.platformLimitsDefault.findUnique({ where: { currencyCode } }),
  ]);
  const dailyLimit = override?.dailyLimitMinor ?? defaults?.dailyLimitMinor ?? null;
  const monthlyLimit = override?.monthlyLimitMinor ?? defaults?.monthlyLimitMinor ?? null;
  if (dailyLimit === null && monthlyLimit === null) return;

  const now = new Date();
  const [dailySum, monthlySum] = await Promise.all([
    dailyLimit !== null ? sumPayoutsSince(prisma, customerId, currencyCode, startOfDay(now)) : Promise.resolve(0n),
    monthlyLimit !== null ? sumPayoutsSince(prisma, customerId, currencyCode, startOfMonth(now)) : Promise.resolve(0n),
  ]);

  if (dailyLimit !== null && dailySum + amountMinor > dailyLimit) {
    const remaining = dailyLimit > dailySum ? dailyLimit - dailySum : 0n;
    throw new AppError(
      `This payout would exceed your daily limit for ${currencyCode}. ${await formatMinorAmount(prisma, currencyCode, remaining)} ${currencyCode} remaining today.`,
      409,
      "DAILY_LIMIT_EXCEEDED",
    );
  }
  if (monthlyLimit !== null && monthlySum + amountMinor > monthlyLimit) {
    const remaining = monthlyLimit > monthlySum ? monthlyLimit - monthlySum : 0n;
    throw new AppError(
      `This payout would exceed your monthly limit for ${currencyCode}. ${await formatMinorAmount(prisma, currencyCode, remaining)} ${currencyCode} remaining this month.`,
      409,
      "MONTHLY_LIMIT_EXCEEDED",
    );
  }
}

// ── Admin: platform defaults + per-customer overrides ──

export async function listPlatformLimitDefaults(prisma: PrismaClient) {
  const rows = await prisma.platformLimitsDefault.findMany({ orderBy: { currencyCode: "asc" } });
  return rows.map((r) => ({ currencyCode: r.currencyCode, dailyLimitMinor: r.dailyLimitMinor?.toString() ?? null, monthlyLimitMinor: r.monthlyLimitMinor?.toString() ?? null }));
}

export async function setPlatformLimitDefault(prisma: PrismaClient, currencyCode: string, dailyLimitMinor: string | null | undefined, monthlyLimitMinor: string | null | undefined) {
  const row = await prisma.platformLimitsDefault.upsert({
    where: { currencyCode },
    create: { currencyCode, dailyLimitMinor: dailyLimitMinor ? BigInt(dailyLimitMinor) : null, monthlyLimitMinor: monthlyLimitMinor ? BigInt(monthlyLimitMinor) : null },
    update: { dailyLimitMinor: dailyLimitMinor === undefined ? undefined : dailyLimitMinor ? BigInt(dailyLimitMinor) : null, monthlyLimitMinor: monthlyLimitMinor === undefined ? undefined : monthlyLimitMinor ? BigInt(monthlyLimitMinor) : null },
  });
  return { currencyCode: row.currencyCode, dailyLimitMinor: row.dailyLimitMinor?.toString() ?? null, monthlyLimitMinor: row.monthlyLimitMinor?.toString() ?? null };
}

export async function listCustomerLimits(prisma: PrismaClient, customerId: string) {
  const [overrides, defaults] = await Promise.all([
    prisma.customerLimits.findMany({ where: { customerId } }),
    prisma.platformLimitsDefault.findMany(),
  ]);
  const overrideByCurrency = new Map(overrides.map((o) => [o.currencyCode, o]));
  const currencies = new Set([...overrides.map((o) => o.currencyCode), ...defaults.map((d) => d.currencyCode)]);
  return [...currencies].sort().map((currencyCode) => {
    const override = overrideByCurrency.get(currencyCode);
    const fallback = defaults.find((d) => d.currencyCode === currencyCode);
    return {
      currencyCode,
      dailyLimitMinor: (override?.dailyLimitMinor ?? fallback?.dailyLimitMinor)?.toString() ?? null,
      monthlyLimitMinor: (override?.monthlyLimitMinor ?? fallback?.monthlyLimitMinor)?.toString() ?? null,
      isOverride: !!override,
    };
  });
}

export async function setCustomerLimit(prisma: PrismaClient, customerId: string, currencyCode: string, dailyLimitMinor: string | null | undefined, monthlyLimitMinor: string | null | undefined) {
  await prisma.customerLimits.upsert({
    where: { customerId_currencyCode: { customerId, currencyCode } },
    create: { customerId, currencyCode, dailyLimitMinor: dailyLimitMinor ? BigInt(dailyLimitMinor) : null, monthlyLimitMinor: monthlyLimitMinor ? BigInt(monthlyLimitMinor) : null },
    update: { dailyLimitMinor: dailyLimitMinor === undefined ? undefined : dailyLimitMinor ? BigInt(dailyLimitMinor) : null, monthlyLimitMinor: monthlyLimitMinor === undefined ? undefined : monthlyLimitMinor ? BigInt(monthlyLimitMinor) : null },
  });
  return listCustomerLimits(prisma, customerId);
}
