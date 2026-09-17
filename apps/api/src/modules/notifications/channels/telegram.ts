import { notificationChannelConfig } from "../../../lib/notificationChannelConfig.js";
import logger from "../../../lib/logger.js";
import type { ChannelSendResult } from "./slack.js";

/** Posts one message via a Telegram bot — shared by the fire-and-forget ops-alert path and the admin "test channel" action, which is the only caller that reads the return value. */
export async function postTelegramMessage(botToken: string, chatId: string, text: string): Promise<ChannelSendResult> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      return { ok: false, error: responseText || `Telegram responded with ${response.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't reach Telegram" };
  }
}

/** Ops alerting only (webhook failures, failed payouts, pending KYC review) — not a per-customer channel. See opsAlert.ts. */
export async function sendTelegramAlert(text: string): Promise<void> {
  const { enabled, botToken, chatId } = notificationChannelConfig.telegram;
  if (!enabled || !botToken || !chatId) return;

  const result = await postTelegramMessage(botToken, chatId, text);
  if (!result.ok) {
    logger.error({ error: result.error }, "Telegram ops alert send failed");
  }
}
