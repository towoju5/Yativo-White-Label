import { randomUUID } from "node:crypto";
import type { S3Client as S3ClientType } from "@aws-sdk/client-s3";
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
 *
 * `@aws-sdk/client-s3` is loaded lazily (dynamic import), not at module top-level: this file sits
 * on the import path from app.ts (via branding.routes.ts -> storageFactory.ts), which runs at
 * process boot regardless of which storage provider is actually active. A static import here
 * would mean a deploy that hasn't reinstalled dependencies for this optional SDK crashes the
 * entire app before it can start listening — not just this one provider.
 */
export class S3CompatibleStorageProvider implements StorageProvider {
  private clientPromise: Promise<S3ClientType> | null = null;

  constructor(private config: S3CompatibleStorageConfig, private providerLabel: string) {
    if (!config.bucket || !config.accessKeyId || !config.secretAccessKey) {
      throw new AppError(`${providerLabel} storage is not fully configured — set it up in Admin > Settings > Storage.`, 503, "STORAGE_NOT_CONFIGURED");
    }
  }

  private async getClient(): Promise<S3ClientType> {
    if (!this.clientPromise) {
      this.clientPromise = import("@aws-sdk/client-s3").then(
        ({ S3Client }) =>
          new S3Client({
            region: this.config.region || "auto",
            endpoint: this.config.endpoint || undefined,
            forcePathStyle: Boolean(this.config.endpoint),
            credentials: { accessKeyId: this.config.accessKeyId, secretAccessKey: this.config.secretAccessKey },
          }),
      );
    }
    return this.clientPromise;
  }

  async upload(buffer: Buffer, meta: UploadMeta): Promise<UploadResult> {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.getClient();
    const key = `${meta.folder ? `${meta.folder}/` : ""}${randomUUID()}.${fileExtension(meta.filename)}`;
    await client.send(new PutObjectCommand({ Bucket: this.config.bucket, Key: key, Body: buffer, ContentType: meta.mimetype }));
    return { url: this.getUrl(key), key };
  }

  async delete(key: string): Promise<void> {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.getClient();
    await client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }

  getUrl(key: string): string {
    if (this.config.publicBaseUrl) return `${this.config.publicBaseUrl.replace(/\/$/, "")}/${key}`;
    if (this.config.endpoint) return `${this.config.endpoint.replace(/\/$/, "")}/${this.config.bucket}/${key}`;
    return `https://${this.config.bucket}.s3.${this.config.region || "us-east-1"}.amazonaws.com/${key}`;
  }
}
