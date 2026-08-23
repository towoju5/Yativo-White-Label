import { Redis } from "ioredis";
import { env } from "../config/env.js";

/**
 * BullMQ needs its own dedicated ioredis connection(s) with
 * `maxRetriesPerRequest: null` — the same setting the app.redis Fastify
 * plugin already uses (see plugins/redis.ts), reproduced here so job
 * queues/workers don't have to depend on a live Fastify instance to start.
 */
export function createBullConnection(): Redis {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
}
