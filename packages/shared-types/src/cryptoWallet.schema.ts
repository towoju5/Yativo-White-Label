import { z } from "zod";

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
  /** Combined COIN_NETWORK token (e.g. "USDC_SOL") — validated against the live GET /portal|admin/crypto/currencies list server-side, not a fixed enum, since Yativo's supported-assets list changes independently of this app. */
  currency: z.string().min(1),
  customerId: z.string().optional(),
});
export type CreateCryptoWalletInput = z.infer<typeof createCryptoWalletSchema>;

export const cryptoNetworkSchema = z.object({
  code: z.string(),
  name: z.string(),
  supportedCurrencies: z.array(z.string()),
  currencyOptions: z.array(z.string()),
  chainIdentifier: z.string(),
  gasToken: z.string(),
  confirmationBlocks: z.number(),
});
export type CryptoNetwork = z.infer<typeof cryptoNetworkSchema>;

export const cryptoSupportedAssetsSchema = z.object({
  networks: z.array(cryptoNetworkSchema),
  allCurrencyOptions: z.array(z.string()),
});
export type CryptoSupportedAssets = z.infer<typeof cryptoSupportedAssetsSchema>;

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
