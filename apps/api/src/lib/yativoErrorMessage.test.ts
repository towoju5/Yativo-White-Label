import { describe, it, expect } from "vitest";
import { parseYativoErrorMessage } from "@white-label/yativo-sdk";
const p = (o: unknown) => parseYativoErrorMessage(typeof o === "string" ? o : JSON.stringify(o));
describe("parseYativoErrorMessage", () => {
  it("keeps existing shapes", () => {
    expect(p({ data: { error: "Invalid account" } })).toBe("Invalid account");
    expect(p({ data: { currency: ["The selected currency is invalid."] } })).toBe("The selected currency is invalid.");
    expect(p({ message: "Request failed.", data: { status: false, message: "Asset not found!" } })).toBe("Asset not found!");
    expect(p({ error: "Card not found" })).toBe("Card not found");
    expect(p({ message: "Validation error.", validation_errors: { a: ["A is required."] } })).toBe("A is required.");
  });
  it("unwraps nested objects and stringified JSON", () => {
    expect(p({ message: "Request failed.", data: { error: { message: "Account number is invalid" } } })).toBe("Account number is invalid");
    expect(p({ data: { error: JSON.stringify({ code: "X1", message: "Beneficiary bank is unavailable" }) } })).toBe("Beneficiary bank is unavailable");
    expect(p({ data: { error: { errors: { account: ["Account must be 10 digits"] } } } })).toBe("Account must be 10 digits");
  });
  it("unwraps forwarded gateway errors and never leaks URLs or dumps", () => {
    expect(p({ data: { error: 'Client error: `POST https://gw.example.com/v1/x` resulted in a `400 Bad Request` response:\n{"error":{"message":"Invalid IBAN"}}' } })).toBe("Invalid IBAN");
    expect(p({ data: { error: 'Client error: `POST https://gw.example.com/v1/x` resulted in a `400 Bad Request` response:\n{"error":{"mess (truncated...)' }, message: "Request failed." })).toBe("Request failed.");
    expect(p({ data: { error: "SQLSTATE[23000]: Integrity constraint violation" } })).toBeUndefined();
    expect(p({ data: { error: { foo: 1 } } })).toBeUndefined();
  });
});
