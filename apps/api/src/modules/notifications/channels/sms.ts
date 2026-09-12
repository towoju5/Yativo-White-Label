import { notificationChannelConfig } from "../../../lib/notificationChannelConfig.js";
import logger from "../../../lib/logger.js";
import type { ChannelMessage } from "./types.js";

/**
 * Twilio's Messages API over plain `fetch` — no SDK dependency, same lightweight approach this
 * codebase already uses for Yativo (see packages/yativo-sdk/src/client.ts). No-ops (logged, not
 * thrown) until an admin configures Twilio credentials in Settings → Notification channels, so
 * this ships safely with nothing configured.
 */
export async function sendSms(toPhone: string | null, message: ChannelMessage): Promise<void> {
  const { enabled, twilioAccountSid, twilioAuthToken, twilioFromNumber } = notificationChannelConfig.sms;
  if (!enabled || !twilioAccountSid || !twilioAuthToken || !twilioFromNumber) return;
  if (!toPhone) return;

  const body = new URLSearchParams({ To: toPhone, From: twilioFromNumber, Body: `${message.title}\n${message.body}` });
  const auth = Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString("base64");

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`, {
    method: "POST",
    headers: { authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    logger.error({ status: response.status, body: text, toPhone }, "Twilio SMS send failed");
  }
}
