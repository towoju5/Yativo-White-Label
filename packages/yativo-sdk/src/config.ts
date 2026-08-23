import { z } from "zod";

export const yativoConfigSchema = z.object({
  mode: z.enum(["mock", "sandbox", "live"]),
  fiatBaseUrl: z.string().url(),
  cryptoBaseUrl: z.string().url(),
  /** KYC/KYB submission lives on a separate host (kyc.yativo.com), not under fiatBaseUrl's /api/v1. */
  kycBaseUrl: z.string().url(),
  apiKey: z.string(),
  apiSecret: z.string(),
});
export type YativoConfig = z.infer<typeof yativoConfigSchema>;
