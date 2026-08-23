import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { payoutListItemSchema, paginationQuerySchema, paginatedResponseSchema, currencyCodeSchema } from "@white-label/shared-types";
import { requireStaffAuth } from "../../middleware/requireStaffAuth.js";
import { listAdminPayouts } from "./payouts.service.js";

const listQuerySchema = paginationQuerySchema.extend({
  customerId: z.string().optional(),
  currencyCode: currencyCodeSchema.optional(),
});

export async function adminPayoutsRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/admin/payouts",
    {
      preHandler: requireStaffAuth,
      schema: { querystring: listQuerySchema, response: { 200: paginatedResponseSchema(payoutListItemSchema) } },
    },
    async (request, reply) => {
      const { page, pageSize, customerId, currencyCode } = request.query;
      const result = await listAdminPayouts(app.prisma, { customerId, currencyCode }, page, pageSize);
      return reply.send(result);
    },
  );
}
