import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * One-time backfill: earlier versions of this app wrote "via Yativo (...)" directly into
 * customer-facing transaction descriptions. The code no longer does this (see deposits.routes.ts,
 * deposit.handler.ts, virtualAccountDeposit.handler.ts), but rows already written before that fix
 * still have the old text — updating the code doesn't rewrite already-persisted rows. Safe to
 * re-run: each pattern only matches rows still containing the old text.
 */
const REPLACEMENTS: [prefix: string, replacement: string][] = [
  ["Deposit initiated via Yativo", "Deposit initiated"],
  ["Deposit confirmed via Yativo", "Deposit confirmed"],
  ["Virtual account deposit confirmed via Yativo", "Virtual account deposit confirmed"],
];

async function main() {
  let total = 0;
  for (const [prefix, replacement] of REPLACEMENTS) {
    const result = await prisma.ledgerTransaction.updateMany({
      where: { description: { startsWith: prefix } },
      data: { description: replacement },
    });
    console.log(`${result.count} row(s) starting with "${prefix}" -> "${replacement}"`);
    total += result.count;
  }
  console.log(`Done. ${total} transaction description(s) updated.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
