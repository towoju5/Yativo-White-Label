import { z } from "zod";
import type { YativoContext } from "../client.js";
import { yativoEnvelope, yativoPaginatedEnvelope } from "../client.js";

// Business Spend Card — a separate product from fiat/cards.ts's "virtual card" (different base
// path, one cardholder per card, business customers only). Unlike that product, this one never
// returns a raw PAN/CVV anywhere — every card object only ever carries `masked_pan` — so there's
// no sensitive-field stripping to do here.

const spendCardSchema = z
  .object({
    customer_id: z.string(),
    issuance_type: z.string().optional(),
    status: z.string().nullable().optional(),
    masked_pan: z.string().nullable().optional(),
    expiration_date: z.string().nullable().optional(),
    card_id: z.string(),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
  })
  .passthrough();

export type FiatSpendCard = {
  yativoCardId: string;
  customerId: string;
  issuanceType?: string;
  status?: string | null;
  maskedPan?: string | null;
  expirationDate?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

function toSpendCard(d: z.infer<typeof spendCardSchema>): FiatSpendCard {
  return {
    yativoCardId: d.card_id,
    customerId: d.customer_id,
    issuanceType: d.issuance_type,
    status: d.status,
    maskedPan: d.masked_pan,
    expirationDate: d.expiration_date,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  };
}

const MOCK_CARD = {
  customer_id: "cust-mock-001",
  issuance_type: "Virtual",
  status: "ACTIVE",
  masked_pan: "XXXX XXXX XXXX 6850",
  expiration_date: "2029-09-30",
  card_id: "018f3a2b-9c4d-7e1f-a2b3-c4d5e6f7a8b9",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export type ListSpendCardsInput = { customerId?: string; status?: "ACTIVE" | "SUSPEND" | "FORGET"; page?: number; perPage?: number };

export type CreateSpendCardInput = { customerId: string; cardType?: "Virtual" | "Physical"; idempotencyKey?: string };

export type SpendCardWalletActionInput = { action: "fund" | "withdraw"; customerId: string; amount: number; idempotencyKey?: string };

export type SpendCardWalletActionResult = {
  amount: string;
  description?: string;
  sourceAccountGuid?: string;
  destinationAccountGuid?: string;
  /** true when a `withdraw` left the card at (or effectively at) zero balance. */
  cardEmptied?: boolean;
  /** Only meaningful when cardEmptied is true — whether the automatic termination that follows actually succeeded. */
  cardTerminated?: boolean;
  terminationError?: string | null;
  raw: Record<string, unknown>;
};

export type SpendCardStatusAction = "activate" | "suspend" | "terminate";

export type UpdateSpendCardStatusInput = { customerId: string; cardId?: string; action: SpendCardStatusAction };

export type SetSpendCardPinInput = { customerId: string; cardId?: string; pin: string; reasonCode?: string; comment?: string };

export type SpendCardLimit = { amountLimit: number; timeUnit: string; operationName: "SPENDINGLIMIT" | "CASHLIMIT" | "LOADLIMIT" };

export type UpdateSpendCardLimitsInput = { customerId: string; cardId: string; limits: SpendCardLimit[] };

export type ListSpendCardTransactionsInput = {
  customerId: string;
  cardId: string;
  txnCurrency?: string;
  txnStatus?: "posted" | "pending" | "decline";
  txnDescription?: string;
  instrumentType?: "ACCOUNT" | "BANKDDA" | "CARD";
  requestCodes?: string;
  startDate?: string;
  endDate?: string;
  searchText?: string;
  isOnlyCardTxnsVisible?: boolean;
  sortBy?: "txnDate" | "postDate" | "updatedOn";
  sortDirection?: 1 | -1;
  page?: number;
  pageSize?: number;
};

const spendCardTransactionSchema = z
  .object({
    txnGuid: z.string().optional(),
    card_id: z.string().optional(),
    txnDate: z.string().optional(),
    txnDescription: z.string().optional(),
    txnAmount: z.union([z.string(), z.number()]).optional(),
    txnCurrency: z.string().optional(),
    txnStatus: z.string().optional(),
  })
  .passthrough();

export type FiatSpendCardTransaction = {
  txnGuid?: string;
  yativoCardId?: string;
  txnDate?: string;
  description?: string;
  amount?: string;
  currency?: string;
  status?: string;
  raw: Record<string, unknown>;
};

function toSpendCardTransaction(d: z.infer<typeof spendCardTransactionSchema>): FiatSpendCardTransaction {
  return {
    txnGuid: d.txnGuid,
    yativoCardId: d.card_id,
    txnDate: d.txnDate,
    description: d.txnDescription,
    amount: d.txnAmount !== undefined ? String(d.txnAmount) : undefined,
    currency: d.txnCurrency,
    status: d.txnStatus,
    raw: d,
  };
}

export function createSpendCardsResource(ctx: YativoContext) {
  return {
    async list(input: ListSpendCardsInput = {}): Promise<{ items: FiatSpendCard[]; total: number; page: number; perPage: number }> {
      const res = await ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: "/spend/cards",
        method: "GET",
        query: { customer_id: input.customerId, status: input.status, page: input.page, per_page: input.perPage },
        schema: yativoPaginatedEnvelope(spendCardSchema),
        mockData: {
          status: "success",
          status_code: 200,
          message: "mock",
          data: [],
          pagination: { total: 0, per_page: input.perPage ?? 10, current_page: input.page ?? 1, last_page: 1 },
        },
      });
      return {
        items: res.data.map(toSpendCard),
        total: res.pagination.total,
        page: res.pagination.currentPage ?? res.pagination.current_page ?? 1,
        perPage: res.pagination.perPage ?? res.pagination.per_page ?? 10,
      };
    },

    async create(input: CreateSpendCardInput): Promise<FiatSpendCard> {
      const res = await ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: "/spend/cards",
        method: "POST",
        headers: input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : undefined,
        body: { customer_id: input.customerId, card_type: input.cardType ?? "Virtual" },
        schema: yativoEnvelope(z.object({ card: spendCardSchema }).passthrough()),
        mockData: { status: "success", status_code: 200, message: "mock", data: { card: { ...MOCK_CARD, customer_id: input.customerId } } },
      });
      return toSpendCard(res.data.card);
    },

    /** `fund` debits the business's own USDCC wallet and moves it onto the card; `withdraw` reverses that. A `withdraw` that empties the card auto-terminates it — see cardEmptied/cardTerminated/terminationError on the result. */
    async walletAction(input: SpendCardWalletActionInput): Promise<SpendCardWalletActionResult> {
      const res = await ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: "/spend/cards/wallet",
        method: "POST",
        headers: input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : undefined,
        body: { action: input.action, customer_id: input.customerId, amount: input.amount },
        schema: yativoEnvelope(
          z
            .object({
              amount: z.union([z.string(), z.number()]),
              description: z.string().optional(),
              source: z.object({ accountGuid: z.string().optional() }).passthrough().optional(),
              destination: z.object({ accountGuid: z.string().optional() }).passthrough().optional(),
              card_emptied: z.boolean().optional(),
              card_terminated: z.boolean().optional(),
              termination_error: z.string().nullable().optional(),
            })
            .passthrough(),
        ),
        mockData: {
          status: "success",
          status_code: 200,
          message: "mock",
          data: { amount: input.amount, description: `${input.action === "fund" ? "Fund" : "Withdraw"} card wallet`, source: {}, destination: {} },
        },
      });
      return {
        amount: String(res.data.amount),
        description: res.data.description,
        sourceAccountGuid: res.data.source?.accountGuid,
        destinationAccountGuid: res.data.destination?.accountGuid,
        cardEmptied: res.data.card_emptied,
        cardTerminated: res.data.card_terminated,
        terminationError: res.data.termination_error ?? null,
        raw: res.data,
      };
    },

    async updateStatus(input: UpdateSpendCardStatusInput): Promise<{ cardId: string; status: string }> {
      const res = await ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: "/spend/cards/status",
        method: "POST",
        body: { customer_id: input.customerId, card_id: input.cardId, action: input.action },
        schema: yativoEnvelope(z.object({ card_id: z.string(), cardStatus: z.string() }).passthrough()),
        mockData: { status: "success", status_code: 200, message: "mock", data: { card_id: input.cardId ?? MOCK_CARD.card_id, cardStatus: input.action === "activate" ? "ACTIVE" : input.action === "suspend" ? "SUSPEND" : "FORGET" } },
      });
      return { cardId: res.data.card_id, status: res.data.cardStatus };
    },

    async setPin(input: SetSpendCardPinInput): Promise<void> {
      await ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: "/spend/cards/pin",
        method: "POST",
        body: { customer_id: input.customerId, card_id: input.cardId, pin: input.pin, reasonCode: input.reasonCode, comment: input.comment },
        schema: yativoEnvelope(z.record(z.unknown())),
        mockData: { status: "success", status_code: 200, message: "mock", data: { card_id: input.cardId ?? MOCK_CARD.card_id, status: "success" } },
      });
    },

    async updateLimits(input: UpdateSpendCardLimitsInput): Promise<SpendCardLimit[]> {
      const res = await ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: "/spend/cards/limits",
        method: "PUT",
        body: { customer_id: input.customerId, card_id: input.cardId, limits: input.limits },
        schema: yativoEnvelope(z.object({ card_id: z.string(), limits: z.array(z.record(z.unknown())) }).passthrough()),
        mockData: { status: "success", status_code: 200, message: "mock", data: { card_id: input.cardId, limits: input.limits } },
      });
      return res.data.limits as unknown as SpendCardLimit[];
    },

    async listTransactions(input: ListSpendCardTransactionsInput): Promise<{ items: FiatSpendCardTransaction[]; totalAmount: number }> {
      const res = await ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: "/spend/cards/transactions",
        method: "GET",
        query: {
          customer_id: input.customerId,
          card_id: input.cardId,
          txnCurrency: input.txnCurrency,
          txnStatus: input.txnStatus,
          txnDescription: input.txnDescription,
          instrumentType: input.instrumentType,
          requestCodes: input.requestCodes,
          startDate: input.startDate,
          endDate: input.endDate,
          searchText: input.searchText,
          isOnlyCardTxnsVisible: input.isOnlyCardTxnsVisible === undefined ? undefined : String(input.isOnlyCardTxnsVisible),
          sortBy: input.sortBy,
          sortDirection: input.sortDirection,
          page: input.page,
          pageSize: input.pageSize,
        },
        schema: yativoEnvelope(z.object({ results: z.array(spendCardTransactionSchema), totalAmount: z.number().optional() }).passthrough()),
        mockData: { status: "success", status_code: 200, message: "mock", data: { results: [], totalAmount: 0 } },
      });
      return { items: res.data.results.map(toSpendCardTransaction), totalAmount: res.data.totalAmount ?? 0 };
    },

    async getTransaction(txnGuid: string, customerId: string): Promise<FiatSpendCardTransaction> {
      const res = await ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: `/spend/cards/transactions/${txnGuid}`,
        method: "GET",
        query: { customer_id: customerId },
        schema: yativoEnvelope(spendCardTransactionSchema),
        mockData: { status: "success", status_code: 200, message: "mock", data: { txnGuid, txnAmount: 0 } },
      });
      return toSpendCardTransaction(res.data);
    },
  };
}
