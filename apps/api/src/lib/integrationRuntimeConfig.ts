import type { PrismaClient } from "@prisma/client";
import { yativoClient } from "./yativoClient.js";
import { smtpConfig, resetTransporter } from "./mailer.js";
import { decryptCredential, encryptCredential } from "./credentialEncryption.js";
import { env } from "../config/env.js";
import logger from "./logger.js";

const SETTINGS_KEY = "platform-integrations";

/** Mutable — webhooks/yativo.routes.ts reads .secret at verify time. Not part of YativoConfig, so it needs its own holder. */
export const yativoWebhookConfig = { secret: env.YATIVO_WEBHOOK_SECRET };

export type IntegrationSettings = {
  yativo: {
    mode: "mock" | "sandbox" | "live";
    fiatBaseUrl: string;
    cryptoBaseUrl: string;
    kycBaseUrl: string;
    apiKey: string;
    apiSecret: string;
    webhookSecret: string;
  };
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
    fromAddress: string;
  };
};

/**
 * Pure in-memory apply. `yativoClient.config` is mutated in place (createYativoClient's resource
 * functions all close over that same object by reference and read it per-call — see
 * packages/yativo-sdk/src/client.ts), so every existing call site picks this up on its very next
 * request with no restart. Same idea for mailer.ts's smtpConfig, plus resetTransporter() so a
 * stale (e.g. previously-unconfigured) cached transporter gets rebuilt.
 */
export function applyIntegrationSettings(settings: IntegrationSettings): void {
  Object.assign(yativoClient.config, {
    mode: settings.yativo.mode,
    fiatBaseUrl: settings.yativo.fiatBaseUrl,
    cryptoBaseUrl: settings.yativo.cryptoBaseUrl,
    kycBaseUrl: settings.yativo.kycBaseUrl,
    apiKey: settings.yativo.apiKey,
    apiSecret: settings.yativo.apiSecret,
  });
  yativoWebhookConfig.secret = settings.yativo.webhookSecret;

  Object.assign(smtpConfig, {
    host: settings.smtp.host || undefined,
    port: settings.smtp.port,
    secure: settings.smtp.secure,
    user: settings.smtp.user || undefined,
    password: settings.smtp.password || undefined,
    fromAddress: settings.smtp.fromAddress,
  });
  resetTransporter();
}

/** Called once at boot, after prismaPlugin is registered. Leaves env-sourced defaults untouched when no row has been saved yet. */
export async function loadIntegrationSettingsFromDb(prisma: PrismaClient): Promise<void> {
  const db = prisma as PrismaClient & { secureSetting: { findUnique: (args: { where: { key: string } }) => Promise<{ encryptedValue: string } | null> } };
  const record = await db.secureSetting.findUnique({ where: { key: SETTINGS_KEY } });
  if (!record) return;
  try {
    const decrypted = JSON.parse(decryptCredential(record.encryptedValue)) as IntegrationSettings;
    applyIntegrationSettings(decrypted);
  } catch (err) {
    logger.error({ err }, "Failed to load platform-integrations settings from DB at boot — keeping env-sourced defaults");
  }
}

type SecureSettingClient = PrismaClient & {
  secureSetting: {
    findUnique: (args: { where: { key: string } }) => Promise<{ encryptedValue: string } | null>;
    upsert: (args: { where: { key: string }; create: Record<string, unknown>; update: Record<string, unknown> }) => Promise<unknown>;
  };
  adminAuditLog: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> };
};

/**
 * Called whenever an inbound webhook fails signature verification but looks like Yativo's own
 * `webhook_updated` notification (sent every time the webhook URL is (re)registered or its secret
 * is rotated) — the exact situation where our configured secret has gone stale and every signed
 * delivery will otherwise fail forever until someone manually updates it.
 *
 * Deliberately does NOT trust the `secret` value the delivery itself claims — anyone who can POST
 * to this public endpoint could otherwise forge a `webhook_updated` body naming a secret of their
 * choosing and hijack signature verification entirely. Instead this calls Yativo's authenticated
 * business-webhook API (`GET /v1/business/webhook`, signed with our own apiKey/apiSecret — a
 * channel an attacker sending us a fake delivery has no access to) and only adopts whatever secret
 * Yativo's own account records actually report for our registered URL.
 *
 * Returns true if the stored secret changed (caller should re-verify the original request's
 * signature against the now-current secret before deciding whether to trust it).
 */
export async function syncWebhookSecretIfRotated(prisma: PrismaClient): Promise<boolean> {
  try {
    const registeredUrl = `${env.APP_BASE_URL}/webhooks/yativo`;
    const webhooks = await yativoClient.business.webhooks.list();
    const match = webhooks.find((w) => w.url === registeredUrl) ?? webhooks[0];
    if (!match?.secret || match.secret === yativoWebhookConfig.secret) return false;

    const db = prisma as SecureSettingClient;
    const record = await db.secureSetting.findUnique({ where: { key: SETTINGS_KEY } });
    const current: IntegrationSettings = record
      ? (JSON.parse(decryptCredential(record.encryptedValue)) as IntegrationSettings)
      : {
          yativo: {
            mode: env.YATIVO_MODE,
            fiatBaseUrl: env.YATIVO_FIAT_BASE_URL,
            cryptoBaseUrl: env.YATIVO_CRYPTO_BASE_URL,
            kycBaseUrl: env.YATIVO_KYC_BASE_URL,
            apiKey: env.YATIVO_API_KEY,
            apiSecret: env.YATIVO_API_SECRET,
            webhookSecret: env.YATIVO_WEBHOOK_SECRET,
          },
          smtp: {
            host: env.SMTP_HOST ?? "",
            port: env.SMTP_PORT,
            secure: env.SMTP_SECURE,
            user: env.SMTP_USER ?? "",
            password: env.SMTP_PASSWORD ?? "",
            fromAddress: env.EMAIL_FROM_ADDRESS,
          },
        };
    const next: IntegrationSettings = { ...current, yativo: { ...current.yativo, webhookSecret: match.secret } };

    await db.secureSetting.upsert({
      where: { key: SETTINGS_KEY },
      create: { key: SETTINGS_KEY, encryptedValue: encryptCredential(JSON.stringify(next)), updatedById: "system" },
      update: { encryptedValue: encryptCredential(JSON.stringify(next)), updatedById: "system" },
    });
    // Never logs the secret value itself, per Yativo's own guidance on webhook_updated payloads.
    await db.adminAuditLog.create({ data: { actorId: "system", action: "platform_integrations.webhook_secret_synced", target: SETTINGS_KEY } });

    applyIntegrationSettings(next);
    logger.info("Yativo webhook secret auto-synced after confirming the rotation via the business webhook API");
    return true;
  } catch (err) {
    logger.error({ err }, "Failed to auto-sync Yativo webhook secret");
    return false;
  }
}
