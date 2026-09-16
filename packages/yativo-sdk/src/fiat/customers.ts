import { z } from "zod";
import type { YativoContext } from "../client.js";
import { yativoEnvelope, yativoPaginatedEnvelope } from "../client.js";

// `errors`/`requirements_due`/`future_requirements_due`/`metadata` are all free-form and
// inconsistently shaped live — seen as a plain string ("Missing BVN"), an object
// ({"all_of": ["government_id_document"]}), an empty array ([]), or null, depending on the
// service and provider behind it. Accept anything rather than picking one shape and breaking on
// the others; callers format defensively (see formatFlexibleField in EndorsementsTable.tsx).
const flexibleEndorsementFieldSchema = z.union([z.string(), z.array(z.unknown()), z.record(z.unknown())]).nullable().optional();

// Confirmed against the live API: GET /customer/{id} includes a per-service endorsement
// checklist — `service` is a human-readable, Title Case name ("Faster payments", "Cobo pobo")
// that we normalize to snake_case so it lines up with fiat/virtualAccounts.ts's
// `endorsement` values ("faster_payments", "cobo_pobo") from
// GET /business/virtual-account/currencies-and-endorsements. `status` is a free-form string
// from Yativo (seen live: "not_started", "pending", "approved", "declined").
const endorsementSchema = z
  .object({
    service: z.string(),
    status: z.string(),
    hosted_kyc_url: z.string().nullable().optional(),
    updated: z.string().optional(),
    errors: flexibleEndorsementFieldSchema,
    requirements_due: flexibleEndorsementFieldSchema,
    future_requirements_due: flexibleEndorsementFieldSchema,
    metadata: flexibleEndorsementFieldSchema,
  })
  .passthrough();

const customerDataSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    customer_id: z.string().optional(),
    customer_status: z.string().optional(),
    endorsement: z.array(endorsementSchema).optional(),
    // Confirmed against the Business Spend Card guide — gates card creation independently of the
    // virtual_card endorsement above; not used by the older virtual-card product, so this was
    // never modeled here before.
    can_create_vc: z.boolean().optional(),
  })
  .passthrough();

/** Free-form — a string, an array, or an object, depending on the service/provider; see flexibleEndorsementFieldSchema's doc comment. */
export type FlexibleEndorsementField = string | unknown[] | Record<string, unknown> | null;

export type FiatCustomerEndorsement = {
  /** snake_case, matching FiatVirtualAccountCurrency.endorsement — e.g. "faster_payments", "virtual_card". */
  service: string;
  status: string;
  hostedKycUrl: string | null;
  /** Yativo's own free-form display string (e.g. "Aug 21, 2026 16:52") — not parsed, shown as-is. */
  updated: string | null;
  /** Why a non-approved status is what it is, e.g. "Missing BVN" — null when nothing was given. */
  errors: FlexibleEndorsementField;
  /** What's still needed to move this forward, e.g. {"all_of": ["government_id_document"]}. */
  requirementsDue: FlexibleEndorsementField;
  futureRequirementsDue: FlexibleEndorsementField;
  metadata: FlexibleEndorsementField;
};

export const fiatCustomerSchema = z.object({
  yativoCustomerId: z.string(),
  status: z.string(),
  canCreateVc: z.boolean().optional(),
});
export type FiatCustomer = z.infer<typeof fiatCustomerSchema> & { endorsements: FiatCustomerEndorsement[] };

function normalizeServiceName(service: string): string {
  return service.trim().toLowerCase().replace(/\s+/g, "_");
}

const URL_RE = /^https?:\/\//;

// Confirmed live: `hosted_kyc_url` on GET /customer/{id}'s endorsement entries is wildly
// inconsistent — a bare URL string, a JSON-encoded array containing one URL (the provider bridge
// link comes back this way, e.g. '["https://bridge.withpersona.com/verify?..."]'), or the literal
// string "[]" once no link is pending / the service is approved. Only the bare-string and
// JSON-array-of-one-URL shapes carry a real link; everything else normalizes to null.
function normalizeHostedKycUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (URL_RE.test(url)) return url;
  try {
    const parsed: unknown = JSON.parse(url);
    if (typeof parsed === "string" && URL_RE.test(parsed)) return parsed;
    if (Array.isArray(parsed)) {
      const first = parsed.find((v): v is string => typeof v === "string" && URL_RE.test(v));
      if (first) return first;
    }
  } catch {
    // Not JSON (e.g. a malformed non-URL string) — falls through to null below.
  }
  return null;
}

function toFiatCustomer(data: z.infer<typeof customerDataSchema>): FiatCustomer {
  const id = data.customer_id ?? data.id;
  if (id === undefined) throw new Error("Yativo customer response missing id/customer_id");
  return {
    yativoCustomerId: String(id),
    status: data.customer_status ?? "active",
    canCreateVc: data.can_create_vc,
    endorsements: (data.endorsement ?? []).map((e) => ({
      service: normalizeServiceName(e.service),
      status: e.status,
      hostedKycUrl: normalizeHostedKycUrl(e.hosted_kyc_url),
      updated: e.updated ?? null,
      errors: e.errors ?? null,
      requirementsDue: e.requirements_due ?? null,
      futureRequirementsDue: e.future_requirements_due ?? null,
      metadata: e.metadata ?? null,
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
    errors: flexibleEndorsementFieldSchema,
    requirements_due: flexibleEndorsementFieldSchema,
    future_requirements_due: flexibleEndorsementFieldSchema,
    metadata: flexibleEndorsementFieldSchema,
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

// Confirmed against the live API: GET /customer (list, paginated) is a different shape from
// GET /customer/{id} above — flat customer_name/customer_email/customer_phone/customer_country
// fields, no endorsement checklist. `customer_id` is the stable UUID this codebase treats as
// yativoCustomerId everywhere else; the numeric `id` is Yativo's own internal row id and unused.
const customerListItemDataSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    customer_id: z.string(),
    customer_name: z.string().nullable().optional(),
    customer_email: z.string().nullable().optional(),
    customer_phone: z.string().nullable().optional(),
    customer_country: z.string().nullable().optional(),
    customer_type: z.string().nullable().optional(),
    customer_status: z.string().nullable().optional(),
    created_at: z.string().nullable().optional(),
    updated_at: z.string().nullable().optional(),
  })
  .passthrough();

export type FiatCustomerListItem = {
  yativoCustomerId: string;
  name: string | null;
  email: string | null;
  /** E.164, as reported by Yativo — not re-validated here. */
  phone: string | null;
  /** ISO 3166-1 alpha-3, e.g. "USA". */
  countryIso3: string | null;
  type: "individual" | "business";
  /** Yativo's free-form status string (e.g. "active") — not normalized, callers decide what counts as active. */
  status: string | null;
  createdAt: string | null;
};

function toFiatCustomerListItem(d: z.infer<typeof customerListItemDataSchema>): FiatCustomerListItem {
  return {
    yativoCustomerId: d.customer_id,
    name: d.customer_name ?? null,
    email: d.customer_email ?? null,
    phone: d.customer_phone ?? null,
    countryIso3: d.customer_country ?? null,
    type: d.customer_type === "business" ? "business" : "individual",
    status: d.customer_status ?? null,
    createdAt: d.created_at ?? null,
  };
}

export type ListCustomersInput = { page?: number; perPage?: number };
export type ListCustomersResult = { items: FiatCustomerListItem[]; total: number; page: number; perPage: number; lastPage: number };

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
          data: { customer_id: "yativo-cust-mock-001", customer_status: "active" },
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
     * Paginated listing of every customer registered on Yativo — the whole platform's history,
     * not scoped to any local account. Used by the customer import/sync (see
     * modules/customers/customerImport.service.ts) to backfill local accounts for pre-existing
     * Yativo customers; callers must page through `lastPage`/`total` themselves since Yativo
     * caps `per_page` server-side rather than returning everything in one call.
     */
    async list(input: ListCustomersInput = {}): Promise<ListCustomersResult> {
      const res = await ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: "/customer",
        method: "GET",
        query: { page: input.page, per_page: input.perPage },
        schema: yativoPaginatedEnvelope(customerListItemDataSchema),
        mockData: {
          status: "success",
          status_code: 200,
          message: "mock",
          data: [],
          pagination: { total: 0, per_page: input.perPage ?? 20, current_page: input.page ?? 1, last_page: 1 },
        },
      });
      return {
        items: res.data.map(toFiatCustomerListItem),
        total: res.pagination.total,
        page: res.pagination.currentPage ?? res.pagination.current_page ?? input.page ?? 1,
        perPage: res.pagination.perPage ?? res.pagination.per_page ?? input.perPage ?? 20,
        lastPage: res.pagination.lastPage ?? res.pagination.last_page ?? 1,
      };
    },

    /**
     * Generates a fresh hosted verification link for one endorsement service — the passive get()
     * call above does carry a usable hosted_kyc_url for some pending services, but a customer can
     * still want a new one (e.g. an expired session), and not every pending service has one set
     * yet. Returns every endorsement Yativo reports back (see regenerateResponseSchema's doc
     * comment for why), normalized the same way get()'s `endorsements` are.
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
        errors: e.errors ?? null,
        requirementsDue: e.requirements_due ?? null,
        futureRequirementsDue: e.future_requirements_due ?? null,
        metadata: e.metadata ?? null,
      }));
    },
  };
}
