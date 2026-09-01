/**
 * Shared between local.provider.ts (writes) and localAssets.routes.ts (serves) so the two sides
 * of the local-disk backend agree on exactly what a valid key looks like and what content type
 * it's served with. Content type is always looked up from the key's extension here — never taken
 * from the client's original upload mimetype or filename — so a served file's Content-Type can't
 * be spoofed by whatever a previous uploader claimed.
 */
export const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
};

export const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

/** A local storage key is always `${randomUUID()}.${ext}` — never derived from client input. */
export const LOCAL_STORAGE_KEY_PATTERN = /^[a-f0-9-]{36}\.(png|jpg|jpeg|webp|svg)$/i;
