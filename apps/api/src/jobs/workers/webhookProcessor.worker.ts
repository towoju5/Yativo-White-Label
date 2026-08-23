import { Worker, type Job } from "bullmq";
import type { PrismaClient } from "@prisma/client";
import { createBullConnection } from "../connection.js";
import { WEBHOOK_QUEUE_NAME } from "../queue.js";
import { dispatchWebhookEvent } from "../../webhooks/dispatcher.js";
import logger from "../../lib/logger.js";

type WebhookJobData = { webhookEventId: string };

export function startWebhookProcessorWorker(prisma: PrismaClient): Worker<WebhookJobData> {
  const worker = new Worker<WebhookJobData>(
    WEBHOOK_QUEUE_NAME,
    async (job: Job<WebhookJobData>) => {
      const event = await prisma.webhookEvent.findUnique({ where: { id: job.data.webhookEventId } });
      if (!event) {
        logger.warn({ webhookEventId: job.data.webhookEventId }, "webhook job referenced a WebhookEvent that no longer exists");
        return;
      }
      // Idempotent guard: a replayed job (manual replay, or BullMQ retry after a crash
      // between dispatch and the status update below) is a no-op once already processed.
      if (event.processingStatus === "PROCESSED") return;

      try {
        const result = await dispatchWebhookEvent(prisma, event.eventType, event.payload as Record<string, unknown>, event.externalEventId);
        await prisma.webhookEvent.update({
          where: { id: event.id },
          data: { processingStatus: result.status, processedAt: new Date(), errorMessage: result.errorMessage ?? null },
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        await prisma.webhookEvent.update({
          where: { id: event.id },
          data: { processingStatus: "FAILED", processedAt: new Date(), errorMessage },
        });
        throw err; // rethrow so BullMQ records/retries the failure
      }
    },
    { connection: createBullConnection() },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "webhook processing job failed");
  });

  return worker;
}
