import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../../config/env.js";
import { AppError } from "../errors.js";
import { EXTENSION_BY_MIME, LOCAL_STORAGE_KEY_PATTERN } from "./localStorageConstants.js";
import type { StorageProvider, UploadMeta, UploadResult } from "./StorageProvider.js";

/** Outside apps/api/src — never inside anything @fastify/static or similar could ever be pointed at. */
const DEFAULT_ROOT_DIR = fileURLToPath(new URL("../../../storage-uploads", import.meta.url));
export const LOCAL_STORAGE_ROOT_DIR = env.STORAGE_LOCAL_DIR || DEFAULT_ROOT_DIR;

/**
 * Stores files on the API server's own disk, under a fixed root directory that is never mounted
 * as a static/served directory. The storage key is always server-generated
 * (`randomUUID() + an allowlisted extension derived from the validated mimetype`) — the client's
 * original filename is never used for the path and never trusted for content type. Combined with
 * localAssets.routes.ts (which re-validates the key and reads exactly one resolved file, with no
 * directory-listing plugin involved anywhere in the path), this is what keeps the backend immune
 * to path traversal and to serving anything other than the allowlisted image types.
 */
export class LocalStorageProvider implements StorageProvider {
  async upload(buffer: Buffer, meta: UploadMeta): Promise<UploadResult> {
    const ext = EXTENSION_BY_MIME[meta.mimetype];
    if (!ext) throw new AppError(`Unsupported image type for local storage: ${meta.mimetype}`, 400, "UNSUPPORTED_FILE_TYPE");
    const key = `${randomUUID()}.${ext}`;
    await mkdir(LOCAL_STORAGE_ROOT_DIR, { recursive: true });
    await writeFile(path.join(LOCAL_STORAGE_ROOT_DIR, key), buffer);
    return { url: this.getUrl(key), key };
  }

  async delete(key: string): Promise<void> {
    if (!LOCAL_STORAGE_KEY_PATTERN.test(key)) return;
    await unlink(path.join(LOCAL_STORAGE_ROOT_DIR, key)).catch(() => {});
  }

  getUrl(key: string): string {
    return `${env.APP_BASE_URL}/assets/local/${key}`;
  }
}
