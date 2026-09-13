import { Queue } from "bullmq";
import { createBullConnection } from "./connection.js";

export const CUSTOMER_IMPORT_QUEUE_NAME = "customer-import";

export type CustomerImportJobData = { runId: string };

let queue: Queue<CustomerImportJobData> | null = null;

/** Lazily-created singleton so every caller in this process shares one queue/connection. */
export function getCustomerImportQueue(): Queue<CustomerImportJobData> {
  if (!queue) queue = new Queue<CustomerImportJobData>(CUSTOMER_IMPORT_QUEUE_NAME, { connection: createBullConnection() });
  return queue;
}

export async function enqueueCustomerImport(runId: string): Promise<void> {
  await getCustomerImportQueue().add("run-customer-import", { runId }, { removeOnComplete: 50, removeOnFail: 200 });
}
