/** Converts a major-unit decimal amount (e.g. "17.20") to minor units for a given currency's decimals. Same rounding approach as the inline helper in quotes.routes.ts, promoted here since it's now needed in more than one place. */
export function majorToMinor(majorAmount: string | number, decimals: number): bigint {
  return BigInt(Math.round(Number(majorAmount) * 10 ** decimals));
}
