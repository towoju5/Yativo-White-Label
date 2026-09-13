import { Worker, type Job } from "bullmq";
import type { PrismaClient } from "@prisma/client";
import { createBullConnection } from "../connection.js";
import { CUSTOMER_IMPORT_QUEUE_NAME, type CustomerImportJobData } from "../customerImportQueue.js";
import { runCustomerImport } from "../../modules/customers/customerImport.service.js";
import logger from "../../lib/logger.js";

/** Runs the "Import from Yativo" sync triggered from the admin customers page — see customerImport.service.ts's runCustomerImport for the actual paging/import logic. */
export function startCustomerImportWorker(prisma: PrismaClient): Worker<CustomerImportJobData> {
  const worker = new Worker<CustomerImportJobData>(
    CUSTOMER_IMPORT_QUEUE_NAME,
    async (job: Job<CustomerImportJobData>) => {
      await runCustomerImport(prisma, job.data.runId);
    },
    { connection: createBullConnection() },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, runId: job?.data.runId, err }, "customer import job failed");
  });

  return worker;
}
