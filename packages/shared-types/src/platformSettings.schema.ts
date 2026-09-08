import { z } from "zod";

export const WALLET_CURRENCY_MODES = ["DEFAULT_ONLY", "SELF_SERVICE", "ALL_AUTOMATIC"] as const;
export const walletCurrencyModeSchema = z.enum(WALLET_CURRENCY_MODES);
export type WalletCurrencyMode = z.infer<typeof walletCurrencyModeSchema>;

export const KYC_REQUIRED_SERVICES = ["DEPOSIT", "VIRTUAL_ACCOUNT", "PAYOUT", "CARD", "BENEFICIARY", "CRYPTO_WALLET"] as const;
export const kycRequiredServiceSchema = z.enum(KYC_REQUIRED_SERVICES);
export type KycRequiredService = z.infer<typeof kycRequiredServiceSchema>;

// PER_CUSTOMER: every customer gets their own Yativo customer_id (default). POOLED: every
// customer transacts under one admin-provided Yativo customer_id — no per-customer registration
// or Yativo-side KYC.
export const YATIVO_CUSTOMER_MODES = ["PER_CUSTOMER", "POOLED"] as const;
export const yativoCustomerModeSchema = z.enum(YATIVO_CUSTOMER_MODES);
export type YativoCustomerMode = z.infer<typeof yativoCustomerModeSchema>;

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
  yativoCustomerMode: yativoCustomerModeSchema,
  pooledYativoCustomerId: z.string().nullable(),
  updatedAt: z.string(),
});
export type PlatformSettings = z.infer<typeof platformSettingsSchema>;

export const updateYativoCustomerModeSchema = z.object({
  mode: yativoCustomerModeSchema,
  pooledYativoCustomerId: z.string().min(1).optional(),
  // Explicit opt-in: also re-point every existing customer's yativoCustomerId to the pooled one,
  // not just customers who don't have one yet. Ignored when mode is PER_CUSTOMER.
  migrateExisting: z.boolean().default(false),
});
export type UpdateYativoCustomerModeInput = z.infer<typeof updateYativoCustomerModeSchema>;

export const updateYativoCustomerModeResultSchema = z.object({
  settings: platformSettingsSchema,
  migratedCount: z.number().int(),
});
export type UpdateYativoCustomerModeResult = z.infer<typeof updateYativoCustomerModeResultSchema>;

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
