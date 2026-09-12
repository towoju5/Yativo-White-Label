import { notificationChannelConfig } from "../../../../../lib/notificationChannelConfig.js";
import logger from "../../../../../lib/logger.js";
import type { ChannelMessage } from "../../types.js";

/** Meta's official WhatsApp Cloud API — direct integration, no third-party BSP required. https://developers.facebook.com/docs/whatsapp/cloud-api */
export async function sendViaMetaCloudApi(toPhone: string, message: ChannelMessage): Promise<void> {
  const { metaPhoneNumberId, metaAccessToken } = notificationChannelConfig.whatsapp;
  if (!metaPhoneNumberId || !metaAccessToken) return;

  const response = await fetch(`https://graph.facebook.com/v20.0/${metaPhoneNumberId}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${metaAccessToken}`, "content-type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toPhone,
      type: "text",
      text: { body: `${message.title}\n${message.body}` },
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    logger.error({ status: response.status, body: text, toPhone }, "WhatsApp (Meta Cloud API) send failed");
  }
}
