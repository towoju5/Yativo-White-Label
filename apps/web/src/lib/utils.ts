import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** "12.5" + 2 decimals → "1250" without float rounding; null when not a valid positive amount. */
export function majorToMinorString(value: string, decimals: number): string | null {
  const m = value.trim().match(/^(\d+)(?:\.(\d*))?$/);
  if (!m) return null;
  const frac = (m[2] ?? "").slice(0, decimals).padEnd(decimals, "0");
  const minor = (m[1] + frac).replace(/^0+(?=\d)/, "");
  return minor === "0" || /^0+$/.test(minor) ? null : minor;
}
