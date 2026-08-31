import type { PrismaClient } from "@prisma/client";
import { yativoClient } from "./yativoClient.js";
import { smtpConfig, resetTransporter } from "./mailer.js";
import { decryptCredential } from "./credentialEncryption.js";
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
