import { z } from "zod";
import type { YativoContext } from "../client.js";
import { yativoEnvelope } from "../client.js";

// Yativo only issues Visa/virtual/USD cards today — there's no brand, type, or currency
// parameter on any of these calls, so none of the resource functions below take one.

// ── Step 1: activate — the one call in this whole resource that does NOT use the standard
// {status, data} envelope. Success is a bare {customer_id}, failure is a bare {error}.
const activateResponseSchema = z.object({ customer_id: z.string() }).passthrough();

// ── Step 2: create. No card number/last4 here — see getCard() for that.
const createCardDataSchema = z
  .object({
    card_id: z.union([z.string(), z.number()]),
    customer_id: z.string().optional(),
    customer_email: z.string().optional(),
    card_brand: z.string().optional(),
    card_type: z.string().optional(),
  })
  .passthrough();

export type FiatCard = {
  yativoCardId: string;
  brand: string;
  type: string;
};

function toCard(d: z.infer<typeof createCardDataSchema>): FiatCard {
  return { yativoCardId: String(d.card_id), brand: d.card_brand ?? "visa", type: d.card_type ?? "virtual" };
}

// ── Step 4: get card — returns the full PAN + CVV in plaintext. Treat FiatCardDetail as
// sensitive end to end: never log it, never persist cardNumber/cvv, only surface it to the
// frontend on an explicit reveal action. Field names below are confirmed against the live list
// endpoint (same underlying card object) — `card_status` (not `status`) and `expiry_date` in
// "MM / YYYY" form are the real ones; the guide's assumed names are kept as fallbacks.
//
// Confirmed live: the response also carries a `billing_address` object — the card program's
// sponsor-bank address (e.g. Miami, FL), not the cardholder's own address, since Yativo doesn't
// collect one at card-creation time. Still real, useful data (e.g. for AVS-checking merchants),
// so it's modeled and surfaced rather than discarded. `display_amount` /
// `display_spent_current_month` / `display_topup_current_month` are the already-decimal-USD
// figures — the bare `balance_amount` field is in an undocumented micro-unit and is deliberately
// NOT used (guessing its scale wrong would silently show a wrong balance).
const billingAddressSchema = z
  .object({
    line1: z.string().optional(),
    line2: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postal_code: z.string().optional(),
    country: z.string().optional(),
  })
  .passthrough();

const cardDetailDataSchema = z
  .object({
    card_id: z.union([z.string(), z.number()]).optional(),
    id: z.union([z.string(), z.number()]).optional(),
    card_number: z.string().optional(),
    cvv: z.string().optional(),
    cvc: z.string().optional(),
    expiry_date: z.string().optional(),
    expiry: z.string().optional(),
    expiration: z.string().optional(),
    card_status: z.string().optional(),
    status: z.string().optional(),
    isAirlinePaymentEnabled: z.boolean().optional(),
    balance: z.union([z.string(), z.number()]).optional(),
    display_amount: z.union([z.string(), z.number()]).optional(),
    card_name: z.string().optional(),
    name: z.string().optional(),
    card_brand: z.string().optional(),
    card_program: z.string().optional(),
    masked_pan: z.string().optional(),
    contactless_payment: z.boolean().optional(),
    display_spent_current_month: z.union([z.string(), z.number()]).optional(),
    display_topup_current_month: z.union([z.string(), z.number()]).optional(),
    billing_address: billingAddressSchema.optional(),
  })
  .passthrough();

export type FiatCardDetail = {
  yativoCardId: string;
  cardNumber?: string;
  cvv?: string;
  last4?: string;
  expiry?: string;
  status?: string;
  isAirlinePaymentEnabled?: boolean;
  balance?: string;
  cardholderName?: string;
  cardBrand?: string;
  cardProgram?: string;
  maskedPan?: string;
  contactlessPayment?: boolean;
  spentThisMonth?: string;
  toppedUpThisMonth?: string;
  billingAddress?: { line1?: string; line2?: string; city?: string; state?: string; postalCode?: string; country?: string };
  /** Anything the issuer returned that isn't modeled above — every field here is passed straight through from Yativo, so don't assume a fixed set. Sensitive fields (card_number/cvv/raw_data) are NOT stripped from this one, since the whole point of getCard() is to surface them — unlike list()/withdraw()/listTransactions(), which do strip. */
  raw: Record<string, unknown>;
};

function toCardDetail(d: z.infer<typeof cardDetailDataSchema>): FiatCardDetail {
  const id = d.card_id ?? d.id;
  const cardNumber = d.card_number;
  const addr = d.billing_address;
  return {
    yativoCardId: id !== undefined ? String(id) : "",
    cardNumber,
    cvv: d.cvv ?? d.cvc,
    last4: cardNumber ? cardNumber.replace(/\s/g, "").slice(-4) : undefined,
    expiry: d.expiry_date ?? d.expiry ?? d.expiration,
    status: d.card_status ?? d.status,
    isAirlinePaymentEnabled: d.isAirlinePaymentEnabled,
    balance: d.display_amount !== undefined ? String(d.display_amount) : d.balance !== undefined ? String(d.balance) : undefined,
    cardholderName: d.card_name ?? d.name,
    cardBrand: d.card_brand,
    cardProgram: d.card_program,
    maskedPan: d.masked_pan,
    contactlessPayment: d.contactless_payment,
    spentThisMonth: d.display_spent_current_month !== undefined ? String(d.display_spent_current_month) : undefined,
    toppedUpThisMonth: d.display_topup_current_month !== undefined ? String(d.display_topup_current_month) : undefined,
    billingAddress: addr
      ? { line1: addr.line1, line2: addr.line2, city: addr.city, state: addr.state, postalCode: addr.postal_code, country: addr.country }
      : undefined,
    raw: d,
  };
}

const cardListItemSchema = z
  .object({
    card_id: z.union([z.string(), z.number()]).optional(),
    id: z.union([z.string(), z.number()]).optional(),
    card_brand: z.string().optional(),
    card_type: z.string().optional(),
    card_status: z.string().optional(),
    status: z.string().optional(),
  })
  .passthrough();

export type FiatCardListItem = {
  yativoCardId: string;
  brand?: string;
  type?: string;
  status?: string;
  raw: Record<string, unknown>;
};

// Confirmed against the live API: contrary to what the integration guide says (only the
// single-card `get` endpoint returns plaintext PAN/CVV), the LIST endpoint returns them too —
// both top-level (`card_number`, `cvv`) and again inside a nested `raw_data` object. Stripped out
// here before anything reaches `raw`, so a caller that logs or displays list results — reasonably
// trusting the guide's claim that list is safe — can't accidentally leak card data.
const SENSITIVE_CARD_FIELDS = ["card_number", "cvv", "cvc", "raw_data"];

function stripSensitive(d: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(d).filter(([key]) => !SENSITIVE_CARD_FIELDS.includes(key)));
}

function toCardListItem(d: z.infer<typeof cardListItemSchema>): FiatCardListItem {
  const id = d.card_id ?? d.id;
  return { yativoCardId: id !== undefined ? String(id) : "", brand: d.card_brand, type: d.card_type, status: d.card_status ?? d.status, raw: stripSensitive(d) };
}

// Confirmed live: card transactions carry a much richer shape than just `amount` — type
// ("fee"/"funding"/...), status, fee_amount/fee_type (separate from the line's own amount),
// balance_before/after, description, cardholder_name, and both transaction_date and created_at.
const transactionSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    amount: z.union([z.string(), z.number()]),
    type: z.string().optional(),
    status: z.string().optional(),
    currency: z.string().optional(),
    reference: z.string().optional(),
    balance_before: z.union([z.string(), z.number()]).optional(),
    balance_after: z.union([z.string(), z.number()]).optional(),
    fee_amount: z.union([z.string(), z.number()]).optional(),
    fee_type: z.string().optional(),
    description: z.string().optional(),
    cardholder_name: z.string().optional(),
    transaction_date: z.string().optional(),
    created_at: z.string().optional(),
  })
  .passthrough();

/** One transaction row, already normalized to decimal USD strings. `raw` still carries anything not modeled above. */
export type FiatCardTransaction = {
  id?: string;
  amount: string;
  currency?: string;
  type?: string;
  status?: string;
  reference?: string;
  balanceBefore?: string;
  balanceAfter?: string;
  feeAmount?: string;
  feeType?: string;
  description?: string;
  cardholderName?: string;
  transactionDate?: string;
  createdAt?: string;
  raw: Record<string, unknown>;
};

export function createCardsResource(ctx: YativoContext) {
  return {
    /** Call once per customer before their first card. Idempotent-ish in practice (safe to call again), but Yativo doesn't document dedup here the way create-wallet does — don't rely on retrying this blindly the way you can there. */
    async activateCustomer(yativoCustomerId: string): Promise<{ issuerCustomerId: string }> {
      const res = await ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: "/customer/virtual/cards/activate",
        method: "POST",
        body: { customer_id: yativoCustomerId },
        schema: activateResponseSchema,
        mockData: { customer_id: yativoCustomerId },
      });
      return { issuerCustomerId: res.customer_id };
    },

    /**
     * `amount` is the initial funding in USD major units, minimum 3 — debited from the wallet
     * immediately along with a creation fee and a top-up fee. If the wallet can't cover all
     * three the whole call fails cleanly with nothing charged (Yativo's side, not ours).
     */
    async create(input: { yativoCustomerId: string; amount: number; idempotencyKey: string }): Promise<FiatCard> {
      const res = await ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: "/customer/virtual/cards/create",
        method: "POST",
        headers: { "Idempotency-Key": input.idempotencyKey },
        body: { customer_id: input.yativoCustomerId, amount: input.amount },
        schema: yativoEnvelope(createCardDataSchema),
        mockData: {
          status: "success",
          status_code: 200,
          message: "mock",
          data: { card_id: "card-mock-001", customer_id: input.yativoCustomerId, card_brand: "visa", card_type: "virtual" },
        },
      });
      return toCard(res.data);
    },

    /**
     * Full PAN + CVV in plaintext, no separate "reveal" endpoint on Yativo's side — that
     * boundary has to be enforced by callers. Only ever call this from the backend on an
     * explicit user action, and don't persist or log the result.
     */
    async getCard(cardId: string): Promise<FiatCardDetail> {
      const res = await ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: `/customer/virtual/cards/get/${cardId}`,
        method: "GET",
        schema: yativoEnvelope(cardDetailDataSchema),
        mockData: {
          status: "success",
          status_code: 200,
          message: "mock",
          data: { card_id: cardId, card_number: "4242424242424242", cvv: "123", expiry: "12/30", status: "active", balance: "0.00" },
        },
      });
      return toCardDetail(res.data);
    },

    // Confirmed live: the success response does NOT reliably include `amount` the way the guide's
    // example shows — `amount` is optional here and falls back to the requested input amount.
    async topup(input: { cardId: string; amount: number; idempotencyKey: string }): Promise<{ reference?: string; amount: string }> {
      const res = await ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: "/customer/virtual/cards/topup",
        method: "POST",
        headers: { "Idempotency-Key": input.idempotencyKey },
        body: { card_id: input.cardId, amount: input.amount },
        schema: z.object({ message: z.string().optional(), reference: z.string().optional(), amount: z.union([z.string(), z.number()]).optional() }).passthrough(),
        mockData: { message: "Card top-up successful", reference: `topup-mock-${input.idempotencyKey}`, amount: input.amount },
      });
      return { reference: res.reference, amount: res.amount !== undefined ? String(res.amount) : String(input.amount) };
    },

    /**
     * Field is `cardId` here, not `card_id` — the guide notes both keys are accepted internally
     * but validation checks `cardId`, so this is the safe one to send. A termination-style fee
     * is deducted before the net amount is credited back to the wallet; the exact net amount
     * isn't documented, so `raw` is the only reliable place to look for it until confirmed live.
     */
    async withdraw(input: { cardId: string; amount: number; idempotencyKey: string }): Promise<{ raw: Record<string, unknown> }> {
      const res = await ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: "/customer/virtual/cards/withdraw",
        method: "POST",
        headers: { "Idempotency-Key": input.idempotencyKey },
        body: { cardId: input.cardId, amount: input.amount },
        schema: z.record(z.unknown()),
        mockData: { message: "Card withdrawal successful", amount: input.amount },
      });
      // Given list's response turned out to carry PAN/CVV despite the guide saying only getCard
      // does, this response is stripped defensively too before callers (e.g. logging) touch it.
      return { raw: stripSensitive(res as Record<string, unknown>) };
    },

    /** ⚠️ Confirmed live: this endpoint's raw response also carries plaintext card_number/cvv per item (see stripSensitive) — the guide only calls that out for getCard(). Already stripped before returning. */
    async list(perPage?: number): Promise<FiatCardListItem[]> {
      const res = await ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: "/customer/virtual/cards/list",
        method: "GET",
        query: { per_page: perPage },
        schema: yativoEnvelope(z.array(cardListItemSchema)),
        mockData: { status: "success", status_code: 200, message: "mock", data: [] },
      });
      return res.data.map(toCardListItem);
    },

    /** Not paginated — returns the full history in one response. */
    async listTransactions(cardId: string): Promise<FiatCardTransaction[]> {
      const res = await ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: `/customer/virtual/cards/transactions/${cardId}`,
        method: "GET",
        schema: yativoEnvelope(z.array(transactionSchema)),
        mockData: { status: "success", status_code: 200, message: "mock", data: [] },
      });
      return res.data.map((t) => ({
        id: t.id !== undefined ? String(t.id) : undefined,
        amount: String(t.amount),
        currency: t.currency,
        type: t.type,
        status: t.status,
        reference: t.reference,
        balanceBefore: t.balance_before !== undefined ? String(t.balance_before) : undefined,
        balanceAfter: t.balance_after !== undefined ? String(t.balance_after) : undefined,
        feeAmount: t.fee_amount !== undefined ? String(t.fee_amount) : undefined,
        feeType: t.fee_type,
        description: t.description,
        cardholderName: t.cardholder_name,
        transactionDate: t.transaction_date,
        createdAt: t.created_at,
        raw: stripSensitive(t),
      }));
    },

    /**
     * ⚠️ Known server-side inconsistency: this field isn't always what actually determines the
     * freeze state at the issuer. Callers MUST re-fetch the card (getCard) afterward and confirm
     * the state actually changed rather than trusting this call's success response alone.
     */
    async setFreezeState(cardId: string, action: "freeze" | "unfreeze"): Promise<void> {
      await ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: `/customer/virtual/cards/update/${cardId}`,
        method: "PUT",
        body: { action },
        schema: z.unknown(),
        mockData: {},
      });
    },

    async setAirlinePayments(cardId: string, enabled: boolean): Promise<void> {
      await ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: `/customer/virtual/cards/enable-airlines/${cardId}`,
        method: "PUT",
        body: { isAirlinePaymentEnabled: enabled },
        schema: z.unknown(),
        mockData: {},
      });
    },

    /**
     * Not reversible — confirm with the user before calling. Any remaining balance is refunded
     * to the wallet automatically on Yativo's side; the response carries no card/status/amount
     * fields to confirm that with, so update local state optimistically rather than trying to
     * read a refunded amount back out of this call.
     */
    async terminate(cardId: string, idempotencyKey: string): Promise<void> {
      await ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: "/customer/virtual/cards/terminate",
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: { cardId },
        schema: z.unknown(),
        mockData: {},
      });
    },
  };
}
