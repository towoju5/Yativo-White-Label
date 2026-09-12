import { notificationChannelConfig } from "../../../lib/notificationChannelConfig.js";
import logger from "../../../lib/logger.js";

/** Ops alerting only (webhook failures, failed payouts, pending KYC review) — not a per-customer channel. See opsAlert.ts. */
export async function sendTelegramAlert(text: string): Promise<void> {
  const { enabled, botToken, chatId } = notificationChannelConfig.telegram;
  if (!enabled || !botToken || !chatId) return;

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    logger.error({ status: response.status, body: responseText }, "Telegram ops alert send failed");
  }
}
