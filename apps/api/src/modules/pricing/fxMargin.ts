import type { PrismaClient } from "@prisma/client";

/**
 * The exchange-rate float (Settings → Pricing): one platform-wide margin, in basis points, applied
 * to every conversion made for a customer. The single rule everywhere is that the customer gets
 * `bps` less value than the market rate would give them:
 *
 * - Receive-side (gateway deposits, swaps): they're credited (1 − f) of the market conversion —
 *   the margin is `receiveSideMargin(credited)`.
 * - Pay-side (payouts): the recipient's amount is fixed by Yativo, so the customer instead pays
 *   enough extra that what they paid, floated, buys exactly that — `paySideMargin(debit)`, i.e.
 *   debit × f / (1 − f).
 *
 * Same-currency transactions never carry a margin. The margin is always booked as platform fee
 * revenue, folded into the transaction's existing locked-in platform fee so the ledger paths that
 * hold, settle and reverse that fee carry it unchanged.
 */

export const MAX_FX_MARGIN_BPS = 2000;

export async function getFxMarginBps(prisma: PrismaClient): Promise<number> {
  const settings = await prisma.platformSettings.findUnique({ where: { id: 1 }, select: { fxMarginBps: true } });
  return settings?.fxMarginBps ?? 0;
}

/** Margin kept from a receive-side conversion (deposit, swap): `creditedMinor` × f, rounded down. */
export function receiveSideMargin(creditedMinor: bigint, bps: number): bigint {
  if (bps <= 0 || creditedMinor <= 0n) return 0n;
  return (creditedMinor * BigInt(bps)) / 10000n;
}

/** Extra charged on a pay-side conversion (payout): `debitMinor` × f / (1 − f), rounded up so the float is never under-charged. */
export function paySideMargin(debitMinor: bigint, bps: number): bigint {
  if (bps <= 0 || debitMinor <= 0n) return 0n;
  const numerator = debitMinor * BigInt(bps);
  const denominator = BigInt(10000 - bps);
  return (numerator + denominator - 1n) / denominator;
}

/**
 * A quoted rate as the customer should see it once floated. `rate` is "1 FROM = rate TO";
 * `direction` says which side the customer is on — "receive" when TO is what they get (they get
 * fewer TO per FROM), "pay" when FROM is what they get per unit of TO they hand over (e.g. a
 * deposit's "1 USD = 1410 NGN", where NGN is paid in: they pay more NGN per USD).
 */
export function floatRate(rate: string | number, bps: number, direction: "receive" | "pay"): string {
  const r = typeof rate === "number" ? rate : Number(String(rate).replace(/,/g, ""));
  if (!Number.isFinite(r) || r <= 0 || bps <= 0) return String(rate);
  const f = bps / 10000;
  const floated = direction === "receive" ? r * (1 - f) : r / (1 - f);
  return Number(floated.toPrecision(10)).toString();
}

/** Floats the number inside Yativo's human-readable deposit rate ("1 USD = 17.2 MXN") — left as-is if it isn't in that shape. */
export function floatRateString(rateText: string | null | undefined, bps: number): string | null {
  if (!rateText) return rateText ?? null;
  const m = rateText.match(/^(\s*1\s+\S+\s*=\s*)([\d.,]+)(\s*\S+\s*)$/);
  return m ? `${m[1]}${floatRate(m[2]!, bps, "pay")}${m[3]}` : rateText;
}

/** The float that was in force for a stored transaction, recovered from its own margin — so receipts never change when the setting does later. */
export function impliedBps(marginMinor: bigint, baseMinor: bigint | null | undefined): number {
  if (!baseMinor || baseMinor <= 0n || marginMinor <= 0n) return 0;
  return Math.round(Number((marginMinor * 1000000n) / baseMinor) / 100);
}
