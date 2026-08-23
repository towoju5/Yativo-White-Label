import { z } from "zod";
import type { YativoContext } from "../client.js";
import { yativoEnvelope } from "../client.js";

// Confirmed against the live API: GET /customer/{id} includes a per-service endorsement
// checklist — `service` is a human-readable, Title Case name ("Faster payments", "Cobo pobo")
// that we normalize to snake_case so it lines up with fiat/virtualAccounts.ts's
// `endorsement` values ("faster_payments", "cobo_pobo") from
// GET /business/virtual-account/currencies-and-endorsements. `status` is a free-form string
// from Yativo (seen live: "not_started", "approved" — treat anything else as not-yet-approved
// rather than enumerating every possible value).
const endorsementSchema = z
  .object({
    service: z.string(),
    status: z.string(),
    hosted_kyc_url: z.string().nullable().optional(),
    updated: z.string().optional(),
  })
  .passthrough();

const customerDataSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    customer_id: z.string().optional(),
    customer_status: z.string().optional(),
    customer_kyc_status: z.string().nullable().optional(),
    kyc_verified_date: z.string().nullable().optional(),
    endorsement: z.array(endorsementSchema).optional(),
  })
  .passthrough();

export type FiatCustomerEndorsement = {
  /** snake_case, matching FiatVirtualAccountCurrency.endorsement — e.g. "faster_payments", "virtual_card". */
  service: string;
  status: string;
  hostedKycUrl: string | null;
  /** Yativo's own free-form display string (e.g. "Aug 21, 2026 16:52") — not parsed, shown as-is. */
  updated: string | null;
};

export const fiatCustomerSchema = z.object({
  yativoCustomerId: z.string(),
  status: z.string(),
  kycStatus: z.string().nullable(),
  kycVerifiedAt: z.string().nullable(),
});
export type FiatCustomer = z.infer<typeof fiatCustomerSchema> & { endorsements: FiatCustomerEndorsement[] };

function normalizeServiceName(service: string): string {
  return service.trim().toLowerCase().replace(/\s+/g, "_");
}

// Confirmed live: once a service is approved (no verification link needed any more), Yativo
// sometimes returns the literal string "[]" for hosted_kyc_url instead of null — an
// empty-array-serialized-as-string artifact, not a URL. Only pass through values that actually
// look like a link.
function normalizeHostedKycUrl(url: string | null | undefined): string | null {
  return url && /^https?:\/\//.test(url) ? url : null;
}

function toFiatCustomer(data: z.infer<typeof customerDataSchema>): FiatCustomer {
  const id = data.customer_id ?? data.id;
  if (id === undefined) throw new Error("Yativo customer response missing id/customer_id");
  return {
    yativoCustomerId: String(id),
    status: data.customer_status ?? "active",
    kycStatus: data.customer_kyc_status ?? null,
    kycVerifiedAt: data.kyc_verified_date ?? null,
    endorsements: (data.endorsement ?? []).map((e) => ({
      service: normalizeServiceName(e.service),
      status: e.status,
      hostedKycUrl: normalizeHostedKycUrl(e.hosted_kyc_url),
      updated: e.updated ?? null,
    })),
  };
}

// Confirmed live: GET https://kyc.yativo.com/api/kyc/regenerate/{customerId}/{service} is on the
// KYC host, not the fiat host, and does NOT use the standard {status, status_code, message, data}
// envelope (no status_code at all — {status, message, data}) — nor does it match its own docs,
// which claim a single {customer_id, service, link, expires_at} object. The real response is an
// ARRAY of every one of the customer's endorsements (not just the one requested), each shaped
// like the customer-get endorsement entries except `service` here is already snake_case (unlike
// customer-get's Title Case) and `hosted_kyc_url` is a one-element string ARRAY when a link
// exists ([] or null otherwise) rather than a bare string. Calling this for any one pending
// service refreshes the link for ALL currently-pending services at once (they share one hosted
// checkout session), so the whole updated list is returned and merged by the caller.
const regenerateEntrySchema = z
  .object({
    service: z.string(),
    status: z.string(),
    hosted_kyc_url: z.union([z.array(z.string()), z.string(), z.null()]).optional(),
  })
  .passthrough();

const regenerateResponseSchema = z.object({
  status: z.string(),
  message: z.string(),
  data: z.array(regenerateEntrySchema),
});

function extractHostedUrl(value: string[] | string | null | undefined): string | null {
  if (Array.isArray(value)) return normalizeHostedKycUrl(value[0]);
  return normalizeHostedKycUrl(value);
}

export type CreateFiatCustomerInput = {
  fullName: string;
  email: string;
  /** E.164 format, e.g. "+15551234567" — required by Yativo. */
  phone: string;
  /** ISO3 country code, e.g. "USA". */
  countryIso3: string;
  type?: "individual" | "business";
  /**
   * Stable per our-side identity of the thing being created (e.g. our local customer id) —
   * NOT a fresh random value per call. A retry of the same logical "create this customer"
   * request must reuse the same key so Yativo can dedupe it; a random key defeats that.
   */
  idempotencyKey: string;
};

export function createCustomersResource(ctx: YativoContext) {
  return {
    async create(input: CreateFiatCustomerInput): Promise<FiatCustomer> {
      const res = await ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: "/customer",
        method: "POST",
        headers: { "Idempotency-Key": input.idempotencyKey },
        body: {
          customer_name: input.fullName,
          customer_email: input.email,
          customer_phone: input.phone,
          customer_country: input.countryIso3,
          customer_type: input.type ?? "individual",
        },
        schema: yativoEnvelope(customerDataSchema),
        mockData: {
          status: "success",
          status_code: 201,
          message: "mock",
          data: { customer_id: "yativo-cust-mock-001", customer_status: "active" },
        },
      });
      return toFiatCustomer(res.data);
    },

    /** `include`: any of "deposits" | "payouts" | "virtualaccounts" | "virtual_cards" | "crypto_wallets" | "all". */
    async get(yativoCustomerId: string, include?: string): Promise<FiatCustomer> {
      const res = await ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: `/customer/${yativoCustomerId}`,
        method: "GET",
        query: include ? { include } : undefined,
        schema: yativoEnvelope(customerDataSchema),
        mockData: {
          status: "success",
          status_code: 200,
          message: "mock",
          data: { customer_id: "yativo-cust-mock-001", customer_status: "active", customer_kyc_status: "pending" },
        },
      });
      return toFiatCustomer(res.data);
    },

    /**
     * Confirmed live: `create()` 422s with "Customer email already exists" when a Yativo
     * customer for this email was already provisioned some other way (e.g. before this
     * customer's local `yativoCustomerId` was captured, or created directly against Yativo).
     * This recovers that existing record instead of treating it as an unrecoverable failure —
     * see ensureYativoCustomer's create-then-recover fallback. Returns null if genuinely absent.
     */
    async findByEmail(email: string): Promise<FiatCustomer | null> {
      const res = await ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: "/customer",
        method: "GET",
        query: { email },
        schema: yativoEnvelope(z.array(customerDataSchema)),
        mockData: { status: "success", status_code: 200, message: "mock", data: [] },
      });
      return res.data[0] ? toFiatCustomer(res.data[0]) : null;
    },

    /**
     * Generates a fresh hosted verification link for one endorsement service — needed because
     * the passive get() call above never actually carries a usable hosted_kyc_url (confirmed
     * live: it's always null/empty there, even for a "pending" service). Returns every
     * endorsement Yativo reports back (see regenerateResponseSchema's doc comment for why),
     * normalized the same way get()'s `endorsements` are.
     */
    async regenerateEndorsementLink(yativoCustomerId: string, service: string): Promise<FiatCustomerEndorsement[]> {
      const res = await ctx.request({
        baseUrl: ctx.config.kycBaseUrl,
        path: `/api/kyc/regenerate/${yativoCustomerId}/${service}`,
        method: "GET",
        schema: regenerateResponseSchema,
        mockData: {
          status: "successful",
          message: "mock",
          data: [{ service, status: "pending", hosted_kyc_url: ["https://checkout.yativo.com/kyc/init/mock"] }],
        },
      });
      return res.data.map((e) => ({
        service: e.service,
        status: e.status,
        hostedKycUrl: extractHostedUrl(e.hosted_kyc_url),
        updated: null,
      }));
    },
  };
}
