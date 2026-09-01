import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { S3CompatibleStorageConfig } from "@white-label/shared-types";
import { AppError } from "../errors.js";
import type { StorageProvider, UploadMeta, UploadResult } from "./StorageProvider.js";

function fileExtension(filename: string): string {
  return filename.includes(".") ? filename.split(".").pop()!.toLowerCase() : "bin";
}

/**
 * Shared by S3, Cloudflare R2, DigitalOcean Spaces, and Backblaze B2 — all speak the same
 * S3-compatible API, differing only in `endpoint`/`region`. Real AWS S3 leaves `endpoint` blank;
 * every other provider requires it (its regional/account storage endpoint).
 */
export class S3CompatibleStorageProvider implements StorageProvider {
  private client: S3Client;

  constructor(private config: S3CompatibleStorageConfig, private providerLabel: string) {
    if (!config.bucket || !config.accessKeyId || !config.secretAccessKey) {
      throw new AppError(`${providerLabel} storage is not fully configured — set it up in Admin > Settings > Storage.`, 503, "STORAGE_NOT_CONFIGURED");
    }
    this.client = new S3Client({
      region: config.region || "auto",
      endpoint: config.endpoint || undefined,
      forcePathStyle: Boolean(config.endpoint),
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  async upload(buffer: Buffer, meta: UploadMeta): Promise<UploadResult> {
    const key = `${meta.folder ? `${meta.folder}/` : ""}${randomUUID()}.${fileExtension(meta.filename)}`;
    await this.client.send(new PutObjectCommand({ Bucket: this.config.bucket, Key: key, Body: buffer, ContentType: meta.mimetype }));
    return { url: this.getUrl(key), key };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }

  getUrl(key: string): string {
    if (this.config.publicBaseUrl) return `${this.config.publicBaseUrl.replace(/\/$/, "")}/${key}`;
    if (this.config.endpoint) return `${this.config.endpoint.replace(/\/$/, "")}/${this.config.bucket}/${key}`;
    return `https://${this.config.bucket}.s3.${this.config.region || "us-east-1"}.amazonaws.com/${key}`;
  }
}
