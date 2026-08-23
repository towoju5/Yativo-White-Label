import { z } from "zod";
import type { YativoContext } from "../client.js";
import { yativoEnvelope } from "../client.js";

const payinMethodSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    method_name: z.string(),
    country: z.string(),
    currency: z.string(),
    active: z.boolean().optional(),
  })
  .passthrough();

export type FiatPayinMethod = {
  gatewayId: string;
  methodName: string;
  country: string;
  currency: string;
  active: boolean;
};

function toPayinMethod(data: z.infer<typeof payinMethodSchema>): FiatPayinMethod {
  return {
    gatewayId: String(data.id),
    methodName: data.method_name,
    country: data.country,
    currency: data.currency,
    active: data.active ?? true,
  };
}

const payoutMethodSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    active: z.boolean().optional(),
    method_name: z.string(),
    gateway: z.string().optional(),
    country: z.string().optional(),
    currency: z.string().optional(),
    payment_mode: z.string().optional(),
    minimum_withdrawal: z.union([z.string(), z.number()]).optional(),
    maximum_withdrawal: z.union([z.string(), z.number()]).optional(),
    fixed_charge: z.union([z.string(), z.number()]).optional(),
    float_charge: z.union([z.string(), z.number()]).optional(),
    estimated_delivery: z.string().optional(),
  })
  .passthrough();

/** A payout rail for a given country/currency corridor — `gatewayId` is the id used as `gateway_id`/`method_id` in every later beneficiary/quote/payout step. */
export type FiatPayoutMethod = {
  gatewayId: string;
  active: boolean;
  methodName: string;
  gateway?: string;
  country?: string;
  currency?: string;
  paymentMode?: string;
  minimumWithdrawal?: string;
  maximumWithdrawal?: string;
  fixedCharge?: string;
  floatCharge?: string;
  estimatedDelivery?: string;
};

function toPayoutMethod(data: z.infer<typeof payoutMethodSchema>): FiatPayoutMethod {
  return {
    gatewayId: String(data.id),
    active: data.active ?? false,
    methodName: data.method_name,
    gateway: data.gateway,
    country: data.country,
    currency: data.currency,
    paymentMode: data.payment_mode,
    minimumWithdrawal: data.minimum_withdrawal !== undefined ? String(data.minimum_withdrawal) : undefined,
    maximumWithdrawal: data.maximum_withdrawal !== undefined ? String(data.maximum_withdrawal) : undefined,
    fixedCharge: data.fixed_charge !== undefined ? String(data.fixed_charge) : undefined,
    floatCharge: data.float_charge !== undefined ? String(data.float_charge) : undefined,
    estimatedDelivery: data.estimated_delivery,
  };
}

const payoutCountrySchema = z.object({ iso3: z.string(), iso2: z.string(), name: z.string() }).passthrough();
export type FiatPayoutCountry = { iso3: string; iso2: string; name: string };

// Confirmed against the live API: unlike the payout country list, this one has no `iso2` and
// nests each country's payin methods directly under `currencies` (a misleading name — it's an
// array of full method objects, not currency codes). We only use this endpoint for the country
// picker; listPayinMethodsByCountry() below is the source of truth for methods themselves.
const payinCountrySchema = z.object({ country: z.string(), name: z.string(), flag: z.string().optional() }).passthrough();
export type FiatPayinCountry = { iso3: string; name: string; flag?: string };

// Confirmed against the live API (gateway 196/MEX CODI): a payin method can require payer
// details beyond amount/currency — `required_extra_data.form_fields` carries the same
// key/name/type/options shape as a beneficiary's payment_data form, plus an optional
// `regex_map` (e.g. CODI's document-number field validates differently per document type).
// These fields must be submitted as flat, dot-notation top-level keys on the deposit create
// call (e.g. "payer.type": "INDIVIDUAL") — NOT nested under a payment_data object like
// beneficiaries. Confirmed via live 400 responses: omitting them fails with
// "The payer.type field is required...", and once supplied flat that validation error clears.
const payinFormFieldOptionSchema = z.object({ value: z.string(), label: z.string().optional() }).passthrough();
const payinFormFieldSchema = z
  .object({
    key: z.string(),
    name: z.string(),
    type: z.string(),
    required: z.boolean().optional(),
    options: z.array(payinFormFieldOptionSchema).optional(),
    regex_map: z.record(z.string()).optional(),
  })
  .passthrough();

export type FiatPayinFormField = {
  key: string;
  name: string;
  type: string;
  required: boolean;
  options?: { value: string; label: string }[];
  regexMap?: Record<string, string>;
};

function toFormField(f: z.infer<typeof payinFormFieldSchema>): FiatPayinFormField {
  return {
    key: f.key,
    name: f.name,
    type: f.type,
    required: f.required ?? false,
    options: f.options?.map((o) => ({ value: o.value, label: o.label ?? o.value })),
    regexMap: f.regex_map,
  };
}

const payinMethodDetailSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    active: z.boolean().optional(),
    method_name: z.string(),
    country: z.string().optional(),
    currency: z.string(),
    minimum_deposit: z.union([z.string(), z.number()]).nullable().optional(),
    maximum_deposit: z.union([z.string(), z.number()]).nullable().optional(),
    required_extra_data: z.object({ form_fields: z.array(payinFormFieldSchema).optional() }).passthrough().nullable().optional(),
  })
  .passthrough();

export type FiatPayinMethodDetail = {
  gatewayId: string;
  active: boolean;
  methodName: string;
  country?: string;
  currency: string;
  minimumDeposit?: string;
  maximumDeposit?: string;
  formFields: FiatPayinFormField[];
};

function toPayinMethodDetail(data: z.infer<typeof payinMethodDetailSchema>): FiatPayinMethodDetail {
  return {
    gatewayId: String(data.id),
    active: data.active ?? true,
    methodName: data.method_name,
    country: data.country,
    currency: data.currency,
    minimumDeposit: data.minimum_deposit != null ? String(data.minimum_deposit) : undefined,
    maximumDeposit: data.maximum_deposit != null ? String(data.maximum_deposit) : undefined,
    formFields: (data.required_extra_data?.form_fields ?? []).map(toFormField),
  };
}

export function createPaymentMethodsResource(ctx: YativoContext) {
  return {
    /** The business's enabled deposit (payin) rails — the `gatewayId` here is what fiat/deposits.ts needs. */
    async listPayinMethods(): Promise<FiatPayinMethod[]> {
      const res = await ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: "/my-payin-methods",
        method: "GET",
        schema: yativoEnvelope(z.object({ methods: z.array(payinMethodSchema) }).passthrough()),
        mockData: {
          status: "success",
          status_code: 200,
          message: "mock",
          data: { methods: [{ id: "mock-gateway-1", method_name: "Mock Bank Transfer", country: "USA", currency: "USD", active: true }] },
        },
      });
      return res.data.methods.map(toPayinMethod);
    },

    /**
     * Payout rails available for a country/currency corridor. Both filters are optional on
     * the API side, but the API also returns inactive rails — callers should filter on
     * `active` themselves (this method does not filter, so admin tooling can still see the
     * full list; use listActivePayoutMethods for the beneficiary-creation picker).
     */
    async listPayoutMethods(input?: { country?: string; currency?: string }): Promise<FiatPayoutMethod[]> {
      const res = await ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: "/payment-methods/payout",
        method: "GET",
        query: { country: input?.country, currency: input?.currency },
        schema: yativoEnvelope(z.array(payoutMethodSchema)),
        mockData: {
          status: "success",
          status_code: 200,
          message: "mock",
          data: [
            {
              // Numeric-looking, not a slug — the real API's gateway ids are always numeric,
              // and this id round-trips through a `z.coerce.number()` route param
              // (GET /portal/beneficiaries/form/:gatewayId) on the way to getForm() below.
              id: "196",
              active: true,
              method_name: "Mock Bank Transfer",
              gateway: "mock",
              country: input?.country ?? "MEX",
              currency: input?.currency ?? "MXN",
              payment_mode: "bank_transfer",
              minimum_withdrawal: "10",
              maximum_withdrawal: "50000",
              fixed_charge: "1.5",
              float_charge: "0.01",
              estimated_delivery: "1-2 business days",
            },
          ],
        },
      });
      return res.data.map(toPayoutMethod);
    },

    /** Convenience wrapper over listPayoutMethods that filters to `active === true` — the API returns inactive rails too. */
    async listActivePayoutMethods(input?: { country?: string; currency?: string }): Promise<FiatPayoutMethod[]> {
      const methods = await this.listPayoutMethods(input);
      return methods.filter((m) => m.active);
    },

    /** Countries that have at least one payout method configured — a cheaper picker than filtering the full country list. */
    async listPayoutCountries(): Promise<FiatPayoutCountry[]> {
      const res = await ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: "/payment-methods/payout/countries",
        method: "GET",
        schema: yativoEnvelope(z.array(payoutCountrySchema)),
        mockData: {
          status: "success",
          status_code: 200,
          message: "mock",
          data: [{ iso3: "MEX", iso2: "MX", name: "Mexico" }],
        },
      });
      // Confirmed against the live API: unlike /locations/countries, this endpoint returns
      // lowercase names ("mexico", "united states") — title-cased here for display.
      return res.data.map((c) => ({ ...c, name: titleCase(c.name) }));
    },

    /** Countries with at least one payin (deposit) method configured — the first step of the deposit flow. */
    async listPayinCountries(): Promise<FiatPayinCountry[]> {
      const res = await ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: "/payment-methods/payin/countries",
        method: "GET",
        schema: yativoEnvelope(z.array(payinCountrySchema)),
        mockData: {
          status: "success",
          status_code: 200,
          message: "mock",
          data: [{ country: "MEX", name: "mexico", flag: "https://example.com/mx.svg" }],
        },
      });
      return res.data.map((c) => ({ iso3: c.country, name: titleCase(c.name), flag: c.flag }));
    },

    /** Payin (deposit) methods for a country — each carries its own form fields (see FiatPayinFormField) when the gateway needs payer details beyond amount/currency. */
    async listPayinMethodsByCountry(input: { country: string; currency?: string }): Promise<FiatPayinMethodDetail[]> {
      const res = await ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: "/payment-methods/payin",
        method: "GET",
        query: { country: input.country, currency: input.currency },
        schema: yativoEnvelope(z.array(payinMethodDetailSchema)),
        mockData: {
          status: "success",
          status_code: 200,
          message: "mock",
          data: [
            {
              id: "mock-payin-1",
              active: true,
              method_name: "Mock Bank Transfer",
              country: input.country,
              currency: input.currency ?? "MXN",
              minimum_deposit: "100",
              maximum_deposit: "1000000",
              required_extra_data: null,
            },
          ],
        },
      });
      return res.data.map(toPayinMethodDetail);
    },
  };
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
