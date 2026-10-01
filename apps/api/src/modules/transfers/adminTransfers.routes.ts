import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { adminTransferListQuerySchema, adminTransferSchema, paginatedResponseSchema } from "@white-label/shared-types";
import { requireStaffAuth } from "../../middleware/requireStaffAuth.js";
import { errorResponseSchema } from "../../lib/httpSchemas.js";
import { getAdminTransfer, listAdminTransfers } from "./transfers.service.js";

/** Read-only, open to any staff — same access model as /admin/payouts and /admin/transactions. */
export async function adminTransfersRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/admin/transfers",
    { preHandler: requireStaffAuth, schema: { querystring: adminTransferListQuerySchema, response: { 200: paginatedResponseSchema(adminTransferSchema) } } },
    async (request, reply) => {
      const { page, pageSize, ...filters } = request.query;
      return reply.send(await listAdminTransfers(app.prisma, filters, page, pageSize));
    },
  );

  server.get(
    "/admin/transfers/:id",
    { preHandler: requireStaffAuth, schema: { params: z.object({ id: z.string() }), response: { 200: adminTransferSchema, 404: errorResponseSchema } } },
    async (request, reply) => reply.send(await getAdminTransfer(app.prisma, request.params.id)),
  );
}
