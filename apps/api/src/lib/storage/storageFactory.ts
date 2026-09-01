import { BunnyStorageProvider } from "./bunny.provider.js";
import { DatabaseStorageProvider } from "./database.provider.js";
import { GcsStorageProvider } from "./gcs.provider.js";
import { LocalStorageProvider } from "./local.provider.js";
import { S3CompatibleStorageProvider } from "./s3.provider.js";
import { storageRuntimeState } from "./storageRuntimeConfig.js";
import type { StorageProvider } from "./StorageProvider.js";

/** Picks the concrete provider from the admin-configured active setting. Constructing a
 * misconfigured external provider throws immediately (see each provider's constructor) rather
 * than failing later on the first real upload attempt. */
export function getActiveStorageProvider(): StorageProvider {
  const { settings } = storageRuntimeState;
  switch (settings.provider) {
    case "database":
      return new DatabaseStorageProvider();
    case "local":
      return new LocalStorageProvider();
    case "s3":
      return new S3CompatibleStorageProvider(settings.s3, "Amazon S3");
    case "r2":
      return new S3CompatibleStorageProvider(settings.r2, "Cloudflare R2");
    case "spaces":
      return new S3CompatibleStorageProvider(settings.spaces, "DigitalOcean Spaces");
    case "b2":
      return new S3CompatibleStorageProvider(settings.b2, "Backblaze B2");
    case "bunny":
      return new BunnyStorageProvider(settings.bunny);
    case "gcs":
      return new GcsStorageProvider(settings.gcs);
  }
}
