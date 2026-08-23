import { z } from "zod";

/**
 * Combined COIN_NETWORK tokens, not bare tickers — Yativo's crypto wallet API has no lookup
 * endpoint for this list, so it's hand-maintained to match packages/yativo-sdk/src/crypto/wallets.ts.
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
export const cryptoDepositCurrencySchema = z.enum(CRYPTO_DEPOSIT_CURRENCIES);

export const cryptoWalletSchema = z.object({
  id: z.string(),
  address: z.string(),
  currency: z.string(),
  network: z.string(),
  coinName: z.string().optional(),
  /** Free-form label, not a security boundary — every wallet for a currency shares the same underlying address regardless of this value. */
  customerId: z.string().nullable(),
  createdAt: z.string(),
});
export type CryptoWallet = z.infer<typeof cryptoWalletSchema>;

export const createCryptoWalletSchema = z.object({
  currency: cryptoDepositCurrencySchema,
  customerId: z.string().optional(),
});
export type CreateCryptoWalletInput = z.infer<typeof createCryptoWalletSchema>;

export const cryptoDepositSchema = z.object({
  id: z.string(),
  currency: z.string(),
  amount: z.string(),
  address: z.string(),
  transactionId: z.string().nullable(),
  status: z.string(),
  customerId: z.string().nullable(),
  createdAt: z.string(),
});
export type CryptoDeposit = z.infer<typeof cryptoDepositSchema>;
