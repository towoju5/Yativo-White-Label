import { z } from "zod";
import type { YativoConfig } from "./config.js";

import { createWalletsResource } from "./fiat/wallets.js";
import { createCustomersResource } from "./fiat/customers.js";
import { createKycResource } from "./fiat/kyc.js";
import { createVirtualAccountsResource } from "./fiat/virtualAccounts.js";
import { createSwapsResource } from "./fiat/swaps.js";
import { createPaymentMethodsResource } from "./fiat/paymentMethods.js";
import { createPayoutsResource } from "./fiat/payouts.js";
import { createQuotesResource } from "./fiat/quotes.js";
import { createCardsResource as createFiatCardsResource } from "./fiat/cards.js";
import { createGiftCardsResource } from "./fiat/giftCards.js";
import { createBeneficiariesResource } from "./fiat/beneficiaries.js";
import { createTransactionsResource } from "./fiat/transactions.js";
import { createDepositsResource } from "./fiat/deposits.js";
import { createLocationsResource } from "./fiat/locations.js";
import { createKycReferenceResource } from "./fiat/kycReference.js";
import { createCurrenciesResource } from "./fiat/currencies.js";

import { createAccountsResource } from "./crypto/accounts.js";
import { createCryptoWalletsResource } from "./crypto/wallets.js";
import { createSendResource } from "./crypto/send.js";
import { createCryptoSwapResource } from "./crypto/swap.js";
import { createCryptoCardsResource } from "./crypto/cards.js";
import { createGatewayResource } from "./crypto/gateway.js";
import { createIbanAccountResource } from "./crypto/ibanAccount.js";
import { createForwardingRulesResource } from "./crypto/forwardingRules.js";
import { createComplianceResource } from "./crypto/compliance.js";

/**
 * Thrown whenever Yativo returns a non-2xx response — carries enough for the
 * API layer to tell "Yativo rejected this" (401/403 — usually an API-key
 * scope gap, not a customer-fixable problem) apart from "the customer's
 * input was invalid" (422 — safe to surface the upstream message for).
 */
export class YativoApiError extends Error {
  method: string;
  path: string;
  upstreamStatus: number;
  upstreamBody: string;

  constructor(method: string, path: string, upstreamStatus: number, upstreamBody: string) {
    super(`Yativo request failed: ${method} ${path} -> ${upstreamStatus} ${upstreamBody}`);
    this.name = "YativoApiError";
    this.method = method;
    this.path = path;
    this.upstreamStatus = upstreamStatus;
    this.upstreamBody = upstreamBody;
  }
}

/**
 * Every real (non-mock) Yativo response is wrapped in this envelope. Resource
 * functions pass `envelope(innerSchema)` as `schema` and unwrap `.data`
 * themselves — see fiat/payouts.ts etc. for the pattern.
 */
export const yativoEnvelope = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    status: z.string(),
    status_code: z.number(),
    message: z.string(),
    data: dataSchema,
  });

/** Same envelope, plus the `{total, per_page, current_page, last_page, next_page_url, prev_page_url}` block every paginated list endpoint returns alongside `data`. */
export const yativoPaginatedEnvelope = <T extends z.ZodType>(itemSchema: T) =>
  yativoEnvelope(z.array(itemSchema)).and(
    z.object({
      pagination: z.object({
        total: z.number(),
        perPage: z.number().optional(),
        per_page: z.number().optional(),
        currentPage: z.number().optional(),
        current_page: z.number().optional(),
        lastPage: z.number().optional(),
        last_page: z.number().optional(),
      }).passthrough(),
    }),
  );

/**
 * Best-effort extraction of the customer-facing reason out of a raw (failure) response body.
 * Confirmed against the live API, this varies by endpoint more than the docs let on — handles
 * every shape actually observed so far:
 *   - the documented `{ data: { error: "..." } }` envelope
 *   - POST /crypto/create-wallet's validation-failure shape, a raw Laravel validator object,
 *     e.g. `{ data: { currency: ["The selected currency is invalid."] } }`
 *   - POST /crypto/create-wallet's *other* failure shape (unsupported asset, not a validation
 *     error): `{ data: { status: false, message: "Asset not found!" } }` — note this `message` is
 *     nested inside `data`, one level deeper than the envelope's own top-level `message`, and is
 *     the actually-useful string; the top-level one is a generic "Request failed."
 *   - POST /customer/virtual/cards/activate skips the envelope entirely on failure too, returning
 *     a bare top-level `{ error: "..." }` (success is a bare `{ customer_id: "..." }`).
 * Falls back to the top-level `message`, then `undefined`, so callers can decide their own
 * fallback when the body isn't JSON or matches none of the above.
 */
export function parseYativoErrorMessage(rawBody: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (parsed === null || typeof parsed !== "object") return undefined;
    const top = parsed as Record<string, unknown>;
    const data = top.data;
    if (data !== null && typeof data === "object") {
      const d = data as Record<string, unknown>;
      if (typeof d.error === "string") return d.error;
      // Only trust a nested `data.message` when it's paired with an explicit failure flag —
      // otherwise this key could just as easily be an unrelated field on a genuine data payload.
      if (d.status === false && typeof d.message === "string") return d.message;

      // Laravel validator shape: every value is an array of message strings.
      const validatorMessages = Object.values(d)
        .filter((v): v is string[] => Array.isArray(v) && v.every((entry) => typeof entry === "string"))
        .flat();
      if (validatorMessages.length > 0) return validatorMessages.join(" ");
    }
    // Unenveloped failure shape (e.g. cards/activate): a bare top-level `error` string.
    if (typeof top.error === "string") return top.error;
    const message = top.message;
    return typeof message === "string" ? message : undefined;
  } catch {
    return undefined;
  }
}

/** Request options shared by every resource-level call. */
export type YativoRequestOpts<T> = {
  baseUrl: string;
  path: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  /** Extra headers merged on top of the standard content-type + API key headers (e.g. Idempotency-key). */
  headers?: Record<string, string>;
  /** Validates the (real or mock) response before it's handed back to the caller. */
  schema: z.ZodType<T>;
  /** Returned directly (after schema validation) when config.mode === 'mock' — no network call is made. */
  mockData: unknown;
};

/**
 * Shared context passed into every fiat/* and crypto/* resource function.
 * Bundles config + the authenticated request helper so resource modules
 * never touch fetch/auth directly.
 */
export type YativoContext = {
  config: YativoConfig;
  request: <T>(opts: YativoRequestOpts<T>) => Promise<T>;
};

async function performRequest<T>(config: YativoConfig, opts: YativoRequestOpts<T>): Promise<T> {
  if (config.mode === "mock") {
    return opts.schema.parse(opts.mockData);
  }

  // String concat, not `new URL(path, baseUrl)` — baseUrl carries a path
  // prefix (e.g. `.../api/v1`) that WHATWG URL resolution would drop for any
  // leading-slash path.
  const url = new URL(`${opts.baseUrl.replace(/\/$/, "")}${opts.path}`);
  if (opts.query) {
    for (const [key, value] of Object.entries(opts.query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  // FormData bodies (file uploads) go out as multipart — `fetch` sets the correct
  // `multipart/form-data; boundary=...` content-type itself, and setting it manually here would
  // omit the boundary and break parsing on the other end. JSON bodies use the usual header.
  const isFormData = opts.body instanceof FormData;
  const response = await fetch(url, {
    method: opts.method ?? "GET",
    headers: {
      ...(isFormData ? {} : { "content-type": "application/json" }),
      "X-Api-Key": config.apiKey,
      "X-Api-Secret": config.apiSecret,
      ...opts.headers,
    },
    body: opts.body === undefined ? undefined : isFormData ? (opts.body as FormData) : JSON.stringify(opts.body),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new YativoApiError(opts.method ?? "GET", opts.path, response.status, body);
  }

  const json = await response.json();
  return opts.schema.parse(json);
}

export interface YativoClient {
  config: YativoConfig;
  fiat: {
    wallets: ReturnType<typeof createWalletsResource>;
    customers: ReturnType<typeof createCustomersResource>;
    kyc: ReturnType<typeof createKycResource>;
    virtualAccounts: ReturnType<typeof createVirtualAccountsResource>;
    swaps: ReturnType<typeof createSwapsResource>;
    paymentMethods: ReturnType<typeof createPaymentMethodsResource>;
    payouts: ReturnType<typeof createPayoutsResource>;
    quotes: ReturnType<typeof createQuotesResource>;
    cards: ReturnType<typeof createFiatCardsResource>;
    giftCards: ReturnType<typeof createGiftCardsResource>;
    beneficiaries: ReturnType<typeof createBeneficiariesResource>;
    transactions: ReturnType<typeof createTransactionsResource>;
    deposits: ReturnType<typeof createDepositsResource>;
    locations: ReturnType<typeof createLocationsResource>;
    kycReference: ReturnType<typeof createKycReferenceResource>;
    currencies: ReturnType<typeof createCurrenciesResource>;
  };
  crypto: {
    accounts: ReturnType<typeof createAccountsResource>;
    wallets: ReturnType<typeof createCryptoWalletsResource>;
    send: ReturnType<typeof createSendResource>;
    swap: ReturnType<typeof createCryptoSwapResource>;
    cards: ReturnType<typeof createCryptoCardsResource>;
    gateway: ReturnType<typeof createGatewayResource>;
    ibanAccount: ReturnType<typeof createIbanAccountResource>;
    forwardingRules: ReturnType<typeof createForwardingRulesResource>;
    compliance: ReturnType<typeof createComplianceResource>;
  };
}

export function createYativoClient(config: YativoConfig): YativoClient {
  const ctx: YativoContext = {
    config,
    request: (opts) => performRequest(config, opts),
  };

  return {
    config,
    fiat: {
      wallets: createWalletsResource(ctx),
      customers: createCustomersResource(ctx),
      kyc: createKycResource(ctx),
      virtualAccounts: createVirtualAccountsResource(ctx),
      swaps: createSwapsResource(ctx),
      paymentMethods: createPaymentMethodsResource(ctx),
      payouts: createPayoutsResource(ctx),
      quotes: createQuotesResource(ctx),
      cards: createFiatCardsResource(ctx),
      giftCards: createGiftCardsResource(ctx),
      beneficiaries: createBeneficiariesResource(ctx),
      transactions: createTransactionsResource(ctx),
      deposits: createDepositsResource(ctx),
      locations: createLocationsResource(ctx),
      kycReference: createKycReferenceResource(ctx),
      currencies: createCurrenciesResource(ctx),
    },
    crypto: {
      accounts: createAccountsResource(ctx),
      wallets: createCryptoWalletsResource(ctx),
      send: createSendResource(ctx),
      swap: createCryptoSwapResource(ctx),
      cards: createCryptoCardsResource(ctx),
      gateway: createGatewayResource(ctx),
      ibanAccount: createIbanAccountResource(ctx),
      forwardingRules: createForwardingRulesResource(ctx),
      compliance: createComplianceResource(ctx),
    },
  };
}
