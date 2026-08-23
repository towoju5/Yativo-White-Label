import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { YativoContext } from "../client.js";
import { yativoEnvelope, yativoPaginatedEnvelope, YativoApiError, parseYativoErrorMessage } from "../client.js";

/**
 * Every value here is a combined COIN_NETWORK token, not a bare ticker — Yativo's crypto wallet
 * API has no lookup endpoint for this list, so it's hand-maintained from the integration guide.
 * If it drifts out of date, an invalid value comes back as a create-wallet validation error naming
 * the `currency` field (see parseYativoErrorMessage's Laravel-validator handling) rather than a
 * generic failure, so a stale entry here fails loudly instead of silently.
 */
export const CRYPTO_DEPOSIT_CURRENCIES = [
  "USDC_POL",
  "USDC_SOL",
  "EURC_SOL",
  "USDG_SOL",
  "PYUSD_SOL",
  "USDC_ETH",
  "USDT_ETH",
  "DAI_ETH",
  "WETH_ETH",
  "USDC_ARB",
  "USDT_ARB",
  "ARB_ARB",
  "USDC_OP",
  "USDT_OP",
  "OP_OP",
  "USDC_BASE",
  "EURC_BASE",
  "USDC_AVAX",
  "USDT_AVAX",
  "USDC_BSC",
  "USDT_BSC",
  "BUSD_BSC",
  "USDC_XLM",
] as const;
export type CryptoDepositCurrency = (typeof CRYPTO_DEPOSIT_CURRENCIES)[number];

// Confirmed against the live API: the response carries more fields than the integration guide
// documents (is_customer, wallet_status, a nested customer object) and wallet_network is a short
// code ("SOL"), not a full name ("solana") — passthrough covers the extras, the mapped type below
// only surfaces what callers actually need.
const walletSchema = z
  .object({
    id: z.string(),
    wallet_address: z.string(),
    wallet_currency: z.string(),
    wallet_network: z.string(),
    coin_name: z.string().optional(),
    customer_id: z.string().nullable().optional(),
    created_at: z.string(),
  })
  .passthrough();

export type CryptoWallet = {
  id: string;
  address: string;
  currency: string;
  network: string;
  coinName?: string;
  /** A free-form label, NOT a security boundary — see createWallet()'s doc comment. */
  customerId: string | null;
  createdAt: string;
};

function toWallet(w: z.infer<typeof walletSchema>): CryptoWallet {
  return {
    id: w.id,
    address: w.wallet_address,
    currency: w.wallet_currency,
    network: w.wallet_network,
    coinName: w.coin_name?.trim(),
    customerId: w.customer_id ?? null,
    createdAt: w.created_at,
  };
}

const depositSchema = z
  .object({
    id: z.string(),
    currency: z.string(),
    amount: z.string(),
    address: z.string(),
    transaction_id: z.string().nullable().optional(),
    status: z.string(),
    customer_id: z.string().nullable().optional(),
    created_at: z.string(),
  })
  .passthrough();

export type CryptoDeposit = {
  id: string;
  currency: string;
  amount: string;
  address: string;
  transactionId: string | null;
  status: string;
  customerId: string | null;
  createdAt: string;
};

function toDeposit(d: z.infer<typeof depositSchema>): CryptoDeposit {
  return {
    id: d.id,
    currency: d.currency,
    amount: d.amount,
    address: d.address,
    transactionId: d.transaction_id ?? null,
    status: d.status,
    customerId: d.customer_id ?? null,
    createdAt: d.created_at,
  };
}

export type Paginated<T> = { items: T[]; page: number; pageSize: number; total: number };

function toPaginated<T>(items: T[], pagination: { total: number; current_page?: number; per_page?: number }): Paginated<T> {
  return {
    items,
    page: pagination.current_page ?? 1,
    pageSize: pagination.per_page ?? items.length,
    total: pagination.total,
  };
}

export type CreateCryptoWalletInput = {
  currency: CryptoDepositCurrency;
  /** Local label only — filters listCustomerWallets(), does not isolate the on-chain address per customer. */
  customerId?: string;
};

export function createCryptoWalletsResource(ctx: YativoContext) {
  return {
    /**
     * Idempotent: calling again with the same currency returns the existing wallet ("Wallet
     * already exists") rather than creating a duplicate, so no separate dedupe logic is needed
     * here. `customerId` does NOT provision a separate on-chain wallet — every wallet for a given
     * currency on this account resolves to the same underlying address regardless of what's
     * passed here; it's purely a label for listCustomerWallets() to filter on later. Never use it
     * as an authorization boundary.
     */
    async createWallet(input: CreateCryptoWalletInput): Promise<CryptoWallet> {
      const res = await ctx.request({
        // NOTE: despite the name, these endpoints live under the fiat host (api.yativo.com/api/v1),
        // not config.cryptoBaseUrl — confirmed live; cryptoBaseUrl (crypto.yativo.com) serves the
        // marketing site's HTML, not this API, for every path tried.
        baseUrl: ctx.config.fiatBaseUrl,
        path: "/crypto/create-wallet",
        method: "POST",
        headers: { "Idempotency-Key": randomUUID() },
        body: { currency: input.currency, customer_id: input.customerId },
        schema: yativoEnvelope(walletSchema),
        mockData: {
          status: "success",
          status_code: 200,
          message: "mock",
          data: {
            id: "wallet-mock-001",
            wallet_address: "MockAddr1111111111111111111111111111111111",
            wallet_currency: input.currency,
            wallet_network: input.currency.split("_")[1] ?? "MOCK",
            coin_name: "Mock Coin",
            customer_id: input.customerId ?? null,
            created_at: new Date().toISOString(),
          },
        },
      });
      return toWallet(res.data);
    },

    async listWallets(opts?: { page?: number; pageSize?: number }): Promise<Paginated<CryptoWallet>> {
      const res = await ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: "/crypto/get-wallets",
        method: "GET",
        query: { per_page: opts?.pageSize, page: opts?.page },
        schema: yativoPaginatedEnvelope(walletSchema),
        mockData: {
          status: "success",
          status_code: 200,
          message: "mock",
          data: [],
          pagination: { total: 0, per_page: opts?.pageSize ?? 20, current_page: opts?.page ?? 1 },
        },
      });
      return toPaginated(res.data.map(toWallet), res.pagination);
    },

    /** Wallets filtered to one customer_id label — see createWallet()'s doc comment on what that label does and doesn't guarantee. */
    async listCustomerWallets(customerId: string): Promise<CryptoWallet[]> {
      const res = await ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: `/crypto/customer/wallets/${encodeURIComponent(customerId)}`,
        method: "GET",
        schema: yativoEnvelope(z.array(walletSchema)),
        mockData: { status: "success", status_code: 200, message: "mock", data: [] },
      });
      return res.data.map(toWallet);
    },

    /**
     * No balance check happens server-side, and this is a soft delete on Yativo's side but should
     * be treated as permanent — funds sent to the address afterward can't be recovered. Also: if
     * the account has no webhook URL configured, this call can come back as an error even though
     * the wallet was actually deleted — don't treat a thrown error here as proof of failure if that
     * matters; re-check listWallets() before surfacing a failure to the user.
     */
    async deleteWallet(walletId: string): Promise<void> {
      await ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: `/crypto/delete-wallet/${walletId}`,
        method: "DELETE",
        headers: { "Idempotency-Key": randomUUID() },
        schema: z.unknown(),
        mockData: {},
      });
    },

    /** All deposits across every wallet on the account. There's no pending/confirming state — a deposit only appears once it's already been credited. */
    async listDeposits(opts?: { page?: number; pageSize?: number }): Promise<Paginated<CryptoDeposit>> {
      const res = await ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: "/crypto/deposit-histories",
        method: "GET",
        query: { per_page: opts?.pageSize, page: opts?.page },
        schema: yativoPaginatedEnvelope(depositSchema),
        mockData: {
          status: "success",
          status_code: 200,
          message: "mock",
          data: [],
          pagination: { total: 0, per_page: opts?.pageSize ?? 20, current_page: opts?.page ?? 1 },
        },
      });
      return toPaginated(res.data.map(toDeposit), res.pagination);
    },

    async getDeposit(depositId: string): Promise<CryptoDeposit> {
      const res = await ctx.request({
        baseUrl: ctx.config.fiatBaseUrl,
        path: `/crypto/deposit-history/${depositId}`,
        method: "GET",
        schema: yativoEnvelope(depositSchema),
        mockData: {
          status: "success",
          status_code: 200,
          message: "mock",
          data: {
            id: depositId,
            currency: "USDC_SOL",
            amount: "0.00",
            address: "MockAddr1111111111111111111111111111111111",
            transaction_id: null,
            status: "success",
            customer_id: null,
            created_at: new Date().toISOString(),
          },
        },
      });
      return toDeposit(res.data);
    },

    /** Deposit history scoped to one wallet address instead of the whole account. */
    // Confirmed live: unlike every other list endpoint here, this one errors instead of returning
    // an empty array when a wallet has no deposits yet — the common case for a freshly created
    // wallet. That specific "no history" response is treated as [] rather than a hard failure;
    // any other error still propagates.
    async listWalletDeposits(walletAddress: string): Promise<CryptoDeposit[]> {
      try {
        const res = await ctx.request({
          baseUrl: ctx.config.fiatBaseUrl,
          path: `/crypto/wallet/deposit/histories/${walletAddress}`,
          method: "GET",
          schema: yativoEnvelope(z.array(depositSchema)),
          mockData: { status: "success", status_code: 200, message: "mock", data: [] },
        });
        return res.data.map(toDeposit);
      } catch (err) {
        if (err instanceof YativoApiError && parseYativoErrorMessage(err.upstreamBody)?.toLowerCase().includes("no deposit history found")) {
          return [];
        }
        throw err;
      }
    },
  };
}
