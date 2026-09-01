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
  /** Root key for credentials stored encrypted in PostgreSQL. Never expose this in the admin UI. */
  CREDENTIAL_ENCRYPTION_KEY: z.string().regex(/^[a-f0-9]{64}$/i, "CREDENTIAL_ENCRYPTION_KEY must be 64 hex characters"),
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

  // Transactional email — all optional. Unset SMTP_HOST means email sending no-ops (logged, not
  // thrown), so an environment without mail configured never breaks the flows that trigger it.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM_ADDRESS: z.string().email().default("no-reply@example.com"),

  // Local-disk asset storage (see lib/storage/local.provider.ts). Deliberately an env var, not an
  // admin-editable setting — a free-text filesystem path in the admin UI would let an admin write
  // uploads anywhere on disk. Defaults to a directory inside the API app if unset.
  STORAGE_LOCAL_DIR: z.string().optional(),

  // Signs the opaque statement-verification token embedded in a statement's QR code (see
  // lib/statementVerification.ts). Deliberately separate from the JWT secrets so it can be
  // rotated independently — it's a long-lived, low-sensitivity signature, not a session credential.
  STATEMENT_VERIFY_SECRET: z.string().min(16),
});

export const env = envSchema.parse(process.env);
export type Env = typeof env;
