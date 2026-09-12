import type { PrismaClient } from "@prisma/client";
import webpush from "web-push";
import { decryptCredential, encryptCredential } from "./credentialEncryption.js";
import logger from "./logger.js";

const SETTINGS_KEY = "notification-channels";

export type WhatsAppProviderKind = "meta" | "twilio" | "custom_webhook";

export type NotificationChannelSettings = {
  webPush: {
    vapidPublicKey: string;
    vapidPrivateKey: string;
    /** A mailto: or https: URL, required by the Web Push protocol to identify the sender to push services. */
    vapidSubject: string;
  };
  sms: {
    enabled: boolean;
    twilioAccountSid: string;
    twilioAuthToken: string;
    twilioFromNumber: string;
  };
  whatsapp: {
    enabled: boolean;
    provider: WhatsAppProviderKind;
    metaPhoneNumberId: string;
    metaAccessToken: string;
    /** Reuses sms.twilioAccountSid/twilioAuthToken for auth — only the sender number differs (WhatsApp-enabled Twilio number). */
    twilioFromNumber: string;
    customWebhookUrl: string;
    customWebhookAuthHeader: string;
  };
  slack: {
    enabled: boolean;
    webhookUrl: string;
  };
  telegram: {
    enabled: boolean;
    botToken: string;
    chatId: string;
  };
};

function emptySettings(): NotificationChannelSettings {
  return {
    webPush: { vapidPublicKey: "", vapidPrivateKey: "", vapidSubject: "" },
    sms: { enabled: false, twilioAccountSid: "", twilioAuthToken: "", twilioFromNumber: "" },
    whatsapp: {
      enabled: false,
      provider: "meta",
      metaPhoneNumberId: "",
      metaAccessToken: "",
      twilioFromNumber: "",
      customWebhookUrl: "",
      customWebhookAuthHeader: "",
    },
    slack: { enabled: false, webhookUrl: "" },
    telegram: { enabled: false, botToken: "", chatId: "" },
  };
}

/**
 * Mutable — every channel implementation (channels/*.ts) reads this object by reference, same
 * pattern as yativoClient.config in integrationRuntimeConfig.ts, so an admin save takes effect on
 * the very next send with no restart.
 */
export const notificationChannelConfig: NotificationChannelSettings = emptySettings();

export function applyNotificationChannelSettings(settings: NotificationChannelSettings): void {
  Object.assign(notificationChannelConfig, settings);
}

/**
 * Called once at boot. Web push has no external account to configure — a VAPID keypair is
 * self-issued, so one is generated on first boot and persisted, rather than requiring an admin to
 * paste in credentials just to turn push on. Every other channel starts disabled with empty
 * credentials until an admin configures it in Settings → Notification channels.
 */
export async function loadNotificationChannelSettingsFromDb(prisma: PrismaClient): Promise<void> {
  const db = prisma as PrismaClient & { secureSetting: { findUnique: (args: { where: { key: string } }) => Promise<{ encryptedValue: string } | null> } };
  const record = await db.secureSetting.findUnique({ where: { key: SETTINGS_KEY } });

  let settings: NotificationChannelSettings;
  if (record) {
    try {
      settings = { ...emptySettings(), ...(JSON.parse(decryptCredential(record.encryptedValue)) as Partial<NotificationChannelSettings>) };
    } catch (err) {
      logger.error({ err }, "Failed to load notification-channels settings from DB at boot — falling back to defaults");
      settings = emptySettings();
    }
  } else {
    settings = emptySettings();
  }

  if (!settings.webPush.vapidPublicKey || !settings.webPush.vapidPrivateKey) {
    const generated = webpush.generateVAPIDKeys();
    settings.webPush = { vapidPublicKey: generated.publicKey, vapidPrivateKey: generated.privateKey, vapidSubject: settings.webPush.vapidSubject || "mailto:support@example.com" };
    await saveNotificationChannelSettings(prisma, settings, "system");
    logger.info("Generated a new VAPID keypair for web push — stored in notification-channels settings");
  }

  applyNotificationChannelSettings(settings);
}

export async function saveNotificationChannelSettings(prisma: PrismaClient, settings: NotificationChannelSettings, updatedById: string): Promise<void> {
  const db = prisma as PrismaClient & { secureSetting: { upsert: (args: { where: { key: string }; create: Record<string, unknown>; update: Record<string, unknown> }) => Promise<unknown> } };
  await db.secureSetting.upsert({
    where: { key: SETTINGS_KEY },
    create: { key: SETTINGS_KEY, encryptedValue: encryptCredential(JSON.stringify(settings)), updatedById },
    update: { encryptedValue: encryptCredential(JSON.stringify(settings)), updatedById },
  });
}
