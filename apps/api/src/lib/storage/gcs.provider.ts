import { randomUUID } from "node:crypto";
import { Storage } from "@google-cloud/storage";
import type { GcsStorageConfig } from "@white-label/shared-types";
import { AppError } from "../errors.js";
import type { StorageProvider, UploadMeta, UploadResult } from "./StorageProvider.js";

function fileExtension(filename: string): string {
  return filename.includes(".") ? filename.split(".").pop()!.toLowerCase() : "bin";
}

/** Google Cloud Storage isn't S3-compatible — its own SDK and service-account credential shape. */
export class GcsStorageProvider implements StorageProvider {
  private storage: Storage;

  constructor(private config: GcsStorageConfig) {
    if (!config.projectId || !config.bucket || !config.clientEmail || !config.privateKey) {
      throw new AppError("Google Cloud Storage is not fully configured — set it up in Admin > Settings > Storage.", 503, "STORAGE_NOT_CONFIGURED");
    }
    this.storage = new Storage({
      projectId: config.projectId,
      // Service-account JSON keys carry the private key with literal "\n" sequences once pasted
      // into a single-line admin form field — restore real newlines before handing it to the SDK.
      credentials: { client_email: config.clientEmail, private_key: config.privateKey.replace(/\\n/g, "\n") },
    });
  }

  async upload(buffer: Buffer, meta: UploadMeta): Promise<UploadResult> {
    const key = `${meta.folder ? `${meta.folder}/` : ""}${randomUUID()}.${fileExtension(meta.filename)}`;
    await this.storage.bucket(this.config.bucket).file(key).save(buffer, { contentType: meta.mimetype, resumable: false });
    return { url: this.getUrl(key), key };
  }

  async delete(key: string): Promise<void> {
    await this.storage.bucket(this.config.bucket).file(key).delete({ ignoreNotFound: true });
  }

  getUrl(key: string): string {
    if (this.config.publicBaseUrl) return `${this.config.publicBaseUrl.replace(/\/$/, "")}/${key}`;
    return `https://storage.googleapis.com/${this.config.bucket}/${key}`;
  }
}
