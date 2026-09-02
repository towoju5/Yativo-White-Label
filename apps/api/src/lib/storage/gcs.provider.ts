import { randomUUID } from "node:crypto";
import type { Storage as StorageType } from "@google-cloud/storage";
import type { GcsStorageConfig } from "@white-label/shared-types";
import { AppError } from "../errors.js";
import type { StorageProvider, UploadMeta, UploadResult } from "./StorageProvider.js";

function fileExtension(filename: string): string {
  return filename.includes(".") ? filename.split(".").pop()!.toLowerCase() : "bin";
}

/**
 * Google Cloud Storage isn't S3-compatible — its own SDK and service-account credential shape.
 * `@google-cloud/storage` is loaded lazily (dynamic import), not at module top-level — see
 * s3.provider.ts's doc comment for why: this file sits on the app-boot import path regardless of
 * which storage provider is actually active, so a static import would crash the whole app at
 * startup on any deploy that hasn't reinstalled dependencies for this optional SDK.
 */
export class GcsStorageProvider implements StorageProvider {
  private storagePromise: Promise<StorageType> | null = null;

  constructor(private config: GcsStorageConfig) {
    if (!config.projectId || !config.bucket || !config.clientEmail || !config.privateKey) {
      throw new AppError("Google Cloud Storage is not fully configured — set it up in Admin > Settings > Storage.", 503, "STORAGE_NOT_CONFIGURED");
    }
  }

  private async getStorage(): Promise<StorageType> {
    if (!this.storagePromise) {
      this.storagePromise = import("@google-cloud/storage").then(
        ({ Storage }) =>
          new Storage({
            projectId: this.config.projectId,
            // Service-account JSON keys carry the private key with literal "\n" sequences once
            // pasted into a single-line admin form field — restore real newlines before use.
            credentials: { client_email: this.config.clientEmail, private_key: this.config.privateKey.replace(/\\n/g, "\n") },
          }),
      );
    }
    return this.storagePromise;
  }

  async upload(buffer: Buffer, meta: UploadMeta): Promise<UploadResult> {
    const storage = await this.getStorage();
    const key = `${meta.folder ? `${meta.folder}/` : ""}${randomUUID()}.${fileExtension(meta.filename)}`;
    await storage.bucket(this.config.bucket).file(key).save(buffer, { contentType: meta.mimetype, resumable: false });
    return { url: this.getUrl(key), key };
  }

  async delete(key: string): Promise<void> {
    const storage = await this.getStorage();
    await storage.bucket(this.config.bucket).file(key).delete({ ignoreNotFound: true });
  }

  getUrl(key: string): string {
    if (this.config.publicBaseUrl) return `${this.config.publicBaseUrl.replace(/\/$/, "")}/${key}`;
    return `https://storage.googleapis.com/${this.config.bucket}/${key}`;
  }
}
