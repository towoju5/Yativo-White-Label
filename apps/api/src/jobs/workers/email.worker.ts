import { Worker, type Job } from "bullmq";
import { createBullConnection } from "../connection.js";
import { EMAIL_QUEUE_NAME, type EmailJobData } from "../emailQueue.js";
import { sendMail } from "../../lib/mailer.js";
import logger from "../../lib/logger.js";

export function startEmailWorker(): Worker<EmailJobData> {
  const worker = new Worker<EmailJobData>(
    EMAIL_QUEUE_NAME,
    async (job: Job<EmailJobData>) => {
      await sendMail(job.data);
    },
    { connection: createBullConnection() },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, to: job?.data.to, err }, "email send job failed");
  });

  return worker;
}
