import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { notificationChannelSettingsSchema, updateNotificationChannelSettingsSchema } from "@white-label/shared-types";
import { requireStaffAuth, requirePermission } from "../../middleware/requireStaffAuth.js";
import { notificationChannelConfig, applyNotificationChannelSettings, saveNotificationChannelSettings, type NotificationChannelSettings } from "../../lib/notificationChannelConfig.js";

function toSafeDto(s: NotificationChannelSettings) {
  return {
    webPush: { vapidPublicKey: s.webPush.vapidPublicKey, vapidSubject: s.webPush.vapidSubject },
    sms: {
      enabled: s.sms.enabled,
      twilioAccountSid: s.sms.twilioAccountSid,
      twilioAuthTokenConfigured: Boolean(s.sms.twilioAuthToken),
      twilioFromNumber: s.sms.twilioFromNumber,
    },
    whatsapp: {
      enabled: s.whatsapp.enabled,
      provider: s.whatsapp.provider,
      metaPhoneNumberId: s.whatsapp.metaPhoneNumberId,
      metaAccessTokenConfigured: Boolean(s.whatsapp.metaAccessToken),
      twilioFromNumber: s.whatsapp.twilioFromNumber,
      customWebhookUrl: s.whatsapp.customWebhookUrl,
      customWebhookAuthHeaderConfigured: Boolean(s.whatsapp.customWebhookAuthHeader),
    },
    slack: { enabled: s.slack.enabled, webhookUrlConfigured: Boolean(s.slack.webhookUrl) },
    telegram: { enabled: s.telegram.enabled, botTokenConfigured: Boolean(s.telegram.botToken), chatId: s.telegram.chatId },
  };
}

/** Admin-only channel configuration for SMS / WhatsApp / Slack / Telegram / web push. Mirrors platformIntegrations.routes.ts's mask-secrets-on-read, preserve-on-omit pattern. */
export async function notificationChannelsRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();
  const db = app.prisma as typeof app.prisma & { adminAuditLog: any };

  server.get(
    "/admin/settings/notification-channels",
    { preHandler: requireStaffAuth, schema: { response: { 200: notificationChannelSettingsSchema } } },
    async (_request, reply) => reply.send(toSafeDto(notificationChannelConfig)),
  );

  server.put(
    "/admin/settings/notification-channels",
    {
      preHandler: [requireStaffAuth, requirePermission("api_keys.manage")],
      schema: { body: updateNotificationChannelSettingsSchema, response: { 200: notificationChannelSettingsSchema } },
    },
    async (request, reply) => {
      const b = request.body;
      const next: NotificationChannelSettings = {
        webPush: { ...notificationChannelConfig.webPush, vapidSubject: b.webPush.vapidSubject },
        sms: {
          enabled: b.sms.enabled,
          twilioAccountSid: b.sms.twilioAccountSid,
          twilioAuthToken: b.sms.twilioAuthToken || notificationChannelConfig.sms.twilioAuthToken,
          twilioFromNumber: b.sms.twilioFromNumber,
        },
        whatsapp: {
          enabled: b.whatsapp.enabled,
          provider: b.whatsapp.provider,
          metaPhoneNumberId: b.whatsapp.metaPhoneNumberId,
          metaAccessToken: b.whatsapp.metaAccessToken || notificationChannelConfig.whatsapp.metaAccessToken,
          twilioFromNumber: b.whatsapp.twilioFromNumber,
          customWebhookUrl: b.whatsapp.customWebhookUrl,
          customWebhookAuthHeader: b.whatsapp.customWebhookAuthHeader || notificationChannelConfig.whatsapp.customWebhookAuthHeader,
        },
        slack: { enabled: b.slack.enabled, webhookUrl: b.slack.webhookUrl || notificationChannelConfig.slack.webhookUrl },
        telegram: {
          enabled: b.telegram.enabled,
          botToken: b.telegram.botToken || notificationChannelConfig.telegram.botToken,
          chatId: b.telegram.chatId,
        },
      };

      await saveNotificationChannelSettings(app.prisma, next, request.staffUser!.sub);
      await db.adminAuditLog.create({ data: { actorId: request.staffUser!.sub, action: "notification_channels.updated", target: "notification-channels" } });
      applyNotificationChannelSettings(next);
      return reply.send(toSafeDto(next));
    },
  );
}
