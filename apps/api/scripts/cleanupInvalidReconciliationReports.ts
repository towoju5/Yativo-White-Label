import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

/**
 * One-time cleanup for the reconciliation bug where runReconciliation compared EVERY platform
 * account type (PLATFORM_FEE_REVENUE, PLATFORM_RESERVE, SUSPENSE_PENDING, YATIVO_CLEARING, not
 * just YATIVO_SETTLEMENT) against the same single combined Yativo wallet-balance figure for that
 * currency — see reconciliation.service.ts's runReconciliation doc comment. Yativo has no
 * per-chart-of-accounts breakdown, so that comparison was invalid for every type except
 * YATIVO_SETTLEMENT, and was structurally guaranteed to "mismatch" for the others — those rows
 * don't represent a real ledger-vs-Yativo discrepancy, they're artifacts of a bug that has now
 * been fixed. There's no correct expected/actual figure to "rebalance" them to; the only valid fix
 * is removing them so the reconciliation page reflects only genuine, checkable comparisons.
 *
 * A second, narrower bug (also now fixed — see wallets.ts's fetchBalance) could additionally have
 * corrupted even legitimate YATIVO_SETTLEMENT[USD] comparisons: Yativo's wallet-balance response
 * includes an internal "usdcc" entry also denominated in "USD", and the old lookup matched on the
 * ambiguous shared `currency` field instead of the unique `slug`, so it could have picked up the
 * wrong entry's balance. This script reports (but does not delete) old YATIVO_SETTLEMENT rows so
 * you can decide whether to re-run reconciliation for USD to get a trustworthy figure — deleting
 * them isn't clearly correct the way it is for the other account types, since some of them may
 * already have been accurate.
 *
 * Dry-run by default: prints exactly what it would delete. Pass --apply to actually delete.
 */
async function main() {
  const invalidTypeReports = await prisma.reconciliationReport.findMany({
    where: { accountType: { not: "YATIVO_SETTLEMENT" } },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Found ${invalidTypeReports.length} reconciliation report(s) for an account type Yativo can't independently verify (not YATIVO_SETTLEMENT):`);
  for (const r of invalidTypeReports) {
    console.log(`  - ${r.id}  ${r.createdAt.toISOString()}  ${r.accountType} [${r.currencyCode}]  status=${r.status}  delta=${r.deltaMinor}`);
  }

  if (APPLY && invalidTypeReports.length > 0) {
    const result = await prisma.reconciliationReport.deleteMany({ where: { accountType: { not: "YATIVO_SETTLEMENT" } } });
    console.log(`\nDeleted ${result.count} invalid report(s).`);
  } else if (invalidTypeReports.length > 0) {
    console.log("\nDry run — re-run with --apply to delete these.");
  }

  const settlementReports = await prisma.reconciliationReport.findMany({
    where: { accountType: "YATIVO_SETTLEMENT" },
    orderBy: { createdAt: "asc" },
  });
  if (settlementReports.length > 0) {
    console.log(
      `\n${settlementReports.length} existing YATIVO_SETTLEMENT report(s) were left untouched — these compare a real ledger account against a real Yativo balance, so they may already be accurate. USD ones in particular could have been affected by the separate slug-matching bug (see this script's doc comment); if you're unsure, trigger a fresh "Run now" from the admin Reconciliation page (now fixed) and compare against these:`,
    );
    for (const r of settlementReports) {
      console.log(`  - ${r.id}  ${r.createdAt.toISOString()}  [${r.currencyCode}]  status=${r.status}  delta=${r.deltaMinor}`);
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
