import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createPayoutSchema, payoutSchema, payoutStatusSchema, paginationQuerySchema, paginatedResponseSchema } from "@white-label/shared-types";
import { requireCustomerAuth } from "../../middleware/requireCustomerAuth.js";
import { resolveEffectiveCustomerId } from "../../lib/portalPrincipal.js";
import { errorResponseSchema } from "../../lib/httpSchemas.js";
import { createPortalPayout, listPortalPayouts, getLivePayoutStatus } from "./payouts.service.js";

export async function portalPayoutsRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.post(
    "/portal/payouts",
    {
      preHandler: requireCustomerAuth,
      schema: { body: createPayoutSchema, response: { 200: payoutSchema, 409: errorResponseSchema } },
    },
    async (request, reply) => {
      const payout = await createPortalPayout(app.prisma, resolveEffectiveCustomerId(request.customer!), request.body);
      return reply.send(payout);
    },
  );

  server.get(
    "/portal/payouts",
    {
      preHandler: requireCustomerAuth,
      schema: { querystring: paginationQuerySchema, response: { 200: paginatedResponseSchema(payoutSchema) } },
    },
    async (request, reply) => {
      const result = await listPortalPayouts(app.prisma, resolveEffectiveCustomerId(request.customer!), request.query.page, request.query.pageSize);
      return reply.send(result);
    },
  );

  server.get(
    "/portal/payouts/:id/status",
    {
      preHandler: requireCustomerAuth,
      schema: { params: z.object({ id: z.string() }), response: { 200: payoutStatusSchema, 404: errorResponseSchema } },
    },
    async (request, reply) => {
      const status = await getLivePayoutStatus(app.prisma, resolveEffectiveCustomerId(request.customer!), request.params.id);
      return reply.send(status);
    },
  );
}
