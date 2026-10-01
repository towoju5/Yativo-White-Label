import { PrismaClient } from "@prisma/client";
import { formatMinorAmount } from "../src/lib/formatMoney.js";

const prisma = new PrismaClient();

/**
 * Read-only report of payout holds that nothing will ever release: the hold (a PENDING PAYOUT
 * transaction) was posted, but Yativo never returned a payout id — so neither the payout webhook
 * nor the status poll can find it. Before the fix in createPortalPayout, any failed submission
 * left one of these behind, with the money showing as "pending" in the customer's wallet forever.
 *
 * Deliberately changes nothing: a hold with no payout id usually means Yativo rejected the
 * submission, but after a timeout Yativo may have accepted it. Check each one in Yativo's
 * dashboard first, then release the ones that never went through from Admin → Transactions
 * (open the transaction → Reverse), which records who released it and why.
 *
 * Holds younger than 10 minutes are skipped — a payout that's mid-submission looks the same.
 */
async function main() {
  const cutoff = new Date(Date.now() - 10 * 60_000);
  const rows = await prisma.payout.findMany({
    where: { yativoPayoutId: null, createdAt: { lt: cutoff }, transaction: { status: "PENDING" } },
    include: { customer: { select: { email: true } }, beneficiary: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });

  if (rows.length === 0) {
    console.log("No stuck payout holds.");
    return;
  }

  console.log(`${rows.length} stuck payout hold(s):\n`);
  for (const p of rows) {
    const held = await formatMinorAmount(prisma, p.currencyCode, p.amountMinor + p.platformFeeMinor);
    console.log(
      [`payout ${p.id}`, `  customer     ${p.customer.email}`, `  beneficiary  ${p.beneficiary.name}`, `  held         ${held} ${p.currencyCode}`, `  created      ${p.createdAt.toISOString()}`, `  transaction  ${p.transactionId}  ← release this from Admin → Transactions once confirmed on Yativo`].join("\n"),
      "\n",
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
