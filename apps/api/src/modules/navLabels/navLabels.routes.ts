import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { navLabelOverrideSchema, navLabelOverridesResponseSchema, upsertNavLabelOverrideSchema } from "@white-label/shared-types";
import { requireStaffAuth, requireRole } from "../../middleware/requireStaffAuth.js";
import { listNavLabelOverrides, upsertNavLabelOverride, deleteNavLabelOverride, KNOWN_NAV_LABEL_KEYS } from "./navLabels.service.js";

export async function navLabelsRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  // Public — same access model as GET /branding: the customer portal needs this before login to
  // render its nav with the right labels.
  server.get("/nav-labels", { schema: { response: { 200: navLabelOverridesResponseSchema } } }, async (_request, reply) => {
    reply.send(await listNavLabelOverrides(app.prisma));
  });

  server.put(
    "/admin/nav-labels/:key",
    {
      preHandler: [requireStaffAuth, requireRole("OWNER", "ADMIN")],
      schema: {
        params: z.object({ key: z.enum(KNOWN_NAV_LABEL_KEYS) }),
        body: upsertNavLabelOverrideSchema,
        response: { 200: navLabelOverrideSchema },
      },
    },
    async (request, reply) => {
      const setting = await upsertNavLabelOverride(app.prisma, request.params.key, request.body);
      return reply.send(setting);
    },
  );

  server.delete(
    "/admin/nav-labels/:key",
    {
      preHandler: [requireStaffAuth, requireRole("OWNER", "ADMIN")],
      schema: { params: z.object({ key: z.enum(KNOWN_NAV_LABEL_KEYS) }), response: { 204: z.void() } },
    },
    async (request, reply) => {
      await deleteNavLabelOverride(app.prisma, request.params.key);
      return reply.code(204).send();
    },
  );
}
