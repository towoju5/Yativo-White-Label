import logger from "../../../lib/logger.js";
import { sendSlackAlert } from "./slack.js";
import { sendTelegramAlert } from "./telegram.js";

/**
 * Fans an internal ops message out to every configured alert channel (Slack, Telegram) — for
 * events the platform's own team needs to know about, not the customer (webhook signature
 * failures, failed payouts, KYC submissions pending review). Never throws — an alerting failure
 * must never break the business logic that triggered it.
 */
export async function sendOpsAlert(text: string): Promise<void> {
  try {
    await Promise.all([sendSlackAlert(text), sendTelegramAlert(text)]);
  } catch (err) {
    logger.error({ err }, "Failed to send ops alert");
  }
}
