import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { YativoContext } from "../client.js";
import { yativoEnvelope } from "../client.js";

// Confirmed against the live API: the create response is double-nested — the outer envelope's
// `data` is itself `{ message, data: { id, ... } }`, not `{ id, ... }` directly as documented.
const beneficiaryDataSchema = z
  .object({
    data: z
      .object({
        id: z.union([z.string(), z.number()]),
      })
      .passthrough(),
  })
  .passthrough();

export const fiatBeneficiarySchema = z.object({
  yativoBeneficiaryId: z.string(),
  status: z.string(),
});
export type FiatBeneficiary = z.infer<typeof fiatBeneficiarySchema>;

export type CreateFiatBeneficiaryInput = {
  /** Yativo payout gateway id for the target currency/corridor — see fiat/paymentMethods.ts listPayoutMethods(). */
  gatewayId: number;
  nickname: string;
  currency: string;
  paymentData: Record<string, unknown>;
  /** Stable per our-side beneficiary id — same key on retry, so Yativo can dedupe it. Note: Yativo's beneficiary
   *  endpoint doesn't actually honor Idempotency-Key server-side, so callers still need their own duplicate-submit
   *  guard (e.g. disabling the submit button) — this header is sent anyway for forward-compatibility. */
  idempotencyKey: string;
};

// Confirmed live (gateway 1271, Nigeria): option objects use {name, value}, NOT {label, value} —
// `label` doesn't exist on the wire at all for this gateway. The old schema required `label`, so
// zod rejected every option, the whole field array failed to parse, and getForm()'s catch-all
// silently degraded to "no fields" — a beneficiary form that looked empty even though Yativo was
// returning real data. `label` is kept as a fallback in case some other gateway does use it.
const formFieldOptionSchema = z.object({ value: z.string(), name: z.string().optional(), label: z.string().optional() }).passthrough();

// Confirmed against the live API: fields are richer than "key/name/type/required" — `select`
// fields carry `options`, text fields carry `min`/`max` length bounds, any field can carry a
// `when: {key, value}` that makes it conditional on another field's current value (e.g. Chile's
// gateway 508 only asks for a legal name / document type+number when "Tipo de cliente" = natural),
// and a `type: "hidden"` field (e.g. Nigeria's gateway 1271 `destination_type`) carries a fixed
// `value` that must be submitted as-is in payment_data without ever being rendered as an input.
// There's also no explicit `required` on most fields — required-ness is implied by `min >= 1`.
// Confirmed live (Mexico gateway 1, SPEI): `value` is explicitly `null` (not omitted) on a field
// with no fixed default — z.string().optional() rejects null (only undefined), so the whole
// payment_data array failed to parse and getForm()'s catch-all silently degraded to "no fields",
// exactly like the earlier `label` vs `name` bug for gateway 1271 — a real, required two-field
// form (CLABE + beneficiary name) looked completely empty even though Yativo returned it.
const formFieldSchema = z
  .object({
    key: z.string(),
    name: z.string(),
    type: z.string(),
    value: z.string().nullable().optional(),
    required: z.boolean().optional(),
    options: z.array(formFieldOptionSchema).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    when: z.object({ key: z.string(), value: z.string() }).optional(),
  })
  .passthrough();

// Unlike every other fiat endpoint, this one does NOT use the standard {status, data} envelope —
// confirmed against the live API, it returns { gateway_id, currency, form_data } directly at the
// top level. Some gateways also return form_data without a payment_data array (or omit form_data
// entirely, or omit the whole payload) — there's no clean 404 for "no schema on file for this
// gateway", so every layer here treats a missing/empty response as "no fields to collect" rather
// than failing.
const formResponseSchema = z
  .object({ form_data: z.object({ payment_data: z.array(formFieldSchema).optional() }).passthrough().optional() })
  .passthrough();

export type BeneficiaryFormFieldOption = { value: string; label: string };
export type BeneficiaryFormField = {
  key: string;
  name: string;
  type: string;
  required: boolean;
  options?: BeneficiaryFormFieldOption[];
  min?: number;
  max?: number;
  /** This field only applies when the field named by `when.key` currently has value `when.value`. */
  when?: { key: string; value: string };
  /** Only meaningful for type: "hidden" — the fixed value to submit in payment_data verbatim; never render this field as an input. */
  defaultValue?: string;
};

export function createBeneficiariesResource(ctx: YativoContext) {
  return {
    async create(input: CreateFiatBeneficiaryInput): Promise<FiatBeneficiary> {
      const res = await ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: "/beneficiaries/payment-methods",
        method: "POST",
        headers: { "Idempotency-Key": input.idempotencyKey },
        body: { gateway_id: input.gatewayId, nickname: input.nickname, currency: input.currency, payment_data: input.paymentData },
        schema: yativoEnvelope(beneficiaryDataSchema),
        mockData: {
          status: "success",
          status_code: 200,
          message: "mock",
          data: { message: "mock", data: { id: "beneficiary-mock-001" } },
        },
      });
      console.log("create beneficiary response", res);
      return { yativoBeneficiaryId: String(res.data.data.id), status: "ACTIVE" };
    },

    async remove(yativoBeneficiaryId: string): Promise<void> {
      await ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: `/beneficiaries/payment-methods/delete/${yativoBeneficiaryId}`,
        method: "DELETE",
        headers: { "Idempotency-Key": randomUUID() },
        schema: z.unknown(),
        mockData: {},
      });
    },

    /**
     * Field schema for a single payout gateway — drives the "add beneficiary" form and the
     * payment_data object sent to create(). NOTE: the route is misleadingly named `{currency}`
     * in Yativo's own route table; the path segment is actually the numeric payout-method id
     * from paymentMethods.listPayoutMethods(), not a currency code.
     */
    async getForm(gatewayId: number): Promise<BeneficiaryFormField[]> {
      try {
        const res = await ctx.request({
          baseUrl: ctx.config.fiatBaseUrl,
          path: `/beneficiary/form/show/${gatewayId}`,
          method: "GET",
          schema: formResponseSchema,
          mockData: { form_data: { payment_data: [{ key: "accountNumber", name: "Account number", type: "text", required: true, min: 1 }] } },
        });
        return (res.form_data?.payment_data ?? []).map((f) => ({
          key: f.key,
          name: f.name,
          type: f.type,
          required: f.required ?? false,
          options: f.options?.map((o) => ({ value: o.value, label: o.label ?? o.name ?? o.value })),
          min: f.min,
          max: f.max,
          when: f.when,
          defaultValue: f.value ?? undefined,
        }));
      } catch {
        // No clean 404 exists for "this gateway has no form on file" — any failure here
        // (missing route, malformed body, etc.) degrades to "no fields to collect" rather
        // than blocking the beneficiary-creation flow.
        return [];
      }
    },
  };
}
