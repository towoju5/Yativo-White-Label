import { Queue, Worker } from "bullmq";
import type { PrismaClient } from "@prisma/client";
import type { CurrencySyncFrequency } from "@white-label/shared-types";
import { createBullConnection } from "./connection.js";
import { syncCurrenciesFromYativo, getPlatformSettings } from "../modules/platformSettings/platformSettings.service.js";
import logger from "../lib/logger.js";

export const CURRENCY_SYNC_QUEUE_NAME = "currency-sync";
const JOB_NAME = "sync-currencies";

// 04:00 sits an hour clear of the daily reconciliation job (03:00, see scheduler.ts) so the two
// don't contend for the same Yativo rate limits; the twice-daily variant adds a 16:00 run.
const CRON_PATTERNS: Record<CurrencySyncFrequency, string> = {
  DAILY: "0 4 * * *",
  TWICE_DAILY: "0 4,16 * * *",
};

let schedulerQueue: Queue | null = null;

/**
 * Removes any existing repeat schedule for the sync job and registers one matching `frequency`.
 * Called both at startup (with whatever's currently in PlatformSettings) and whenever an admin
 * changes the setting via PATCH /admin/settings/wallet-currencies, so the live BullMQ schedule
 * always matches what's configured. A no-op before the scheduler has started (e.g. in tests that
 * only exercise the HTTP layer without booting jobs).
 */
export async function rescheduleCurrencySync(frequency: CurrencySyncFrequency): Promise<void> {
  if (!schedulerQueue) return;
  const existing = await schedulerQueue.getRepeatableJobs();
  await Promise.all(existing.filter((j) => j.name === JOB_NAME).map((j) => schedulerQueue!.removeRepeatableByKey(j.key)));
  await schedulerQueue.add(JOB_NAME, {}, { repeat: { pattern: CRON_PATTERNS[frequency] }, jobId: JOB_NAME });
}

/** Schedules the repeatable currency-sync job (cadence per PlatformSettings.currencySyncFrequency) and starts the worker that runs it. */
export async function startCurrencySyncScheduler(prisma: PrismaClient): Promise<{ queue: Queue; worker: Worker }> {
  const queue = new Queue(CURRENCY_SYNC_QUEUE_NAME, { connection: createBullConnection() });
  schedulerQueue = queue;

  const worker = new Worker(
    CURRENCY_SYNC_QUEUE_NAME,
    async () => {
      const result = await syncCurrenciesFromYativo(prisma);
      logger.info({ currencyCount: result.currencies.length }, "scheduled currency sync complete");
    },
    { connection: createBullConnection() },
  );
  worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err }, "currency sync job failed"));

  const settings = await getPlatformSettings(prisma);
  await rescheduleCurrencySync(settings.currencySyncFrequency);

  return { queue, worker };
}
