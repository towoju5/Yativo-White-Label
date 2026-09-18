import type { PrismaClient, ReconciliationReport } from "@prisma/client";
import type { YativoClient } from "@white-label/yativo-sdk";
import type { YativoWalletBalance } from "@white-label/shared-types";
import { getPostedBalance } from "../ledger/balances.js";

/** Live from Yativo, admin-only — unlike the customer-facing currency list (synced into the local Currency table, "usdcc" filtered out), this is the raw wallet list including the internal "usdcc" card-funding wallet. */
export async function getYativoWalletBalances(yativo: YativoClient): Promise<YativoWalletBalance[]> {
  const entries = await yativo.fiat.wallets.listBalances();
  return entries.map((e) => ({
    name: e.name,
    slug: e.slug,
    currency: e.currency,
    symbol: e.meta?.symbol ?? null,
    logoUrl: e.meta?.logo ?? null,
    balance: String(e.balance),
    decimalPlaces: Number(e.decimal_places),
  }));
}

export function reconciliationReportToDto(report: ReconciliationReport) {
  return {
    id: report.id,
    currencyCode: report.currencyCode,
    accountType: report.accountType,
    expectedMinor: report.expectedMinor.toString(),
    actualMinor: report.actualMinor.toString(),
    deltaMinor: report.deltaMinor.toString(),
    status: report.status,
    createdAt: report.createdAt.toISOString(),
  };
}

export async function listReconciliationReports(prisma: PrismaClient, page: number, pageSize: number) {
  const [total, reports] = await Promise.all([
    prisma.reconciliationReport.count(),
    prisma.reconciliationReport.findMany({ orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return { items: reports.map(reconciliationReportToDto), total, page, pageSize };
}

/**
 * Compares each YATIVO_SETTLEMENT account's ledger-derived balance (source of truth,
 * `expectedMinor`) against what Yativo actually reports holding for that currency
 * (`actualMinor`), and writes one ReconciliationReport row per settlement account.
 *
 * Scoped to YATIVO_SETTLEMENT only — that's the one local bucket meant to track "funds actually
 * settled at Yativo" 1:1. Yativo's wallet-balance endpoint returns a single combined number per
 * currency with no chart-of-accounts breakdown, so the platform's other local buckets sharing that
 * same currency (PLATFORM_FEE_REVENUE, PLATFORM_RESERVE, SUSPENSE_PENDING, YATIVO_CLEARING — each
 * tracking something Yativo can't independently confirm, e.g. PLATFORM_RESERVE is a purely
 * internal manual-adjustment account with no corresponding real movement at Yativo at all) have no
 * valid external figure to compare against. This used to compare every platform account type
 * against that same one combined number anyway, which is guaranteed to "mismatch" for all but one
 * of them per currency — that's what was producing near-constant false MISMATCH rows. See
 * scripts/cleanupInvalidReconciliationReports.ts for clearing out the stale rows that flawed logic
 * already produced.
 *
 * In mock mode the settlement fixture is deliberately off by 500 minor
 * units from a fresh ledger so this demonstrably produces a MISMATCH row.
 */
export async function runReconciliation(prisma: PrismaClient, yativo: YativoClient) {
  const settlementAccounts = await prisma.account.findMany({ where: { customerId: null, type: "YATIVO_SETTLEMENT" } });
  const reports: ReconciliationReport[] = [];

  for (const account of settlementAccounts) {
    const expectedMinor = await getPostedBalance(prisma, account.id, account.type);

    const external = await yativo.fiat.wallets.getSettlementBalance(account.currencyCode);
    const actualMinor = BigInt(external.availableMinor);

    const deltaMinor = actualMinor - expectedMinor;
    const status = deltaMinor === 0n ? "MATCH" : "MISMATCH";

    const report = await prisma.reconciliationReport.create({
      data: { currencyCode: account.currencyCode, accountType: account.type, expectedMinor, actualMinor, deltaMinor, status },
    });
    reports.push(report);
  }

  return reports;
}
