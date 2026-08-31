import { Queue } from "bullmq";
import { createBullConnection } from "./connection.js";

export const PAYOUT_POLL_QUEUE_NAME = "payout-status-poll";

/** Per-payout live-status poll, used as a fallback safety net alongside the `payout.completed`/`payout.failed` webhook. */
export type PayoutPollJobData = { payoutId: string; attempt: number };

export const MAX_POLL_ATTEMPTS = 15;
const BASE_DELAY_MIN_MS = 10 * 60 * 1000;
const BASE_DELAY_MAX_MS = 20 * 60 * 1000;
/** Exponential backoff multiplier is capped at 2^4 (16x the base delay) so later retries don't grow unbounded. */
const MAX_BACKOFF_EXPONENT = 4;

/**
 * Delay before the given attempt number (1-indexed): a random 10-20 minute base,
 * multiplied by 2^(attempt-1) and capped at 2^4 — so attempt 1 fires in 10-20 min,
 * attempt 2 in 20-40 min, attempt 3 in 40-80 min, and attempt 5+ holds at 16x base.
 */
export function computePollDelayMs(attempt: number): number {
  const base = BASE_DELAY_MIN_MS + Math.random() * (BASE_DELAY_MAX_MS - BASE_DELAY_MIN_MS);
  const multiplier = 2 ** Math.min(attempt - 1, MAX_BACKOFF_EXPONENT);
  return Math.round(base * multiplier);
}

let queue: Queue<PayoutPollJobData> | null = null;

/** Lazily-created singleton so every caller in this process shares one queue/connection. */
export function getPayoutPollQueue(): Queue<PayoutPollJobData> {
  if (!queue) queue = new Queue<PayoutPollJobData>(PAYOUT_POLL_QUEUE_NAME, { connection: createBullConnection() });
  return queue;
}

/** Schedules the next status-check attempt for a payout. `attempt` is 1-indexed and capped by MAX_POLL_ATTEMPTS. */
export async function enqueuePayoutStatusPoll(payoutId: string, attempt: number): Promise<void> {
  await getPayoutPollQueue().add(
    "poll-payout-status",
    { payoutId, attempt },
    {
      delay: computePollDelayMs(attempt),
      // Stable per-attempt id: re-enqueuing the same payout/attempt pair (e.g. a duplicate call after
      // a crash) is a no-op instead of scheduling a second poll.
      jobId: `payout-poll:${payoutId}:${attempt}`,
      removeOnComplete: 500,
      removeOnFail: 1000,
    },
  );
}
