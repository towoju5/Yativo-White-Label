import type { Redis } from "ioredis";
import type { FiatExchangeRates } from "@white-label/yativo-sdk";
import { yativoClient } from "../../lib/yativoClient.js";
import { AppError } from "../../lib/errors.js";
import logger from "../../lib/logger.js";

/**
 * Yativo allows ONE GET /exchange-rates call per minute per account (429 beyond that), and only
 * refreshes rates about once a minute anyway — so the whole API shares one cached table in Redis.
 * Always fetched against a single base (USD) and cross rates derived from it: a second base would
 * cost a second call inside the same minute.
 */
const RATE_BASE = "USD";
const CACHE_KEY = "fx:rates";
/** Doubles as an attempt throttle: held for a minute after every fetch attempt (success or not) and never released early, so no instance can call Yativo more than once a minute — even after a 429. */
const FETCH_THROTTLE_KEY = "fx:rates:fetch";
const REFRESH_AFTER_MS = 60_000;
/** Rates older than this aren't used to price a swap — see assertRatesFreshForPricing. */
const MAX_PRICING_AGE_MS = 15 * 60_000;

type CachedRates = FiatExchangeRates & { fetchedAt: number };

async function readCache(redis: Redis): Promise<CachedRates | null> {
  const raw = await redis.get(CACHE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CachedRates;
  } catch {
    return null;
  }
}

function rateAgeMs(rates: FiatExchangeRates & { fetchedAt?: number }): number {
  const updated = Date.parse(rates.updatedAt);
  return Date.now() - (Number.isFinite(updated) ? updated : (rates.fetchedAt ?? 0));
}

const unavailable = () => new AppError("Exchange rates are temporarily unavailable. Please try again shortly.", 503, "RATES_UNAVAILABLE");

/** Current rate table (1 USD = rate units of each currency), refreshed at most once a minute. Serves the last good table if a refresh fails. */
export async function getExchangeRates(redis: Redis): Promise<FiatExchangeRates> {
  const cached = await readCache(redis);
  if (cached && Date.now() - cached.fetchedAt < REFRESH_AFTER_MS) return cached;

  const mayFetch = await redis.set(FETCH_THROTTLE_KEY, "1", "PX", REFRESH_AFTER_MS, "NX");
  if (mayFetch) {
    try {
      const fresh: CachedRates = { ...(await yativoClient.fiat.exchangeRates.list(RATE_BASE)), fetchedAt: Date.now() };
      await redis.set(CACHE_KEY, JSON.stringify(fresh), "EX", 24 * 60 * 60);
      return fresh;
    } catch (err) {
      logger.warn({ err }, "exchange rate refresh failed");
      if (cached) return cached;
      throw unavailable();
    }
  }

  if (cached) return cached;
  // Another instance is mid-fetch on a cold cache — give it a moment rather than failing outright.
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 300));
    const filled = await readCache(redis);
    if (filled) return filled;
  }
  throw unavailable();
}

/** A swap is priced off the cached table, so refuse to price one when that table is old (Yativo down for a while). */
export function assertRatesFreshForPricing(rates: FiatExchangeRates) {
  if (rateAgeMs(rates) > MAX_PRICING_AGE_MS) throw unavailable();
}

/** 1 `from` = rate `to`, or null if either side has no rate right now. */
export function crossRate(rates: FiatExchangeRates, from: string, to: string): number | null {
  const fromRate = from === rates.base ? 1 : rates.rates[from];
  const toRate = to === rates.base ? 1 : rates.rates[to];
  if (!fromRate || !toRate) return null;
  return toRate / fromRate;
}

/** Fixed-point decimal string with `significant` significant digits — never exponent notation, so it parses back exactly as a fraction. */
export function rateToDecimalString(rate: number, significant = 10): string {
  const precise = Number(rate.toPrecision(significant));
  const decimals = Math.max(0, significant - 1 - Math.floor(Math.log10(Math.abs(precise))));
  return precise.toFixed(Math.min(decimals, 20)).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

/** amountMinor (in `fromDecimals`) × rate → minor units of the target currency, rounded down. Exact BigInt arithmetic on the decimal string — no float in the money path. */
export function convertMinor(amountMinor: bigint, rate: string, fromDecimals: number, toDecimals: number): bigint {
  const [whole, frac = ""] = rate.split(".");
  const numerator = BigInt(whole + frac);
  const denominator = 10n ** BigInt(frac.length);
  return (amountMinor * numerator * 10n ** BigInt(toDecimals)) / (denominator * 10n ** BigInt(fromDecimals));
}
