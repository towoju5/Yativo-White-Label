import { Worker, type Job } from "bullmq";
import type { PrismaClient } from "@prisma/client";
import { createBullConnection } from "../connection.js";
import { PAYOUT_POLL_QUEUE_NAME, MAX_POLL_ATTEMPTS, enqueuePayoutStatusPoll, type PayoutPollJobData } from "../payoutPollQueue.js";
import { yativoClient } from "../../lib/yativoClient.js";
import { settlePayoutCompleted } from "../../modules/payouts/payouts.service.js";
import { reverseTransaction } from "../../modules/ledger/reverseTransaction.js";
import { sendNotificationEmail } from "../../modules/notifications/notifications.service.js";
import { formatMinorAmount } from "../../lib/formatMoney.js";
import logger from "../../lib/logger.js";

const SUCCESS_STATUSES = new Set(["completed", "success", "successful", "settled", "paid"]);
const FAILURE_STATUSES = new Set(["failed", "rejected", "cancelled", "canceled", "returned", "declined", "reversed", "error"]);

/**
 * Yativo's full payout status vocabulary isn't documented/confirmed anywhere in this codebase
 * (see todo.md) — only "pending" and "completed" show up in mocks. So this only acts on
 * strings we're confident mean success/failure and otherwise treats the status as still
 * in-flight and keeps polling, rather than risk misclassifying an unrecognized status.
 */
function classifyStatus(status: string): "SUCCESS" | "FAILURE" | "PENDING" {
  const normalized = status.trim().toLowerCase();
  if (SUCCESS_STATUSES.has(normalized)) return "SUCCESS";
  if (FAILURE_STATUSES.has(normalized)) return "FAILURE";
  return "PENDING";
}

/**
 * Fallback safety net for payout status: the `payout.completed`/`payout.failed` webhook is the
 * primary path, but this poll catches cases where the webhook never arrives. Each payout gets up
 * to MAX_POLL_ATTEMPTS live checks against Yativo (10-20 min apart, backing off up to 16x) — see
 * payoutPollQueue.ts for the schedule. Settlement/reversal go through the exact same idempotent
 * functions the webhook handler uses, so a webhook landing mid-poll (or vice versa) never
 * double-processes a payout.
 */
export function startPayoutPollWorker(prisma: PrismaClient): Worker<PayoutPollJobData> {
  const worker = new Worker<PayoutPollJobData>(
    PAYOUT_POLL_QUEUE_NAME,
    async (job: Job<PayoutPollJobData>) => {
      const { payoutId, attempt } = job.data;

      const payout = await prisma.payout.findUnique({ where: { id: payoutId }, include: { transaction: true } });
      if (!payout) {
        logger.warn({ payoutId }, "payout poll job referenced a payout that no longer exists");
        return;
      }
      if (!payout.yativoPayoutId) {
        logger.warn({ payoutId }, "payout poll job ran before yativoPayoutId was set — skipping");
        return;
      }
      // Already resolved (settled or reversed) — most likely the webhook beat us to it. Nothing to do.
      if (payout.transaction.status !== "PENDING") return;

      let status: string;
      try {
        const result = await yativoClient.fiat.payouts.getStatus(payout.yativoPayoutId);
        status = result.status;
      } catch (err) {
        logger.warn({ payoutId, attempt, err }, "payout status poll call failed");
        await scheduleNextOrGiveUp(payoutId, attempt);
        return;
      }

      const classification = classifyStatus(status);
      if (classification === "SUCCESS") {
        await settlePayoutCompleted(prisma, payout, { externalSource: "SYSTEM" });
        logger.info({ payoutId, attempt, status }, "payout settled via status poll");
        return;
      }
      if (classification === "FAILURE") {
        await reverseTransaction(prisma, payout.transactionId, `Yativo poll reported status "${status}"`);
        await sendNotificationEmail(prisma, "PAYOUT_FAILED", payout.customerId, {
          amount: await formatMinorAmount(prisma, payout.currencyCode, payout.amountMinor),
          currency: payout.currencyCode,
          reason: `Yativo poll reported status "${status}"`,
        });
        logger.info({ payoutId, attempt, status }, "payout reversed via status poll");
        return;
      }

      logger.debug({ payoutId, attempt, status }, "payout still in flight after poll");
      await scheduleNextOrGiveUp(payoutId, attempt);
    },
    { connection: createBullConnection() },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, payoutId: job?.data.payoutId, err }, "payout status poll job failed");
  });

  return worker;
}

async function scheduleNextOrGiveUp(payoutId: string, attempt: number): Promise<void> {
  if (attempt >= MAX_POLL_ATTEMPTS) {
    logger.warn({ payoutId, attempts: attempt }, "payout status poll exhausted all attempts, still unresolved — relying on webhook/daily reconciliation");
    return;
  }
  await enqueuePayoutStatusPoll(payoutId, attempt + 1);
}
