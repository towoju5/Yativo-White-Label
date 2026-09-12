import { notificationChannelConfig } from "../../../../../lib/notificationChannelConfig.js";
import logger from "../../../../../lib/logger.js";
import type { ChannelMessage } from "../../types.js";

/**
 * Generic escape hatch for any WhatsApp Business Solution Provider not explicitly supported
 * (360dialog, Vonage, etc.) — POSTs a small fixed JSON shape to an admin-configured URL with an
 * admin-configured auth header. The receiving side (a small serverless function, or the
 * provider's own inbound webhook relay) is responsible for translating this into that provider's
 * own API call.
 */
export async function sendViaCustomWebhook(toPhone: string, message: ChannelMessage): Promise<void> {
  const { customWebhookUrl, customWebhookAuthHeader } = notificationChannelConfig.whatsapp;
  if (!customWebhookUrl) return;

  const response = await fetch(customWebhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(customWebhookAuthHeader ? { authorization: customWebhookAuthHeader } : {}),
    },
    body: JSON.stringify({ to: toPhone, title: message.title, body: message.body }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    logger.error({ status: response.status, body: text, toPhone }, "WhatsApp (custom webhook) send failed");
  }
}
