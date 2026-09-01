import { z } from "zod";

/**
 * The storage backends an admin can pick between for uploaded assets (e.g. the branding stamp).
 * "database" stores the file inline as a base64 data URL — fine for a small image, never for bulk
 * assets. "local" writes to disk on the API server itself (see local.provider.ts for the security
 * model). The rest are external buckets/CDNs; s3/r2/spaces/b2 share one S3-compatible client.
 */
export const STORAGE_PROVIDERS = ["database", "local", "s3", "r2", "spaces", "b2", "bunny", "gcs"] as const;
export const storageProviderIdSchema = z.enum(STORAGE_PROVIDERS);
export type StorageProviderId = z.infer<typeof storageProviderIdSchema>;

export const STORAGE_PROVIDER_LABELS: Record<StorageProviderId, string> = {
  database: "Database (base64, small images only)",
  local: "Local disk (this server)",
  s3: "Amazon S3",
  r2: "Cloudflare R2",
  spaces: "DigitalOcean Spaces",
  b2: "Backblaze B2",
  bunny: "Bunny.net Storage",
  gcs: "Google Cloud Storage",
};

/** Shared shape for every S3-compatible backend (real AWS S3, R2, Spaces, B2). All fields are
 * kept optional at the schema layer — "not yet configured" is a valid saved state — but the
 * provider itself throws a clear error if used while incomplete. */
const s3CompatibleConfigSchema = z.object({
  bucket: z.string().optional().default(""),
  region: z.string().optional().default(""),
  accessKeyId: z.string().optional().default(""),
  secretAccessKey: z.string().optional().default(""),
  // Required for r2/spaces/b2 (their S3-compatible endpoint); leave blank for real AWS S3.
  endpoint: z.string().optional().default(""),
  // Optional CDN/custom domain to serve uploaded files from instead of the raw bucket URL.
  publicBaseUrl: z.string().optional().default(""),
});
export type S3CompatibleStorageConfig = z.infer<typeof s3CompatibleConfigSchema>;

const bunnyConfigSchema = z.object({
  storageZone: z.string().optional().default(""),
  apiKey: z.string().optional().default(""),
  // Bunny's regional storage endpoints, e.g. "ny", "la", "sg", "de" — blank uses the default.
  region: z.string().optional().default(""),
  publicBaseUrl: z.string().optional().default(""),
});
export type BunnyStorageConfig = z.infer<typeof bunnyConfigSchema>;

const gcsConfigSchema = z.object({
  projectId: z.string().optional().default(""),
  bucket: z.string().optional().default(""),
  clientEmail: z.string().optional().default(""),
  privateKey: z.string().optional().default(""),
  publicBaseUrl: z.string().optional().default(""),
});
export type GcsStorageConfig = z.infer<typeof gcsConfigSchema>;

export const storageSettingsSchema = z.object({
  provider: storageProviderIdSchema,
  s3: s3CompatibleConfigSchema,
  r2: s3CompatibleConfigSchema,
  spaces: s3CompatibleConfigSchema,
  b2: s3CompatibleConfigSchema,
  bunny: bunnyConfigSchema,
  gcs: gcsConfigSchema,
});
export type StorageSettings = z.infer<typeof storageSettingsSchema>;

/** "local" needs no admin-entered config — its directory is set by ops via STORAGE_LOCAL_DIR, not
 * typed into the admin UI, since a free-text filesystem path there would be a write-path injection
 * risk. "database" needs no config at all. Every other provider starts blank until configured. */
export const DEFAULT_STORAGE_SETTINGS: StorageSettings = storageSettingsSchema.parse({
  provider: "local",
  s3: {},
  r2: {},
  spaces: {},
  b2: {},
  bunny: {},
  gcs: {},
});
