export type UploadMeta = {
  filename: string;
  mimetype: string;
  /** Logical grouping, e.g. "branding" — providers that support key prefixes namespace by it. */
  folder?: string;
};

export type UploadResult = {
  /** Publicly reachable URL to store on the owning record (e.g. BrandingConfig.stampUrl). */
  url: string;
  /** Provider-internal identifier needed to delete the object later. */
  key: string;
};

export interface StorageProvider {
  upload(buffer: Buffer, meta: UploadMeta): Promise<UploadResult>;
  delete(key: string): Promise<void>;
  getUrl(key: string): string;
}
