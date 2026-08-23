import { fileURLToPath } from "node:url";
import { z } from "zod";

try {
  process.loadEnvFile(fileURLToPath(new URL("../../.env", import.meta.url)));
} catch {
  // No .env file (e.g. production, where env vars are injected by the platform) — ignore.
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("30d"),

  PORTAL_JWT_ACCESS_SECRET: z.string().min(16),
  PORTAL_JWT_REFRESH_SECRET: z.string().min(16),
  PORTAL_JWT_ACCESS_TTL: z.string().default("15m"),
  PORTAL_JWT_REFRESH_TTL: z.string().default("30d"),

  YATIVO_MODE: z.enum(["mock", "sandbox", "live"]).default("mock"),
  YATIVO_FIAT_BASE_URL: z.string().url(),
  YATIVO_CRYPTO_BASE_URL: z.string().url(),
  YATIVO_KYC_BASE_URL: z.string().url().default("https://kyc.yativo.com"),
  YATIVO_API_KEY: z.string().optional().default(""),
  YATIVO_API_SECRET: z.string().optional().default(""),
  YATIVO_WEBHOOK_SECRET: z.string().min(1),

  APP_BASE_URL: z.string().url(),
  WEB_APP_URL: z.string().url(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export const env = envSchema.parse(process.env);
export type Env = typeof env;
