import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { brandingConfigSchema, updateBrandingSchema } from "@white-label/shared-types";
import { requireStaffAuth, requireRole } from "../../middleware/requireStaffAuth.js";
import { getBranding, updateBranding } from "./branding.service.js";

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
}
