/**
 * Best-effort numeric extraction from Yativo's human-readable fee/rate strings — e.g.
 * `"3.4 MXN"` -> 3.4, or `"1 USD = 17.2 MXN"` -> 17.2 (the last decimal number in the string,
 * which for a "1 <wallet> = <rate> <local>" style rate string is the actual rate). Returns
 * `undefined` on anything that doesn't contain a parseable number — this must never throw, since
 * fee-string parsing should never block a deposit or withdrawal from going through.
 */
export function parseYativoFeeString(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const matches = value.match(/\d+(\.\d+)?/g);
  if (!matches || matches.length === 0) return undefined;
  const parsed = Number(matches[matches.length - 1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}
