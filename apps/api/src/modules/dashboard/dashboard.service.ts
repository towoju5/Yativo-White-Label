import type { PrismaClient } from "@prisma/client";
import { KYC_STATUSES } from "@white-label/shared-types";

export async function getDashboardSummary(prisma: PrismaClient) {
  const walletTotals = await prisma.wallet.groupBy({
    by: ["currencyCode"],
    _sum: { cachedAvailableMinor: true, cachedPendingMinor: true },
  });
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

  const customerCount = await prisma.customer.count();

  const kycGroups = await prisma.customer.groupBy({ by: ["kycStatus"], _count: { _all: true } });
  const customersByKycStatus: Record<string, number> = Object.fromEntries(KYC_STATUSES.map((s) => [s, 0]));
  for (const g of kycGroups) customersByKycStatus[g.kycStatus] = g._count._all;

  const pendingPayoutsCount = await prisma.payout.count({ where: { transaction: { status: "PENDING" } } });

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  // Volume = sum of DEBIT lines on POSTED transactions in the window, grouped by currency.
  // Using only the DEBIT side avoids double-counting each balanced transaction's two legs
  // (sum(debit) === sum(credit) per currency per transaction, by construction).
  const volumeGroups = await prisma.ledgerEntry.groupBy({
    by: ["currencyCode"],
    where: { direction: "DEBIT", transaction: { status: "POSTED", createdAt: { gte: since } } },
    _sum: { amountMinor: true },
  });
  const postedVolumeLast30Days = volumeGroups.map((v) => ({
    currencyCode: v.currencyCode,
    totalMinor: (v._sum.amountMinor ?? 0n).toString(),
  }));

  return { balancesByCurrency, customersByKycStatus, customerCount, pendingPayoutsCount, postedVolumeLast30Days };
}
