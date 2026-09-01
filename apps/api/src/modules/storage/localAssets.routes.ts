import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { LOCAL_STORAGE_ROOT_DIR } from "../../lib/storage/local.provider.js";
import { LOCAL_STORAGE_KEY_PATTERN, MIME_BY_EXTENSION } from "../../lib/storage/localStorageConstants.js";

/**
 * Narrow, purpose-built route for serving local-disk-stored assets — deliberately NOT a
 * @fastify/static mount. There is no directory-listing surface here: the key is re-validated
 * against the exact `randomUUID().ext` shape before touching the filesystem (defeating path
 * traversal, since a validated key can never contain `/` or `..`), exactly one resolved file is
 * read, and Content-Type comes from a fixed extension→mimetype map — never the client's original
 * upload mimetype — so a served file's type can't be spoofed.
 */
export async function localAssetsRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get("/assets/local/:key", { schema: { params: z.object({ key: z.string() }) } }, async (request, reply) => {
    const { key } = request.params;
    if (!LOCAL_STORAGE_KEY_PATTERN.test(key)) {
      return reply.code(404).send({ message: "Not found", code: "NOT_FOUND" });
    }
    const ext = key.split(".").pop()!.toLowerCase();
    const mimetype = MIME_BY_EXTENSION[ext];
    try {
      const buffer = await readFile(path.join(LOCAL_STORAGE_ROOT_DIR, key));
      reply.header("Content-Type", mimetype);
      reply.header("Cache-Control", "public, max-age=31536000, immutable");
      return reply.send(buffer);
    } catch {
      return reply.code(404).send({ message: "Not found", code: "NOT_FOUND" });
    }
  });
}
