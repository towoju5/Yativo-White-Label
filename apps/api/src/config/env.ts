import { fileURLToPath } from "node:url";
import { z } from "zod";

try {
  process.loadEnvFile(fileURLToPath(new URL("../../.env", import.meta.url)));
} catch {
  // No .env file (e.g. production, where env vars are injected by the platform) — ignore.
}

// z.coerce.boolean() is a trap for env vars: it coerces via JS's `Boolean(str)`, so the string
// "false" (non-empty) comes out `true` — meaning an explicit `SOME_FLAG=false` in a .env file
// would silently enable the flag it was meant to disable. Safety-critical flags here (DEMO_*)
// rely on "false" actually meaning false, so every boolean env var uses this instead.
const zEnvBoolean = (defaultValue: boolean) =>
  z.preprocess((val) => {
    if (typeof val !== "string") return val;
    if (val === "true" || val === "1") return true;
    if (val === "false" || val === "0" || val === "") return false;
    return val;
  }, z.boolean().default(defaultValue));

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
  // Left unset, this resolves to "smtp" when SMTP_HOST is set and "sendmail" otherwise (see
  // `env` below), so setting just the SMTP_* vars is enough — no silent fallback to sendmail.
  EMAIL_MODE: z.enum(["sendmail", "smtp"]).optional(),
  SENDMAIL_PATH: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: zEnvBoolean(false),
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

  // Temporary demo-environment system (see modules/demo/). Off by default — when false, demo
  // routes/middleware/cron must not even register (checked at registration time, not just
  // returning 404), so an unconfigured deployment is completely unaffected.
  DEMO_ENABLED: zEnvBoolean(false),
  DEMO_DURATION_HOURS: z.coerce.number().positive().default(6),
  // Public base URL the one-time demo link is built from, e.g. https://demo.example.com. Falls
  // back to APP_BASE_URL below (parsedEnv not available yet here, resolved after parse).
  DEMO_BASE_URL: z.string().url().optional(),
  DEMO_DATABASE_PREFIX: z.string().min(1).default("demo_"),
  DEMO_STORAGE_PREFIX: z.string().min(1).default("demo/"),
  // Public self-service demo landing page (GET /demo, "Generate a demo" button — see
  // modules/demo/). Independent of DEMO_ENABLED being on: DEMO_ENABLED gates the whole demo
  // system, this additionally gates whether a completely unauthenticated visitor can mint their
  // own demo session (vs. staff-only creation via POST /admin/demo-sessions). Off by default.
  DEMO_PUBLIC_SIGNUP_ENABLED: zEnvBoolean(false),
});

const parsedEnv = envSchema.parse(process.env);

export const env = {
  ...parsedEnv,
  STATEMENT_VERIFY_SECRET: parsedEnv.STATEMENT_VERIFY_SECRET ?? parsedEnv.CREDENTIAL_ENCRYPTION_KEY,
  DEMO_BASE_URL: parsedEnv.DEMO_BASE_URL ?? parsedEnv.APP_BASE_URL,
  EMAIL_MODE: parsedEnv.EMAIL_MODE ?? (parsedEnv.SMTP_HOST ? "smtp" : "sendmail"),
};
export type Env = typeof env;
