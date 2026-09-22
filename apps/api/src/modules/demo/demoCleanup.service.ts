import type { PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";
import logger from "../../lib/logger.js";
import { dropDemoDatabase, assertSafeDemoDatabaseName } from "./demoDatabase.service.js";
import { deleteLocalDemoStoragePrefix } from "./demoStorage.js";

const DEMO_TOKEN_DENYLIST_PREFIX = "demo:denylist:";

export function demoRedisKeyPrefix(demoSessionId: string): string {
  return `demo:${demoSessionId}:`;
}

/** Adds this session's tokenHash to a Redis denylist so any in-flight/cached auth check fails closed immediately, without waiting for the DB status update to propagate everywhere. */
export async function denylistDemoToken(redis: Redis, tokenHash: string, ttlSeconds: number): Promise<void> {
  await redis.set(`${DEMO_TOKEN_DENYLIST_PREFIX}${tokenHash}`, "1", "EX", Math.max(ttlSeconds, 60));
}

export async function isDemoTokenDenylisted(redis: Redis, tokenHash: string): Promise<boolean> {
  const val = await redis.get(`${DEMO_TOKEN_DENYLIST_PREFIX}${tokenHash}`);
  return val !== null;
}

/** Deletes every Redis key under this demo session's prefix using non-blocking SCAN (never KEYS, which would block Redis on a large keyspace). */
async function deleteDemoRedisKeys(redis: Redis, demoSessionId: string): Promise<void> {
  const prefix = demoRedisKeyPrefix(demoSessionId);
  let cursor = "0";
  do {
    const [nextCursor, keys] = await redis.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 100);
    cursor = nextCursor;
    if (keys.length > 0) await redis.del(...keys);
  } while (cursor !== "0");
}

/**
 * Tears down one demo session: marks DESTROYING, denylists its token, deletes its Redis keys and
 * local storage prefix, drops its isolated database (with the same name-safety checks as
 * creation), then marks DESTROYED. Idempotent by design — every step is safe to re-run: denylist
 * is a Redis SET (not INCR), Redis/storage deletion of an already-empty prefix is a no-op, and
 * dropDemoDatabase uses `DROP DATABASE IF EXISTS`. A session already DESTROYED short-circuits
 * immediately. On any failure the session is marked FAILED with errorMessage (never left stuck
 * in DESTROYING silently) so cleanup can be retried.
 */
export async function cleanupDemoSession(prisma: PrismaClient, redis: Redis, demoSessionId: string): Promise<void> {
  const session = await prisma.demoSession.findUnique({ where: { id: demoSessionId } });
  if (!session) {
    logger.warn({ demoId: demoSessionId }, "demo.cleanup.session_not_found");
    return;
  }
  if (session.status === "DESTROYED") {
    logger.info({ demoId: demoSessionId, status: "DESTROYED" }, "demo.cleanup.already_done");
    return;
  }

  logger.info({ demoId: demoSessionId, status: session.status }, "demo.cleanup.started");

  try {
    // Verify this row IS the source of truth for the database name before any drop — never drop
    // based on a value that didn't come straight from this DemoSession record.
    assertSafeDemoDatabaseName(session.databaseName);

    if (session.status !== "DESTROYING") {
      await prisma.demoSession.update({ where: { id: demoSessionId }, data: { status: "DESTROYING", errorMessage: null } });
    }

    const remainingTtlSeconds = Math.max(Math.ceil((session.expiresAt.getTime() - Date.now()) / 1000), 60);
    await denylistDemoToken(redis, session.tokenHash, remainingTtlSeconds + 3600);
    await deleteDemoRedisKeys(redis, demoSessionId);
    await deleteLocalDemoStoragePrefix(demoSessionId);
    await dropDemoDatabase(session.databaseName);

    await prisma.demoSession.update({
      where: { id: demoSessionId },
      data: { status: "DESTROYED", destroyedAt: new Date(), errorMessage: null },
    });
    logger.info({ demoId: demoSessionId, status: "DESTROYED" }, "demo.cleanup.completed");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown cleanup error";
    await prisma.demoSession
      .update({ where: { id: demoSessionId }, data: { status: "FAILED", errorMessage: message } })
      .catch(() => {});
    logger.error({ demoId: demoSessionId, status: "FAILED", err }, "demo.cleanup.failed");
    throw err;
  }
}
