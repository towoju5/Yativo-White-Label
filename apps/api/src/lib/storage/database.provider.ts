import type { StorageProvider, UploadMeta, UploadResult } from "./StorageProvider.js";

/**
 * Stores the file inline as a base64 data URL — the "key" and "url" are the same string, since
 * there's no external object to reference. Suited only for small images (a logo, a stamp), never
 * bulk assets: every byte lives in the owning DB column and round-trips on every read of it.
 */
export class DatabaseStorageProvider implements StorageProvider {
  async upload(buffer: Buffer, meta: UploadMeta): Promise<UploadResult> {
    const dataUrl = `data:${meta.mimetype};base64,${buffer.toString("base64")}`;
    return { url: dataUrl, key: dataUrl };
  }

  async delete(_key: string): Promise<void> {
    // Nothing external to delete — the data lives only in whatever column stored the URL.
  }

  getUrl(key: string): string {
    return key;
  }
}
