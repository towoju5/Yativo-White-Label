import { z } from "zod";

export const twoFactorStatusSchema = z.object({
  enabled: z.boolean(),
});
export type TwoFactorStatus = z.infer<typeof twoFactorStatusSchema>;

export const twoFactorSetupResultSchema = z.object({
  secret: z.string(),
  otpauthUrl: z.string(),
  qrCodeDataUrl: z.string(),
});
export type TwoFactorSetupResult = z.infer<typeof twoFactorSetupResultSchema>;

export const enableTwoFactorSchema = z.object({
  code: z.string().length(6),
});
export type EnableTwoFactorInput = z.infer<typeof enableTwoFactorSchema>;

export const enableTwoFactorResultSchema = z.object({
  backupCodes: z.array(z.string()),
});
export type EnableTwoFactorResult = z.infer<typeof enableTwoFactorResultSchema>;

export const disableTwoFactorSchema = z.object({
  password: z.string().min(1),
});
export type DisableTwoFactorInput = z.infer<typeof disableTwoFactorSchema>;
