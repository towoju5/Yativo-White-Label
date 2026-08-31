import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { staticPageSchema, staticPageSummarySchema, createStaticPageSchema, updateStaticPageSchema } from "@white-label/shared-types";
import { requireStaffAuth, requireRole } from "../../middleware/requireStaffAuth.js";
import { errorResponseSchema } from "../../lib/httpSchemas.js";
import {
  listStaticPages,
  getStaticPageById,
  getPublishedPageBySlug,
  listFooterPages,
  listSupportPages,
  createStaticPage,
  updateStaticPage,
  deleteStaticPage,
} from "./pages.service.js";

export async function pagesRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  // --- Public ---

  server.get(
    "/pages/footer",
    { schema: { response: { 200: z.array(staticPageSummarySchema) } } },
    async (_request, reply) => reply.send(await listFooterPages(app.prisma)),
  );

  server.get(
    "/pages/support",
    { schema: { response: { 200: z.array(staticPageSummarySchema) } } },
    async (_request, reply) => reply.send(await listSupportPages(app.prisma)),
  );

  server.get(
    "/pages/:slug",
    { schema: { params: z.object({ slug: z.string() }), response: { 200: staticPageSchema, 404: errorResponseSchema } } },
    async (request, reply) => reply.send(await getPublishedPageBySlug(app.prisma, request.params.slug)),
  );

  // --- Admin ---

  server.get(
    "/admin/pages",
    { preHandler: requireStaffAuth, schema: { response: { 200: z.array(staticPageSchema) } } },
    async (_request, reply) => reply.send(await listStaticPages(app.prisma)),
  );

  server.get(
    "/admin/pages/:id",
    {
      preHandler: requireStaffAuth,
      schema: { params: z.object({ id: z.string() }), response: { 200: staticPageSchema, 404: errorResponseSchema } },
    },
    async (request, reply) => reply.send(await getStaticPageById(app.prisma, request.params.id)),
  );

  server.post(
    "/admin/pages",
    {
      preHandler: [requireStaffAuth, requireRole("OWNER", "ADMIN")],
      schema: { body: createStaticPageSchema, response: { 200: staticPageSchema, 409: errorResponseSchema } },
    },
    async (request, reply) => reply.send(await createStaticPage(app.prisma, request.body)),
  );

  server.patch(
    "/admin/pages/:id",
    {
      preHandler: [requireStaffAuth, requireRole("OWNER", "ADMIN")],
      schema: {
        params: z.object({ id: z.string() }),
        body: updateStaticPageSchema,
        response: { 200: staticPageSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => reply.send(await updateStaticPage(app.prisma, request.params.id, request.body)),
  );

  server.delete(
    "/admin/pages/:id",
    {
      preHandler: [requireStaffAuth, requireRole("OWNER", "ADMIN")],
      schema: { params: z.object({ id: z.string() }), response: { 204: z.void(), 404: errorResponseSchema, 409: errorResponseSchema } },
    },
    async (request, reply) => {
      await deleteStaticPage(app.prisma, request.params.id);
      return reply.status(204).send();
    },
  );
}
