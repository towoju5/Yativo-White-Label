import type { PrismaClient } from "@prisma/client";
import { yativoClient } from "../../lib/yativoClient.js";
import { reverseTransaction } from "../ledger/reverseTransaction.js";
import { enqueuePayoutStatusPoll } from "../../jobs/payoutPollQueue.js";
import { formatMinorAmount } from "../../lib/formatMoney.js";

const MAX_PAGES = 50;

/**
 * Resolves payout holds that nothing will ever release: a PENDING PAYOUT hold whose payout never
 * got a Yativo payout id — so neither the payout webhook nor the status poll can find it. Before
 * the fix in createPortalPayout, every failed submission left one of these behind, with the money
 * showing as "pending" in the customer's wallet forever.
 *
 * Each hold's ledger transaction id was sent to Yativo as the payout's Idempotency-Key, so this
 * searches Yativo's payout list (GET /payout/get) for it:
 *   - FOUND        → Yativo has the payout. --apply links its id and queues the normal status poll,
 *                    which settles or releases the hold exactly like any other payout.
 *   - NOT ON YATIVO → Yativo never created it. --apply releases the hold back to the customer.
 *   - UNKNOWN      → can't tell. Never touched — check Yativo by hand, then release from
 *                    Admin → Transactions if it never went out.
 *
 * "Not on Yativo" is only ever concluded after the listing proves itself trustworthy: it must
 * reach back past the oldest hold, AND contain payouts we already know were submitted, each
 * carrying our idempotency key. If Yativo's records don't expose the key (or this script can't
 * find the list in the response), every hold stays UNKNOWN — a wrong "not found" would release
 * money that was actually paid out.
 *
 * Holds younger than 10 minutes are skipped (a payout mid-submission looks the same). Run via
 * scripts/resolveStuckPayoutHolds.ts.
 */
type YRecord = Record<string, unknown>;
const keyOf = (r: YRecord) => {
  const k = r.idempotency_key ?? r.idempotencyKey ?? r["Idempotency-Key"] ?? r.client_reference;
  return typeof k === "string" || typeof k === "number" ? String(k) : undefined;
};
const idOf = (r: YRecord) => {
  const id = r.payout_id ?? r.id;
  return typeof id === "string" || typeof id === "number" ? String(id) : undefined;
};
const createdOf = (r: YRecord) => (typeof r.created_at === "string" ? Date.parse(r.created_at) : NaN);

export async function resolveStuckPayoutHolds(prisma: PrismaClient, { apply, log = console.log }: { apply: boolean; log?: (line: string) => void }) {
  const APPLY = apply;

  const holds = await prisma.payout.findMany({
    where: { yativoPayoutId: null, createdAt: { lt: new Date(Date.now() - 10 * 60_000) }, transaction: { status: "PENDING" } },
    include: { customer: { select: { email: true } }, beneficiary: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (holds.length === 0) {
    log("No stuck payout holds.");
    return { found: 0, released: 0, unknown: 0 };
  }
  const oldest = holds[0]!.createdAt.getTime();
  log(`${holds.length} stuck payout hold(s). ${APPLY ? "APPLYING changes." : "Dry run — pass --apply to act."}\n`);

  // ── Pull Yativo's payout list back past the oldest hold ───────────────────
  const records: YRecord[] = [];
  let reachedBack = false;
  let listingError: string | null = null;
  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const { records: pageRecords, hasMore } = await yativoClient.fiat.payouts.list(page);
      records.push(...pageRecords);
      const pageOldest = Math.min(...pageRecords.map(createdOf).filter(Number.isFinite));
      if (!hasMore || pageOldest < oldest - 24 * 60 * 60_000) {
        reachedBack = true;
        break;
      }
    }
  } catch (err) {
    listingError = err instanceof Error ? err.message : String(err);
  }

  // ── Calibrate: do payouts we KNOW reached Yativo show up, carrying our key? ──
  const known = await prisma.payout.findMany({
    where: { yativoPayoutId: { not: null }, createdAt: { gte: new Date(oldest - 24 * 60 * 60_000) } },
    select: { yativoPayoutId: true, transactionId: true },
    take: 200,
  });
  const byId = new Map(records.map((r) => [idOf(r), r]));
  const knownFound = known.filter((k) => byId.has(k.yativoPayoutId!));
  const keysVerified = knownFound.length > 0 && knownFound.every((k) => keyOf(byId.get(k.yativoPayoutId!)!) === k.transactionId);

  let trustAbsence = false;
  let whyUnknown = "";
  if (listingError) whyUnknown = `couldn't list Yativo payouts: ${listingError}`;
  else if (!reachedBack) whyUnknown = `Yativo's list didn't reach back to ${new Date(oldest).toISOString()} within ${MAX_PAGES} pages`;
  else if (knownFound.length === 0) whyUnknown = `none of our ${known.length} known submitted payouts appear in Yativo's list (${records.length} records read), so the list can't be trusted`;
  else if (!keysVerified) whyUnknown = "Yativo's payout records don't carry our idempotency key, so a hold can't be matched to them";
  else trustAbsence = true;

  log(`Yativo list: ${records.length} record(s) read; ${knownFound.length}/${known.length} known payouts found; idempotency keys ${keysVerified ? "verified" : "NOT verified"}.`);
  log(trustAbsence ? "" : `→ No hold will be released (only ones found on Yativo get linked): ${whyUnknown}.\n`);

  // ── Resolve each hold ─────────────────────────────────────────────────────
  const tally = { found: 0, released: 0, unknown: 0 };
  for (const p of holds) {
    const held = await formatMinorAmount(prisma, p.currencyCode, p.amountMinor + p.platformFeeMinor);
    const header = `payout ${p.id} · ${p.customer.email} → ${p.beneficiary.name} · ${held} ${p.currencyCode} · ${p.createdAt.toISOString()}\n  transaction ${p.transactionId}`;
    // An exact key match is safe to act on even when absence can't be trusted.
    const match = keysVerified ? records.find((r) => keyOf(r) === p.transactionId) : undefined;
    const matchId = match ? idOf(match) : undefined;

    if (matchId) {
      tally.found++;
      log(`${header}\n  FOUND on Yativo as ${matchId} (status "${String(match!.status ?? "?")}") → ${APPLY ? "linked; status poll queued" : "would link it and queue the status poll"}\n`);
      if (APPLY) {
        await prisma.payout.update({ where: { id: p.id }, data: { yativoPayoutId: matchId } });
        await enqueuePayoutStatusPoll(p.id, 1);
      }
    } else if (trustAbsence) {
      tally.released++;
      log(`${header}\n  NOT ON YATIVO → ${APPLY ? "hold released" : "would release the hold"}\n`);
      if (APPLY) await reverseTransaction(prisma, p.transactionId, "Payout never reached Yativo — stuck hold released by resolveStuckPayoutHolds");
    } else {
      tally.unknown++;
      log(`${header}\n  UNKNOWN → left alone. Check Yativo for this payout; if it never went out, release it from Admin → Transactions.\n`);
    }
  }
  log(`Summary: ${tally.found} found on Yativo, ${tally.released} ${APPLY ? "released" : "to release"}, ${tally.unknown} need a manual check.`);
  return tally;
}
