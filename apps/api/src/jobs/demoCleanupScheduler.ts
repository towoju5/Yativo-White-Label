import { Queue, Worker } from "bullmq";
import type { PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";
import { createBullConnection } from "./connection.js";
import { cleanupDemoSession } from "../modules/demo/demoCleanup.service.js";
import logger from "../lib/logger.js";

export const DEMO_CLEANUP_QUEUE_NAME = "demo-cleanup";

/**
 * Repeatable job (every 5 minutes) that finds ACTIVE DemoSessions past their expiresAt, flips
 * them to EXPIRED, and runs the same idempotent cleanup used by the manual revoke endpoint
 * (DELETE /admin/demo-sessions/:id) — no duplicated teardown logic between the two paths.
 * Modeled on jobs/scheduler.ts's startReconciliationScheduler: a stable `jobId` keeps
 * re-registering the repeat option on every process restart from accumulating duplicate
 * schedules. Only ever started when DEMO_ENABLED=true (see index.ts) — if this file's exports
 * are never called, no demo-related BullMQ queue/worker exists at all.
 */
export async function startDemoCleanupScheduler(prisma: PrismaClient, redis: Redis): Promise<{ queue: Queue; worker: Worker }> {
  const queue = new Queue(DEMO_CLEANUP_QUEUE_NAME, { connection: createBullConnection() });
  const worker = new Worker(
    DEMO_CLEANUP_QUEUE_NAME,
    async () => {
      const expired = await prisma.demoSession.findMany({
        where: { status: "ACTIVE", expiresAt: { lte: new Date() } },
        select: { id: true },
      });
      // Also resume any session stuck mid-cleanup from a previous crash — cleanup is idempotent.
      const stuckDestroying = await prisma.demoSession.findMany({
        where: { status: "DESTROYING" },
        select: { id: true },
      });
      const failedRetryable = await prisma.demoSession.findMany({
        where: { status: "FAILED" },
        select: { id: true },
      });

      for (const { id } of expired) {
        await prisma.demoSession.update({ where: { id }, data: { status: "EXPIRED" } }).catch(() => {});
        logger.info({ demoId: id, status: "EXPIRED" }, "demo.expired");
      }

      const toCleanup = [...expired, ...stuckDestroying, ...failedRetryable];
      for (const { id } of toCleanup) {
        try {
          await cleanupDemoSession(prisma, redis, id);
        } catch (err) {
          logger.error({ demoId: id, err }, "demo.cleanup.failed");
        }
      }

      logger.info({ processed: toCleanup.length }, "demo.cleanup.sweep_complete");
    },
    { connection: createBullConnection() },
  );
  worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err }, "demo cleanup job failed"));

  await queue.add("demo-cleanup-sweep", {}, { repeat: { every: 5 * 60 * 1000 }, jobId: "demo-cleanup-sweep" });

  return { queue, worker };
}
