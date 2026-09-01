import type { FastifyRequest } from "fastify";
import { AppError } from "./errors.js";

export type ParsedFile = { buffer: Buffer; filename: string; mimetype: string };

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Generic single-file multipart parser — factored out of the KYC-specific one in
 * parseMultipartKyc.ts (same extension-allowlist/size-bound idea, parameterized instead of
 * hardcoded to KYC's constants) so any future asset upload (the branding stamp today) can reuse
 * it instead of hand-rolling multipart handling again.
 */
export async function parseSingleMultipartFile(
  request: FastifyRequest,
  opts: { allowedMimetypes: readonly string[]; maxBytes?: number; fieldName?: string },
): Promise<ParsedFile> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;

  for await (const part of request.parts()) {
    if (part.type !== "file") continue;
    if (opts.fieldName && part.fieldname !== opts.fieldName) continue;
    if (!opts.allowedMimetypes.includes(part.mimetype)) {
      throw new AppError(`"${part.filename}" isn't a supported file type — use ${opts.allowedMimetypes.join(", ")}.`, 400, "INVALID_FILE_TYPE");
    }
    const buffer = await part.toBuffer();
    if (buffer.length > maxBytes) {
      throw new AppError(`"${part.filename}" is too large (max ${Math.round(maxBytes / 1024 / 1024)}MB).`, 400, "FILE_TOO_LARGE");
    }
    return { buffer, filename: part.filename, mimetype: part.mimetype };
  }

  throw new AppError("No file was uploaded.", 400, "MISSING_FILE");
}
