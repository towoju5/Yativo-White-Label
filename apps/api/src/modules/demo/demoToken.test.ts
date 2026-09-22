import { describe, it, expect } from "vitest";
import { generateDemoToken, hashDemoToken } from "./demoToken.js";

describe("demoToken", () => {
  it("generates high-entropy, unique tokens", () => {
    const a = generateDemoToken();
    const b = generateDemoToken();
    expect(a).not.toEqual(b);
    // 32 random bytes, base64url-encoded, is at least 40 chars with no padding.
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("hashes deterministically", () => {
    const token = generateDemoToken();
    expect(hashDemoToken(token)).toEqual(hashDemoToken(token));
  });

  it("produces different hashes for different tokens", () => {
    expect(hashDemoToken(generateDemoToken())).not.toEqual(hashDemoToken(generateDemoToken()));
  });

  it("hash never equals the raw token (no accidental identity mapping)", () => {
    const token = generateDemoToken();
    expect(hashDemoToken(token)).not.toEqual(token);
  });

  it("hash is a 64-char lowercase hex string (sha256)", () => {
    expect(hashDemoToken(generateDemoToken())).toMatch(/^[0-9a-f]{64}$/);
  });
});
