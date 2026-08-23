import { Queue } from "bullmq";
import { createBullConnection } from "./connection.js";

export const WEBHOOK_QUEUE_NAME = "webhook-processing";

let queue: Queue | null = null;

/** Lazily-created singleton so every caller in this process shares one queue/connection. */
export function getWebhookQueue(): Queue {
  if (!queue) queue = new Queue(WEBHOOK_QUEUE_NAME, { connection: createBullConnection() });
  return queue;
}

export async function enqueueWebhookEvent(webhookEventId: string): Promise<void> {
  await getWebhookQueue().add("process-webhook-event", { webhookEventId }, { removeOnComplete: 500, removeOnFail: 1000 });
}
