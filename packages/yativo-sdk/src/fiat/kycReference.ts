import { z } from "zod";
import type { YativoContext } from "../client.js";

/**
 * Lookup/reference endpoints on the KYC host (kyc.yativo.com) — used to drive
 * the KYC/KYB form's dropdowns and client-side validation. Per
 * KYC_KYB_INTEGRATION_GUIDE.md §1, none of these require auth, and the guide
 * is explicit that these values drift — always fetch live, never hardcode.
 * None of these have a mock fixture: they're pure reference data with no
 * meaningful "mock" shape, so mock mode returns an empty list.
 */
export function createKycReferenceResource(ctx: YativoContext) {
  function get<T>(path: string, schema: z.ZodType<T>, mockData: unknown) {
    return ctx.request({ baseUrl: ctx.config.kycBaseUrl, path, method: "GET", schema, mockData });
  }

  const countrySchema = z.object({ code: z.string(), iso3: z.string(), name: z.string() });
  const subdivisionSchema = z.object({ code: z.string(), name: z.string() });
  const idTypeSchema = z.object({ type: z.string(), description: z.string() });
  const postalCodeRuleSchema = z
    .object({
      country_code: z.string(),
      uses_postal_codes: z.boolean(),
      validation: z.object({ rule_regex: z.string().optional(), rule_samples: z.array(z.string()).optional() }).optional(),
    })
    .passthrough();
  const occupationSchema = z.object({ occupation: z.string(), code: z.string() });
  /** account-purposes / source-of-funds / expected-monthly-payments all return `{ key: label }`. */
  const labelMapSchema = z.record(z.string());

  return {
    listCountries: () => get("/api/countries", z.array(countrySchema), []),
    listSubdivisions: (countryCode: string) => get(`/api/subdivisions/${countryCode}`, z.array(subdivisionSchema), []),
    listIdentificationTypes: (countryCode: string) => get(`/api/identification-types/${countryCode}`, z.array(idTypeSchema), []),
    getPostalCodeRule: (countryCode: string) => get(`/api/postal-codes/${countryCode}`, postalCodeRuleSchema, { country_code: countryCode, uses_postal_codes: true }),
    listOccupations: () => get("/api/occupations", z.array(occupationSchema), []),
    listBusinessIndustries: () => get("/api/business-industries", z.array(occupationSchema), []),
    listIndividualAccountPurposes: () => get("/api/individual-kyc/account-purposes", labelMapSchema, {}),
    listIndividualSourceOfFunds: () => get("/api/individual-kyc/source-of-funds", labelMapSchema, {}),
    listIndividualExpectedMonthlyPayments: () => get("/api/individual-kyc/expected-monthly-payments-usd", labelMapSchema, {}),
    listBusinessAccountPurposes: () => get("/api/business-kyc/account-purposes", labelMapSchema, {}),
    listBusinessSourceOfFunds: () => get("/api/business-kyc/source-of-funds", labelMapSchema, {}),
  };
}

export type KycCountryRef = { code: string; iso3: string; name: string };
export type KycSubdivisionRef = { code: string; name: string };
export type KycIdTypeRef = { type: string; description: string };
export type KycOccupationRef = { occupation: string; code: string };
