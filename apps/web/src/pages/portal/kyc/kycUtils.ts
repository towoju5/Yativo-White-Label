import { FILE_MIN_BYTES, FILE_MAX_BYTES, FILE_ACCEPT } from "@white-label/shared-types";

// Plain functions/types only — no components, no JSX — deliberately kept out of kycShared.tsx.
// That file exports React components, and Vite's Fast Refresh can only hot-reload a module whose
// exports are ALL components: mixing in plain functions like these forces a full-module invalidate
// on every edit to kycShared.tsx (or any file that imports from it), which can leave an
// already-open browser tab on stale/broken state until a hard refresh — confirmed as the cause of
// a live "the deposit country dropdown stopped working" report that didn't reproduce on a fresh load.

export function humanize(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const FILE_EXTENSIONS = FILE_ACCEPT.split(",").map((e) => e.replace(".", "").toLowerCase());

/** Client-side mirror of the guide's file rules (§2.1–2.2): 100KB–4MB, pdf/jpg/jpeg/png/heic/tif. */
export function validateFile(file: File): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!FILE_EXTENSIONS.includes(ext)) return `Unsupported file type — use ${FILE_ACCEPT}.`;
  if (file.size < FILE_MIN_BYTES) return `File is too small (min ${Math.round(FILE_MIN_BYTES / 1024)}KB) — don't over-compress.`;
  if (file.size > FILE_MAX_BYTES) return `File is too large (max ${Math.round(FILE_MAX_BYTES / 1024 / 1024)}MB).`;
  return null;
}

// react-hook-form's UseFormReturn is invariant in its validate callback, so a plain
// `UseFormReturn<any>` alias isn't assignable from a concretely-typed form — these
// reusable field-group components are view glue shared across two different schemas,
// so they take the loosest possible type rather than fighting form-level generics.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyForm = any;

/** Builds the multipart body: one `payload` JSON field (filenames in place of file values) plus one binary part per registered file. */
export function buildKycFormData(values: unknown, files: Map<string, File>): FormData {
  const formData = new FormData();
  formData.append("payload", JSON.stringify(values));
  for (const [path, file] of files) formData.append(path, file, file.name);
  return formData;
}
