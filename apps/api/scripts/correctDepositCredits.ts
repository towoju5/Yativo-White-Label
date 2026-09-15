import { PrismaClient } from "@prisma/client";
import { postTransaction } from "../src/modules/ledger/postTransaction.js";
import { getAvailableBalance } from "../src/modules/ledger/balances.js";
import { formatMinorAmount } from "../src/lib/formatMoney.js";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

/**
 * One-time correction for the deposit-webhook bug where handleDepositEvent credited the wallet
 * using the gateway's local/source-currency `amount` (e.g. 656000 NGN) paired with the
 * deposit_currency wallet (e.g. USD) instead of `receive_amount` (473.34, actually USD-denominated)
 * — see deposit.handler.ts's fix. For a cross-currency deposit this could over- or under-credit the
 * wallet by orders of magnitude.
 *
 * Only corrects deposits with a local `Deposit` row that has `grossAmountMinor` set — that value
 * was computed correctly at /portal/deposit/initiate time from the real receive_amount, so it's a
 * trustworthy reference for what SHOULD have been credited. Deposits with no local Deposit row (or
 * no grossAmountMinor) can't be verified from local data alone and are only reported, never
 * auto-corrected — see the "unlinked" section of the report.
 *
 * Dry-run by default: prints exactly what it would change. Pass --apply to actually post the
 * correcting ADJUSTMENT transactions. Safe to re-run either way — each correction's idempotencyKey
 * is deterministic per deposit, so postTransaction no-ops if it already ran.
 *
 * Per policy: a correction is applied (or reported, in dry-run) even if it would take the wallet
 * negative — for a customer who has already spent/withdrawn an erroneous over-credit, the true
 * correction really is a negative balance, not something to silently skip. Every such case is
 * called out under "NEGATIVE BALANCE" in the report so it can be followed up on manually.
 */
async function main() {
  const deposits = await prisma.deposit.findMany({
    where: { transactionId: { not: null }, grossAmountMinor: { not: null } },
    include: { customer: { select: { id: true, email: true } } },
  });

  console.log(`Checking ${deposits.length} settled deposit(s) with a local gross-amount reference...\n`);

  let checked = 0;
  let alreadyCorrect = 0;
  let corrected = 0;
  let wouldGoNegative = 0;
  const skippedUnexpectedShape: string[] = [];

  for (const deposit of deposits) {
    const transaction = await prisma.ledgerTransaction.findUnique({
      where: { id: deposit.transactionId! },
      include: { entries: { include: { account: true } } },
    });
    // Not POSTED (still PENDING, or REVERSED — e.g. the deposit was later refunded) — nothing to
    // correct; a PENDING transaction hasn't credited anything yet, and a REVERSED one already
    // unwound whatever it credited.
    if (!transaction || transaction.status !== "POSTED") continue;
    checked++;

    const walletEntry = transaction.entries.find((e) => e.account.type === "CUSTOMER_WALLET" && e.direction === "CREDIT");
    const settlementEntry = transaction.entries.find((e) => e.account.type === "YATIVO_SETTLEMENT" && e.direction === "DEBIT");
    if (!walletEntry || !settlementEntry) {
      skippedUnexpectedShape.push(deposit.id);
      continue;
    }

    const correctNetMinor = deposit.grossAmountMinor! - deposit.platformFeeMinor;
    const actualNetMinor = walletEntry.amountMinor;
    const deltaMinor = actualNetMinor - correctNetMinor; // > 0 = over-credited, < 0 = under-credited
    if (deltaMinor === 0n) {
      alreadyCorrect++;
      continue;
    }

    const correctionIdempotencyKey = `deposit-correction:${deposit.id}`;
    const alreadyApplied = await prisma.ledgerTransaction.findUnique({ where: { idempotencyKey: correctionIdempotencyKey } });

    const currentAvailable = await getAvailableBalance(prisma, walletEntry.accountId, "CUSTOMER_WALLET");
    const resultingAvailable = alreadyApplied ? currentAvailable : currentAvailable - deltaMinor;
    const goesNegative = resultingAvailable < 0n;
    if (goesNegative) wouldGoNegative++;

    const [actualFmt, correctFmt, deltaFmt, currentFmt, resultingFmt] = await Promise.all(
      [actualNetMinor, correctNetMinor, deltaMinor < 0n ? -deltaMinor : deltaMinor, currentAvailable, resultingAvailable].map((m) =>
        formatMinorAmount(prisma, deposit.currencyCode, m),
      ),
    );

    console.log(
      [
        `Deposit ${deposit.id} (yativoDepositId ${deposit.transactionId}) — customer ${deposit.customer.email}`,
        `  Wallet currency: ${deposit.currencyCode}`,
        `  Credited (wrong): ${actualFmt}   Should be: ${correctFmt}   ${deltaMinor > 0n ? "Over" : "Under"}-credited by: ${deltaFmt}`,
        `  Wallet available balance now: ${currentFmt} → after correction: ${resultingFmt}${goesNegative ? "  ⚠️  NEGATIVE BALANCE — needs manual follow-up" : ""}`,
        alreadyApplied ? "  (correction already applied previously — no-op)" : APPLY ? "  → posting correction..." : "  (dry run — would post correction)",
      ].join("\n"),
    );

    if (APPLY && !alreadyApplied) {
      const settlement = settlementEntry.account;
      const wallet = walletEntry.account;
      const magnitude = deltaMinor > 0n ? deltaMinor : -deltaMinor;
      await postTransaction(prisma, {
        type: "ADJUSTMENT",
        status: "POSTED",
        idempotencyKey: correctionIdempotencyKey,
        externalSource: "MANUAL",
        externalRef: deposit.yativoDepositId,
        description:
          deltaMinor > 0n
            ? `Correction: deposit was credited ${actualFmt} ${deposit.currencyCode} but should have been ${correctFmt} — clawing back the ${deltaFmt} over-credit (see deposit-handler local/deposit-currency fix)`
            : `Correction: deposit was credited ${actualFmt} ${deposit.currencyCode} but should have been ${correctFmt} — adding the missing ${deltaFmt} (see deposit-handler local/deposit-currency fix)`,
        lines:
          deltaMinor > 0n
            ? [
                { accountId: wallet.id, direction: "DEBIT", amountMinor: magnitude, currencyCode: deposit.currencyCode },
                { accountId: settlement.id, direction: "CREDIT", amountMinor: magnitude, currencyCode: deposit.currencyCode },
              ]
            : [
                { accountId: wallet.id, direction: "CREDIT", amountMinor: magnitude, currencyCode: deposit.currencyCode },
                { accountId: settlement.id, direction: "DEBIT", amountMinor: magnitude, currencyCode: deposit.currencyCode },
              ],
      });
      corrected++;
    } else if (!alreadyApplied) {
      corrected++; // counted in the dry-run summary as "would correct"
    }
  }

  // Deposits credited by the webhook with no local Deposit row at all (e.g. made directly against
  // Yativo, bypassing /portal/deposit/initiate) — no trustworthy local reference for the correct
  // amount, so these are reported only, never auto-corrected. Cross-reference against the raw
  // webhook_events payload (which retains the original receive_amount/deposit_currency exactly as
  // Yativo sent them) or Yativo's API to determine the correct amount by hand.
  const unlinked = await prisma.ledgerTransaction.findMany({
    where: { type: "DEPOSIT", externalSource: "YATIVO_WEBHOOK", status: "POSTED", deposit: null },
    select: { id: true, externalRef: true, createdAt: true },
  });

  console.log("\n── Summary ──");
  console.log(`Checked: ${checked}   Already correct: ${alreadyCorrect}   ${APPLY ? "Corrected" : "Would correct"}: ${corrected}   Going/went negative: ${wouldGoNegative}`);
  if (skippedUnexpectedShape.length > 0) {
    console.log(`Skipped (unexpected ledger shape, needs manual look): ${skippedUnexpectedShape.join(", ")}`);
  }
  if (unlinked.length > 0) {
    console.log(`\n${unlinked.length} DEPOSIT transaction(s) with no local Deposit record — needs manual review against webhook_events raw payload / Yativo's API:`);
    for (const t of unlinked) console.log(`  - ledgerTransaction ${t.id}  externalRef(yativoDepositId) ${t.externalRef}  posted ${t.createdAt.toISOString()}`);
  }
  if (!APPLY && corrected > 0) {
    console.log("\nThis was a dry run — re-run with --apply to actually post these corrections.");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
