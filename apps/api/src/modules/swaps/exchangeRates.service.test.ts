import { describe, expect, it } from "vitest";
import { convertMinor, crossRate, rateToDecimalString } from "./exchangeRates.service.js";

const rates = { base: "USD", rates: { USD: 1, EUR: 0.9187, ARS: 1185.5, MXN: 18.6024, XYZ: null }, updatedAt: "2026-10-01T12:00:00+00:00" };

describe("crossRate", () => {
  it("returns the direct rate from the base", () => {
    expect(crossRate(rates, "USD", "ARS")).toBe(1185.5);
  });
  it("derives a cross rate between two non-base currencies", () => {
    expect(crossRate(rates, "EUR", "MXN")).toBeCloseTo(18.6024 / 0.9187, 10);
  });
  it("is null when either side has no rate", () => {
    expect(crossRate(rates, "USD", "XYZ")).toBeNull();
    expect(crossRate(rates, "NOPE", "USD")).toBeNull();
  });
});

describe("rateToDecimalString", () => {
  it("never uses exponent notation", () => {
    expect(rateToDecimalString(1 / 1185.5)).toBe("0.0008435259384");
    expect(rateToDecimalString(1185.5)).toBe("1185.5");
    expect(rateToDecimalString(1)).toBe("1");
  });
});

describe("convertMinor", () => {
  it("converts between currencies with the same decimals", () => {
    // $100.00 at 0.9187 → €91.87
    expect(convertMinor(10000n, "0.9187", 2, 2)).toBe(9187n);
  });
  it("rounds down to the target currency's minor unit", () => {
    // $1.01 at 0.9187 = €0.927887 → €0.92
    expect(convertMinor(101n, "0.9187", 2, 2)).toBe(92n);
  });
  it("handles differing decimals", () => {
    // 1.50 USD (2dp) at 941.2 → 1411.8 CLP (0dp) → 1411
    expect(convertMinor(150n, "941.2", 2, 0)).toBe(1411n);
    // 1000 CLP (0dp) at 0.001062 → 1.062 USD → 106 cents
    expect(convertMinor(1000n, "0.001062", 0, 2)).toBe(106n);
  });
  it("handles integer rates", () => {
    expect(convertMinor(500n, "2", 2, 2)).toBe(1000n);
  });
});
