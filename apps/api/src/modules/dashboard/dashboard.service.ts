import type { PrismaClient, LedgerTransactionType } from "@prisma/client";
import { KYC_STATUSES, type ConfigReminderDto } from "@white-label/shared-types";
import { smtpConfig } from "../../lib/mailer.js";
import { notificationChannelConfig } from "../../lib/notificationChannelConfig.js";

/**
 * "You haven't set this up yet" nudges for an admin — checked live against the same mutable
 * config objects every send path already reads (smtpConfig, notificationChannelConfig), so this
 * can never drift out of sync with what's actually configured. Deliberately limited to things an
 * admin can genuinely forget exists rather than every optional setting in the app.
 */
function getConfigReminders(prisma: PrismaClient): Promise<ConfigReminderDto[]> {
  const reminders: ConfigReminderDto[] = [];

  // Neither an SMTP host nor a custom sendmail path has ever been set — this is the untouched
  // env default, not a deliberate admin choice, and password resets/verification/invites will
  // silently no-op until it's configured.
  if (!smtpConfig.host && !smtpConfig.sendmailPath) {
    reminders.push({
      key: "email",
      title: "Email delivery isn't configured",
      description: "Password resets, verification codes, and staff invites can't be delivered until SMTP is set up.",
      actionPath: "/admin/settings/integrations",
    });
  }

  if (!notificationChannelConfig.slack.enabled && !notificationChannelConfig.telegram.enabled) {
    reminders.push({
      key: "ops-alerts",
      title: "No ops alert channel configured",
      description: "Set up Slack or Telegram so your team hears about failed webhooks, payouts, and pending KYC in real time.",
      actionPath: "/admin/settings/notification-channels",
    });
  }

  return prisma.brandingConfig.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }).then((branding) => {
    if (!branding.logoUrl) {
      reminders.push({
        key: "branding-logo",
        title: "No logo uploaded",
        description: "Your product is still showing the default placeholder logo to customers.",
        actionPath: "/admin/settings/branding",
      });
    }
    return reminders;
  });
}

/**
 * The platform's own markup revenue — CREDIT entries to the PLATFORM_FEE_REVENUE account,
 * excluding whatever Yativo itself charges (that's the provider's cut, never this platform's).
 * Grouped by transaction type + currency in JS rather than via Prisma's groupBy, since the type
 * breakdown lives on the related LedgerTransaction, not on LedgerEntry itself — groupBy can't
 * span a relation. Fee-revenue entries are a small slice of total ledger volume, so this stays
 * cheap even without a raw SQL aggregate.
 */
export async function getPlatformProfitReport(prisma: PrismaClient, filters: { dateFrom?: Date; dateTo?: Date }) {
  const entries = await prisma.ledgerEntry.findMany({
    where: {
      account: { type: "PLATFORM_FEE_REVENUE" },
      direction: "CREDIT",
      transaction: {
        status: "POSTED",
        ...(filters.dateFrom || filters.dateTo
          ? { createdAt: { ...(filters.dateFrom ? { gte: filters.dateFrom } : {}), ...(filters.dateTo ? { lte: filters.dateTo } : {}) } }
          : {}),
      },
    },
    select: { amountMinor: true, currencyCode: true, transaction: { select: { type: true } } },
  });

  const byTypeCurrency = new Map<string, bigint>();
  const byCurrency = new Map<string, bigint>();
  for (const e of entries) {
    const typeKey = `${e.transaction.type}:${e.currencyCode}`;
    byTypeCurrency.set(typeKey, (byTypeCurrency.get(typeKey) ?? 0n) + e.amountMinor);
    byCurrency.set(e.currencyCode, (byCurrency.get(e.currencyCode) ?? 0n) + e.amountMinor);
  }

  const byType = [...byTypeCurrency.entries()]
    .map(([key, amountMinor]) => {
      const [type, currencyCode] = key.split(":") as [LedgerTransactionType, string];
      return { type, currencyCode, amountMinor: amountMinor.toString() };
    })
    .sort((a, b) => (a.amountMinor < b.amountMinor ? 1 : -1));

  const totalsByCurrency = [...byCurrency.entries()].map(([currencyCode, amountMinor]) => ({ currencyCode, amountMinor: amountMinor.toString() }));

  return { byType, totalsByCurrency };
}

export async function getDashboardSummary(prisma: PrismaClient) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // None of these five depend on each other's results — run together instead of as 5 sequential
  // round trips on every admin dashboard load. Only the currency lookup below genuinely needs
  // walletTotals first.
  const [walletTotals, customerCount, kycGroups, pendingPayoutsCount, volumeGroups] = await Promise.all([
    prisma.wallet.groupBy({ by: ["currencyCode"], _sum: { cachedAvailableMinor: true, cachedPendingMinor: true } }),
    prisma.customer.count(),
    prisma.customer.groupBy({ by: ["kycStatus"], _count: { _all: true } }),
    prisma.payout.count({ where: { transaction: { status: "PENDING" } } }),
    // Volume = sum of DEBIT lines on POSTED transactions in the window, grouped by currency.
    // Using only the DEBIT side avoids double-counting each balanced transaction's two legs
    // (sum(debit) === sum(credit) per currency per transaction, by construction).
    prisma.ledgerEntry.groupBy({
      by: ["currencyCode"],
      where: { direction: "DEBIT", transaction: { status: "POSTED", createdAt: { gte: since } } },
      _sum: { amountMinor: true },
    }),
  ]);

  const currencies = await prisma.currency.findMany({
    where: { code: { in: walletTotals.map((w) => w.currencyCode) } },
    select: { code: true, decimals: true, symbol: true },
  });
  const currencyByCode = new Map(currencies.map((c) => [c.code, c]));
  const balancesByCurrency = walletTotals.map((w) => ({
    currencyCode: w.currencyCode,
    decimals: currencyByCode.get(w.currencyCode)?.decimals ?? 2,
    symbol: currencyByCode.get(w.currencyCode)?.symbol ?? null,
    totalAvailableMinor: (w._sum.cachedAvailableMinor ?? 0n).toString(),
    totalPendingMinor: (w._sum.cachedPendingMinor ?? 0n).toString(),
  }));

  const customersByKycStatus: Record<string, number> = Object.fromEntries(KYC_STATUSES.map((s) => [s, 0]));
  for (const g of kycGroups) customersByKycStatus[g.kycStatus] = g._count._all;

  const postedVolumeLast30Days = volumeGroups.map((v) => ({
    currencyCode: v.currencyCode,
    totalMinor: (v._sum.amountMinor ?? 0n).toString(),
  }));

  const configReminders = await getConfigReminders(prisma);

  return { balancesByCurrency, customersByKycStatus, customerCount, pendingPayoutsCount, postedVolumeLast30Days, configReminders };
}
