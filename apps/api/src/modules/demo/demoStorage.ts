import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { env } from "../../config/env.js";
import { LOCAL_STORAGE_ROOT_DIR } from "../../lib/storage/local.provider.js";

/**
 * Builds a demo-scoped storage key prefix, e.g. "demo/<sessionId>/". Route handlers that upload
 * on behalf of a demo request should prepend this to whatever key they'd otherwise use — same
 * resolution-point pattern as getCurrentDemoPrisma() for the database. NOTE: wiring every upload
 * call site across every storage provider (s3/gcs/bunny/local/database) to actually use this is
 * not done in this slice — see demoCleanup.service.ts's doc comment for what IS wired (local
 * provider only) and what's left as follow-up.
 */
export function demoStorageKeyPrefix(demoSessionId: string): string {
  return `${env.DEMO_STORAGE_PREFIX}${demoSessionId}/`;
}

/**
 * Best-effort deletion of everything under a demo session's local-disk storage prefix. Only
 * covers the local filesystem provider (STORAGE_LOCAL_DIR) — s3/gcs/bunny providers are not
 * wired for prefix-scoped demo storage or bulk-prefix deletion in this slice (see repo-wide
 * follow-up note). Safe to call even if nothing was ever written there.
 */
export async function deleteLocalDemoStoragePrefix(demoSessionId: string): Promise<void> {
  const dir = path.join(LOCAL_STORAGE_ROOT_DIR, env.DEMO_STORAGE_PREFIX, demoSessionId);
  await rm(dir, { recursive: true, force: true });
  // Also cover a flat-key layout (no subdirectories) by scanning for a demo-prefixed filename,
  // in case anything was ever written directly under the root with this prefix baked into the key.
  try {
    const entries = await readdir(LOCAL_STORAGE_ROOT_DIR);
    const prefix = demoStorageKeyPrefix(demoSessionId).replace(/\//g, "_");
    await Promise.all(
      entries.filter((name) => name.startsWith(prefix)).map((name) => rm(path.join(LOCAL_STORAGE_ROOT_DIR, name), { force: true })),
    );
  } catch {
    // Root dir may not exist yet — nothing to clean up.
  }
}
