import { Worker, type Job } from "bullmq";
import { createBullConnection } from "../connection.js";
import { EMAIL_QUEUE_NAME, type EmailJobData } from "../emailQueue.js";
import { sendMail } from "../../lib/mailer.js";
import logger from "../../lib/logger.js";

export function startEmailWorker(): Worker<EmailJobData> {
  const worker = new Worker<EmailJobData>(
    EMAIL_QUEUE_NAME,
    async (job: Job<EmailJobData>) => {
      // Throwing (instead of letting the job "complete") keeps an unsent email visible in the
      // failed-jobs list and error.log rather than looking identical to a real delivery.
      const sent = await sendMail(job.data);
      if (!sent) throw new Error("Email not sent: SMTP isn't configured (set it under Settings → Integrations)");
    },
    { connection: createBullConnection() },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, to: job?.data.to, subject: job?.data.subject, attempt: job?.attemptsMade, err }, "email.failed");
  });

  return worker;
}
