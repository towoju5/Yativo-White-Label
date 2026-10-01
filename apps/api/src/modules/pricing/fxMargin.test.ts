import { describe, expect, it } from "vitest";
import { floatRate, floatRateString, impliedBps, paySideMargin, receiveSideMargin } from "./fxMargin.js";

describe("exchange-rate float", () => {
  it("receive side keeps f of what's credited", () => {
    expect(receiveSideMargin(10000n, 150)).toBe(150n); // 1.5% of 100.00
    expect(receiveSideMargin(10000n, 0)).toBe(0n);
  });
  it("pay side charges enough that the payment, floated, buys the same amount", () => {
    const margin = paySideMargin(10000n, 200); // 2%
    expect(margin).toBe(205n); // 100.00 × 0.02/0.98 = 2.0408 → rounded up
    const paid = 10000n + margin;
    expect((paid * 98n) / 100n).toBeGreaterThanOrEqual(10000n);
  });
  it("floats rates in the customer's disfavour", () => {
    expect(floatRate("18.5", 100, "receive")).toBe("18.315"); // fewer MXN per USD received
    expect(floatRate("1410", 100, "pay")).toBe("1424.242424"); // more NGN paid per USD
    expect(floatRate("18.5", 0, "receive")).toBe("18.5");
  });
  it("floats the number inside a human-readable rate", () => {
    expect(floatRateString("1 USD = 17.2 MXN", 100)).toBe("1 USD = 17.37373737 MXN");
    expect(floatRateString("weird format", 100)).toBe("weird format");
  });
  it("recovers the float a stored transaction used", () => {
    expect(impliedBps(150n, 10000n)).toBe(150);
    expect(impliedBps(0n, 10000n)).toBe(0);
  });
});
