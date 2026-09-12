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
  YATIVO_KYC_BASE_URL: z.string().url().default("https://kyc.yativo.com"),
  YATIVO_API_KEY: z.string().optional().default(""),
  YATIVO_API_SECRET: z.string().optional().default(""),
  YATIVO_WEBHOOK_SECRET: z.string().min(1),

  APP_BASE_URL: z.string().url(),
  WEB_APP_URL: z.string().url(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  // Transactional email. EMAIL_MODE picks the transport: "sendmail" (default) pipes through the
  // local sendmail-compatible binary — no credentials needed, works out of the box wherever
  // postfix/sendmail is installed; "smtp" relays via the SMTP_* settings below. Both the mode and
  // every setting here can be overridden at runtime from the admin UI (Settings → Integrations),
  // which is why they're all optional — an environment without either configured just no-ops
  // email sending (logged, not thrown) instead of breaking the flows that trigger it.
  EMAIL_MODE: z.enum(["sendmail", "smtp"]).default("sendmail"),
  SENDMAIL_PATH: z.string().optional(),
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
  // lib/statementVerification.ts). Optional so deploying this feature never requires a new env
  // var just to boot — falls back to CREDENTIAL_ENCRYPTION_KEY (already required everywhere this
  // app runs) below. Set this explicitly in production if you want it rotatable independently of
  // that key.
  STATEMENT_VERIFY_SECRET: z.string().min(16).optional(),
});

const parsedEnv = envSchema.parse(process.env);

export const env = {
  ...parsedEnv,
  STATEMENT_VERIFY_SECRET: parsedEnv.STATEMENT_VERIFY_SECRET ?? parsedEnv.CREDENTIAL_ENCRYPTION_KEY,
};
export type Env = typeof env;
