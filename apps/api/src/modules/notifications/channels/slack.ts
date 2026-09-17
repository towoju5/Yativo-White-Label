import { notificationChannelConfig } from "../../../lib/notificationChannelConfig.js";
import logger from "../../../lib/logger.js";

export type ChannelSendResult = { ok: true } | { ok: false; error: string };

/** Posts one message to a Slack incoming webhook — shared by the fire-and-forget ops-alert path and the admin "test channel" action, which is the only caller that reads the return value. */
export async function postSlackMessage(webhookUrl: string, text: string): Promise<ChannelSendResult> {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      return { ok: false, error: responseText || `Slack responded with ${response.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't reach Slack" };
  }
}

/** Ops alerting only (webhook failures, failed payouts, pending KYC review) — not a per-customer channel. See opsAlert.ts. */
export async function sendSlackAlert(text: string): Promise<void> {
  const { enabled, webhookUrl } = notificationChannelConfig.slack;
  if (!enabled || !webhookUrl) return;

  const result = await postSlackMessage(webhookUrl, text);
  if (!result.ok) {
    logger.error({ error: result.error }, "Slack ops alert send failed");
  }
}
