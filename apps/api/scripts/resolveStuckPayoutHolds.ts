import { PrismaClient } from "@prisma/client";
import { loadIntegrationSettingsFromDb } from "../src/lib/integrationRuntimeConfig.js";
import { getPayoutPollQueue } from "../src/jobs/payoutPollQueue.js";
import { resolveStuckPayoutHolds } from "../src/modules/payouts/stuckPayoutHolds.js";

const prisma = new PrismaClient();

/**
 * Finds payout holds left stuck by failed submissions and resolves the ones Yativo can vouch for —
 * see resolveStuckPayoutHolds for exactly when it acts. Dry run by default; pass --apply to act.
 *
 * Run on the server: Yativo whitelists its IP, and the live API keys live in the database.
 *   pnpm --filter api resolve-stuck-payout-holds            # report only
 *   pnpm --filter api resolve-stuck-payout-holds -- --apply # act on it
 */
async function main() {
  await loadIntegrationSettingsFromDb(prisma);
  await resolveStuckPayoutHolds(prisma, { apply: process.argv.includes("--apply") });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getPayoutPollQueue().close().catch(() => undefined);
    await prisma.$disconnect();
  });
