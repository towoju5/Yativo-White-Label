import { randomUUID } from "node:crypto";
import type { BunnyStorageConfig } from "@white-label/shared-types";
import { AppError } from "../errors.js";
import type { StorageProvider, UploadMeta, UploadResult } from "./StorageProvider.js";

function fileExtension(filename: string): string {
  return filename.includes(".") ? filename.split(".").pop()!.toLowerCase() : "bin";
}

/** Bunny.net Storage is a plain REST/PUT API keyed by an access key — no SDK needed. */
export class BunnyStorageProvider implements StorageProvider {
  constructor(private config: BunnyStorageConfig) {
    if (!config.storageZone || !config.apiKey || !config.publicBaseUrl) {
      throw new AppError("Bunny.net storage is not fully configured — set it up in Admin > Settings > Storage.", 503, "STORAGE_NOT_CONFIGURED");
    }
  }

  private hostname(): string {
    return this.config.region ? `${this.config.region}.storage.bunnycdn.com` : "storage.bunnycdn.com";
  }

  async upload(buffer: Buffer, meta: UploadMeta): Promise<UploadResult> {
    const key = `${meta.folder ? `${meta.folder}/` : ""}${randomUUID()}.${fileExtension(meta.filename)}`;
    const res = await fetch(`https://${this.hostname()}/${this.config.storageZone}/${key}`, {
      method: "PUT",
      headers: { AccessKey: this.config.apiKey, "Content-Type": meta.mimetype },
      body: buffer,
    });
    if (!res.ok) {
      throw new AppError(`Bunny storage upload failed (${res.status}).`, 502, "STORAGE_UPLOAD_FAILED");
    }
    return { url: this.getUrl(key), key };
  }

  async delete(key: string): Promise<void> {
    await fetch(`https://${this.hostname()}/${this.config.storageZone}/${key}`, {
      method: "DELETE",
      headers: { AccessKey: this.config.apiKey },
    }).catch(() => {});
  }

  getUrl(key: string): string {
    return `${this.config.publicBaseUrl.replace(/\/$/, "")}/${key}`;
  }
}
