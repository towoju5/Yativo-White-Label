import type { PrismaClient, ReconciliationReport } from "@prisma/client";
import type { YativoClient } from "@white-label/yativo-sdk";
import { getPostedBalance } from "../ledger/balances.js";

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
 * Compares each platform account's ledger-derived balance (source of truth,
 * `expectedMinor`) against what Yativo reports for that currency
 * (`actualMinor`), and writes one ReconciliationReport row per platform
 * account. YATIVO_SETTLEMENT accounts are compared against Yativo's
 * settlement-balance endpoint; every other platform account type is
 * compared against Yativo's general wallet-balance endpoint as a stand-in
 * (Yativo has no per-chart-of-accounts breakdown of our internal ledger).
 *
 * In mock mode the settlement fixture is deliberately off by 500 minor
 * units from a fresh ledger so this demonstrably produces a MISMATCH row.
 */
export async function runReconciliation(prisma: PrismaClient, yativo: YativoClient) {
  const platformAccounts = await prisma.account.findMany({ where: { customerId: null } });
  const reports: ReconciliationReport[] = [];

  for (const account of platformAccounts) {
    const expectedMinor = await getPostedBalance(prisma, account.id, account.type);

    const external =
      account.type === "YATIVO_SETTLEMENT"
        ? await yativo.fiat.wallets.getSettlementBalance(account.currencyCode)
        : await yativo.fiat.wallets.getBalance(account.currencyCode);
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
