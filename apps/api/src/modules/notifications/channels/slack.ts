import { notificationChannelConfig } from "../../../lib/notificationChannelConfig.js";
import logger from "../../../lib/logger.js";

/** Ops alerting only (webhook failures, failed payouts, pending KYC review) — not a per-customer channel. See opsAlert.ts. */
export async function sendSlackAlert(text: string): Promise<void> {
  const { enabled, webhookUrl } = notificationChannelConfig.slack;
  if (!enabled || !webhookUrl) return;

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    logger.error({ status: response.status, body: responseText }, "Slack ops alert send failed");
  }
}
