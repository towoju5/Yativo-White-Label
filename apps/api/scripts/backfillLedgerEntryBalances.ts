import { PrismaClient } from "@prisma/client";
import { ACCOUNT_NORMAL_BALANCE } from "../src/modules/ledger/types.js";

const prisma = new PrismaClient();

/**
 * One-time backfill for the balanceBeforeMinor/balanceAfterMinor columns added to ledger_entries.
 * Every entry created *after* this migration gets these written atomically at post time (see
 * postTransactionInTx) — this script only fills in history that predates that.
 *
 * Best-effort for pre-existing data: it replays each account's entries in chronological order
 * using each transaction's *current* status, same as the old (buggy) statement computation. Any
 * entry whose transaction had already been reversed or settled by the time this runs will get a
 * balance reflecting that later status, not necessarily what the balance truly was at that
 * historical moment — a real limitation, but it only affects entries older than this migration;
 * everything posted from now on records its balance for real, at the instant it's true.
 */
async function main() {
  const accounts = await prisma.account.findMany({ select: { id: true, type: true } });
  console.log(`Backfilling balances for ${accounts.length} accounts...`);

  let updated = 0;
  for (const account of accounts) {
    const entries = await prisma.ledgerEntry.findMany({
      where: { accountId: account.id },
      orderBy: { createdAt: "asc" },
      include: { transaction: true },
    });

    const normal = ACCOUNT_NORMAL_BALANCE[account.type];
    let running = 0n;
    for (const entry of entries) {
      const before = running;
      if (entry.transaction.status === "POSTED") {
        running += entry.direction === normal ? entry.amountMinor : -entry.amountMinor;
      }
      await prisma.ledgerEntry.update({
        where: { id: entry.id },
        data: { balanceBeforeMinor: before, balanceAfterMinor: running },
      });
      updated++;
    }
  }

  console.log(`Backfilled ${updated} ledger entries.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
