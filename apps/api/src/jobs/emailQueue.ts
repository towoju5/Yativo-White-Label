import { Queue } from "bullmq";
import { createBullConnection } from "./connection.js";

export const EMAIL_QUEUE_NAME = "email-notifications";

export type EmailJobData = { to: string; subject: string; html: string };

let queue: Queue<EmailJobData> | null = null;

/** Lazily-created singleton so every caller in this process shares one queue/connection. */
export function getEmailQueue(): Queue<EmailJobData> {
  if (!queue) queue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, { connection: createBullConnection() });
  return queue;
}

export async function enqueueEmail(data: EmailJobData): Promise<void> {
  await getEmailQueue().add("send-email", data, {
    removeOnComplete: 500,
    removeOnFail: 1000,
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
  });
}
