import { Queue, Worker } from "bullmq";
import type { PrismaClient } from "@prisma/client";
import { createBullConnection } from "./connection.js";
import { runReconciliation } from "../modules/reconciliation/reconciliation.service.js";
import { yativoClient } from "../lib/yativoClient.js";
import logger from "../lib/logger.js";

export const RECONCILIATION_QUEUE_NAME = "reconciliation-daily";

/**
 * Schedules a daily repeatable reconciliation job and starts the worker that
 * runs it. `jobId` is stable so re-registering the repeat option on every
 * process restart doesn't accumulate duplicate schedules.
 */
export async function startReconciliationScheduler(prisma: PrismaClient): Promise<{ queue: Queue; worker: Worker }> {
  const queue = new Queue(RECONCILIATION_QUEUE_NAME, { connection: createBullConnection() });
  const worker = new Worker(
    RECONCILIATION_QUEUE_NAME,
    async () => {
      const reports = await runReconciliation(prisma, yativoClient);
      logger.info({ reportCount: reports.length }, "daily reconciliation run complete");
    },
    { connection: createBullConnection() },
  );
  worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err }, "reconciliation job failed"));

  await queue.add(
    "daily-reconciliation",
    {},
    { repeat: { pattern: "0 3 * * *" }, jobId: "daily-reconciliation" }, // 03:00 every day
  );

  return { queue, worker };
}
