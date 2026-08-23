import { z } from "zod";

/**
 * All money crosses the wire as a base-10 string of minor units (cents, or the
 * smallest unit for the given currency's `decimals`) — never a float, never a
 * raw JS number — since BigInt isn't JSON-serializable and floats lose cents.
 */
export const minorAmountSchema = z.string().regex(/^-?\d+$/, "must be an integer minor-unit string");
export type MinorAmount = z.infer<typeof minorAmountSchema>;

export const currencyCodeSchema = z.string().length(3).toUpperCase();

/** Thousands-grouped major-unit string, e.g. "1,234.56" — grouping is done on the digit string, never via Number(), so it's exact for arbitrarily large minor-unit values. */
export function formatMinorAmount(amountMinor: string | bigint, decimals: number): string {
  const negative = typeof amountMinor === "bigint" ? amountMinor < 0n : amountMinor.startsWith("-");
  const digits = (typeof amountMinor === "bigint" ? amountMinor.toString() : amountMinor).replace("-", "");
  const padded = digits.padStart(decimals + 1, "0");
  const wholeDigits = padded.slice(0, padded.length - decimals) || "0";
  const whole = wholeDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = decimals > 0 ? "." + padded.slice(padded.length - decimals) : "";
  return `${negative ? "-" : ""}${whole}${fraction}`;
}

/**
 * Same as formatMinorAmount, but prefixed with a currency symbol when one is known (e.g. "$1,234.56"),
 * falling back to a trailing currency code when it isn't (e.g. "1,234.56 NGN") — the same convention
 * most currency displays use, and the only sane fallback for the many corridors Yativo doesn't hand
 * us a symbol for (see Currency.symbol, populated from GET /currencies/all — a small, curated set).
 */
export function formatCurrencyAmount(amountMinor: string | bigint, decimals: number, symbol: string | null | undefined, code: string): string {
  const formatted = formatMinorAmount(amountMinor, decimals);
  if (!symbol) return `${formatted} ${code}`;
  return formatted.startsWith("-") ? `-${symbol}${formatted.slice(1)}` : `${symbol}${formatted}`;
}
