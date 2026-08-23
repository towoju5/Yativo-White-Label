import type { FastifyRequest } from "fastify";
import { FILE_MIN_BYTES, FILE_MAX_BYTES, FILE_ACCEPT } from "@white-label/shared-types";
import type { UploadedFile } from "@white-label/yativo-sdk";
import { AppError } from "./errors.js";

const ALLOWED_EXTENSIONS = new Set(FILE_ACCEPT.split(",").map((e) => e.replace(".", "").toLowerCase()));

/**
 * Parses a `multipart/form-data` KYC submission: one `payload` field carrying the JSON body
 * (file fields hold their filename as a placeholder string — see kycShared.tsx's FileField),
 * plus N file parts named by the exact dot-path they occupy in that payload
 * (e.g. `residentialAddress.proofOfAddressFile`, `identifyingInformation.0.imageFront`).
 */
export async function parseMultipartKycRequest(request: FastifyRequest): Promise<{ payload: unknown; files: Map<string, UploadedFile> }> {
  let payload: unknown;
  const files = new Map<string, UploadedFile>();

  for await (const part of request.parts()) {
    if (part.type === "file") {
      const ext = part.filename.split(".").pop()?.toLowerCase() ?? "";
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        throw new AppError(`"${part.filename}" isn't a supported file type — use ${FILE_ACCEPT}.`, 400, "INVALID_FILE_TYPE");
      }
      const buffer = await part.toBuffer();
      if (buffer.length < FILE_MIN_BYTES) {
        throw new AppError(`"${part.filename}" is too small (min ${Math.round(FILE_MIN_BYTES / 1024)}KB) — don't over-compress.`, 400, "FILE_TOO_SMALL");
      }
      if (buffer.length > FILE_MAX_BYTES) {
        throw new AppError(`"${part.filename}" is too large (max ${Math.round(FILE_MAX_BYTES / 1024 / 1024)}MB).`, 400, "FILE_TOO_LARGE");
      }
      files.set(part.fieldname, { buffer, filename: part.filename, mimetype: part.mimetype });
    } else if (part.fieldname === "payload") {
      try {
        payload = JSON.parse(part.value as string);
      } catch {
        throw new AppError("Malformed payload field — expected JSON.", 400, "INVALID_PAYLOAD");
      }
    }
  }

  if (payload === undefined) throw new AppError("Missing payload field.", 400, "MISSING_PAYLOAD");
  return { payload, files };
}

function setAtPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  const lastKey = parts.pop();
  if (lastKey === undefined) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cursor: any = obj;
  for (const key of parts) {
    cursor = cursor[/^\d+$/.test(key) ? Number(key) : key];
  }
  cursor[/^\d+$/.test(lastKey) ? Number(lastKey) : lastKey] = value;
}

/**
 * Merges parsed file parts into the (already zod-validated) JSON payload, replacing each file
 * field's filename placeholder with the real `UploadedFile`. Assumes every path already exists
 * in `payload` — true here, since the frontend always sends the placeholder at that exact path.
 * `TOut` differs from `TIn` because the zod-validated input still types file fields as `string`
 * (the placeholder) — the caller asserts the post-merge shape (SDK's Submit*KycInput).
 */
export function injectFiles<TIn extends object, TOut extends object = TIn>(payload: TIn, files: Map<string, UploadedFile>): TOut {
  const clone = structuredClone(payload) as Record<string, unknown>;
  for (const [path, file] of files) {
    setAtPath(clone, path, file);
  }
  return clone as unknown as TOut;
}
