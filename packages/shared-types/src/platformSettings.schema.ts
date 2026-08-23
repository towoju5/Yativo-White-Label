import { z } from "zod";

export const WALLET_CURRENCY_MODES = ["DEFAULT_ONLY", "SELF_SERVICE", "ALL_AUTOMATIC"] as const;
export const walletCurrencyModeSchema = z.enum(WALLET_CURRENCY_MODES);
export type WalletCurrencyMode = z.infer<typeof walletCurrencyModeSchema>;

export const KYC_REQUIRED_SERVICES = ["DEPOSIT", "VIRTUAL_ACCOUNT", "PAYOUT", "CARD", "BENEFICIARY", "CRYPTO_WALLET"] as const;
export const kycRequiredServiceSchema = z.enum(KYC_REQUIRED_SERVICES);
export type KycRequiredService = z.infer<typeof kycRequiredServiceSchema>;

export const adminCurrencySchema = z.object({
  code: z.string(),
  name: z.string(),
  symbol: z.string().nullable(),
  decimals: z.number().int(),
  logoUrl: z.string().nullable(),
  countryCode: z.string().nullable(),
  isActive: z.boolean(),
  isEnabledForCustomers: z.boolean(),
});
export type AdminCurrency = z.infer<typeof adminCurrencySchema>;

export const platformSettingsSchema = z.object({
  walletCurrencyMode: walletCurrencyModeSchema,
  defaultCurrencyCode: z.string(),
  kycRequiredServices: z.array(kycRequiredServiceSchema),
  updatedAt: z.string(),
});
export type PlatformSettings = z.infer<typeof platformSettingsSchema>;

export const updateKycRequirementsSchema = z.object({
  kycRequiredServices: z.array(kycRequiredServiceSchema),
});
export type UpdateKycRequirementsInput = z.infer<typeof updateKycRequirementsSchema>;

export const walletCurrencySettingsSchema = z.object({
  settings: platformSettingsSchema,
  currencies: z.array(adminCurrencySchema),
});
export type WalletCurrencySettings = z.infer<typeof walletCurrencySettingsSchema>;

export const updatePlatformSettingsSchema = z.object({
  walletCurrencyMode: walletCurrencyModeSchema.optional(),
  defaultCurrencyCode: z.string().length(3).optional(),
});
export type UpdatePlatformSettingsInput = z.infer<typeof updatePlatformSettingsSchema>;

export const updateCurrencyEnabledSchema = z.object({
  isEnabledForCustomers: z.boolean(),
});
export type UpdateCurrencyEnabledInput = z.infer<typeof updateCurrencyEnabledSchema>;

/** What a customer sees when deciding whether/how to add a wallet currency (GET /portal/wallets/currencies). */
export const portalWalletCurrencyOptionsSchema = z.object({
  mode: walletCurrencyModeSchema,
  addable: z.array(z.object({ code: z.string(), name: z.string(), symbol: z.string().nullable(), decimals: z.number().int() })),
});
export type PortalWalletCurrencyOptions = z.infer<typeof portalWalletCurrencyOptionsSchema>;

export const addWalletCurrencySchema = z.object({
  currencyCode: z.string().length(3),
});
export type AddWalletCurrencyInput = z.infer<typeof addWalletCurrencySchema>;
