import { notificationChannelConfig } from "../../../../lib/notificationChannelConfig.js";
import { sendViaMetaCloudApi } from "./providers/metaCloudApi.js";
import { sendViaTwilioWhatsapp } from "./providers/twilioWhatsapp.js";
import { sendViaCustomWebhook } from "./providers/customWebhook.js";
import type { ChannelMessage } from "../types.js";

/** Routes to whichever WhatsApp provider the admin has selected — see notificationChannelConfig.ts. Switching providers is a settings change, not a code change. */
export async function sendWhatsApp(toPhone: string | null, message: ChannelMessage): Promise<void> {
  const { enabled, provider } = notificationChannelConfig.whatsapp;
  if (!enabled || !toPhone) return;

  switch (provider) {
    case "meta":
      return sendViaMetaCloudApi(toPhone, message);
    case "twilio":
      return sendViaTwilioWhatsapp(toPhone, message);
    case "custom_webhook":
      return sendViaCustomWebhook(toPhone, message);
  }
}
