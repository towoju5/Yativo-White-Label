import { notificationChannelConfig } from "../../../../../lib/notificationChannelConfig.js";
import logger from "../../../../../lib/logger.js";
import type { ChannelMessage } from "../../types.js";

/** Twilio's WhatsApp API — same Messages endpoint and account credentials as the SMS channel, just the `whatsapp:` sender prefix and a separate (WhatsApp-enabled) from-number. https://www.twilio.com/docs/whatsapp */
export async function sendViaTwilioWhatsapp(toPhone: string, message: ChannelMessage): Promise<void> {
  const { twilioAccountSid, twilioAuthToken } = notificationChannelConfig.sms;
  const { twilioFromNumber } = notificationChannelConfig.whatsapp;
  if (!twilioAccountSid || !twilioAuthToken || !twilioFromNumber) return;

  const body = new URLSearchParams({
    To: `whatsapp:${toPhone}`,
    From: `whatsapp:${twilioFromNumber}`,
    Body: `${message.title}\n${message.body}`,
  });
  const auth = Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString("base64");

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`, {
    method: "POST",
    headers: { authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    logger.error({ status: response.status, body: text, toPhone }, "WhatsApp (Twilio) send failed");
  }
}
