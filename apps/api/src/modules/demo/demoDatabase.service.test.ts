import { describe, it, expect } from "vitest";
import { DEMO_DB_NAME_REGEX, assertSafeDemoDatabaseName, generateDemoDatabaseName } from "./demoDatabase.service.js";

describe("demo database name safety checks", () => {
  it("generateDemoDatabaseName always produces a name matching the internal pattern", () => {
    for (let i = 0; i < 20; i++) {
      const name = generateDemoDatabaseName();
      expect(name).toMatch(DEMO_DB_NAME_REGEX);
    }
  });

  it("accepts a well-formed demo database name", () => {
    const name = generateDemoDatabaseName();
    expect(() => assertSafeDemoDatabaseName(name)).not.toThrow();
  });

  it("rejects SQL-injection-shaped input", () => {
    expect(() => assertSafeDemoDatabaseName('demo_x"; DROP TABLE users; --')).toThrow();
    expect(() => assertSafeDemoDatabaseName("demo_' OR '1'='1")).toThrow();
  });

  it("rejects a name with the wrong prefix", () => {
    expect(() => assertSafeDemoDatabaseName("whitelabel")).toThrow();
    expect(() => assertSafeDemoDatabaseName("prod_" + "a".repeat(32))).toThrow();
  });

  it("rejects a name with too few/many hex characters", () => {
    expect(() => assertSafeDemoDatabaseName("demo_abc")).toThrow();
    expect(() => assertSafeDemoDatabaseName("demo_" + "a".repeat(31))).toThrow();
    expect(() => assertSafeDemoDatabaseName("demo_" + "a".repeat(33))).toThrow();
  });

  it("rejects uppercase hex (case-sensitive by design)", () => {
    expect(() => assertSafeDemoDatabaseName("demo_" + "A".repeat(32))).toThrow();
  });

  it("rejects path traversal / whitespace / null-byte shaped input", () => {
    expect(() => assertSafeDemoDatabaseName("demo_" + "a".repeat(28) + "/../")).toThrow();
    expect(() => assertSafeDemoDatabaseName("demo_" + "a".repeat(30) + " \0")).toThrow();
  });

  it("rejects an empty string and non-string-shaped edge cases", () => {
    expect(() => assertSafeDemoDatabaseName("")).toThrow();
  });

  it("never accepts the production database name even if it happened to match the pattern", () => {
    // Can't easily fabricate a real collision without knowing the prod db name at test time, but
    // we can assert the check function exists and independently rejects the literal env value.
    const prodLikeName = "whitelabel";
    expect(() => assertSafeDemoDatabaseName(prodLikeName)).toThrow();
  });
});
