import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { brandingConfigSchema, updateBrandingSchema } from "@white-label/shared-types";
import { requireStaffAuth, requireRole } from "../../middleware/requireStaffAuth.js";
import { parseSingleMultipartFile } from "../../lib/parseMultipartFile.js";
import { getActiveStorageProvider } from "../../lib/storage/storageFactory.js";
import { getBranding, updateBranding } from "./branding.service.js";

const STAMP_ALLOWED_MIMETYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const;

export async function brandingRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get("/branding", { schema: { response: { 200: brandingConfigSchema } } }, async (_request, reply) => {
    const branding = await getBranding(app.prisma);
    return reply.send(branding);
  });

  server.patch(
    "/admin/branding",
    {
      preHandler: [requireStaffAuth, requireRole("OWNER", "ADMIN")],
      schema: { body: updateBrandingSchema, response: { 200: brandingConfigSchema } },
    },
    async (request, reply) => {
      const branding = await updateBranding(app.prisma, request.body);
      return reply.send(branding);
    },
  );

  server.post(
    "/admin/branding/stamp-upload",
    { preHandler: [requireStaffAuth, requireRole("OWNER", "ADMIN")], schema: { response: { 200: brandingConfigSchema } } },
    async (request, reply) => {
      const file = await parseSingleMultipartFile(request, { allowedMimetypes: STAMP_ALLOWED_MIMETYPES, fieldName: "file" });
      const { url } = await getActiveStorageProvider().upload(file.buffer, { filename: file.filename, mimetype: file.mimetype, folder: "branding" });
      const branding = await updateBranding(app.prisma, { stampUrl: url });
      return reply.send(branding);
    },
  );
}
