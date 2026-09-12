import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createSupportTicketSchema, supportTicketListItemSchema, supportTicketDetailSchema, addSupportTicketMessageSchema } from "@white-label/shared-types";
import { requireCustomerAuth } from "../../middleware/requireCustomerAuth.js";
import { resolveEffectiveCustomerId } from "../../lib/portalPrincipal.js";
import { errorResponseSchema } from "../../lib/httpSchemas.js";
import { submitSupportTicket, listMyTickets, getMyTicket, addCustomerReply } from "./support.service.js";

export async function supportRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.post(
    "/portal/support/tickets",
    {
      preHandler: requireCustomerAuth,
      schema: { body: createSupportTicketSchema, response: { 200: z.object({ submitted: z.boolean(), id: z.string() }), 409: errorResponseSchema } },
    },
    async (request, reply) => {
      const { id } = await submitSupportTicket(app.prisma, resolveEffectiveCustomerId(request.customer!), request.body);
      return reply.send({ submitted: true, id });
    },
  );

  server.get(
    "/portal/support/tickets",
    { preHandler: requireCustomerAuth, schema: { response: { 200: z.array(supportTicketListItemSchema) } } },
    async (request, reply) => {
      const tickets = await listMyTickets(app.prisma, resolveEffectiveCustomerId(request.customer!));
      return reply.send(tickets);
    },
  );

  server.get(
    "/portal/support/tickets/:id",
    {
      preHandler: requireCustomerAuth,
      schema: { params: z.object({ id: z.string() }), response: { 200: supportTicketDetailSchema, 404: errorResponseSchema } },
    },
    async (request, reply) => {
      const ticket = await getMyTicket(app.prisma, resolveEffectiveCustomerId(request.customer!), request.params.id);
      return reply.send(ticket);
    },
  );

  server.post(
    "/portal/support/tickets/:id/messages",
    {
      preHandler: requireCustomerAuth,
      schema: { params: z.object({ id: z.string() }), body: addSupportTicketMessageSchema, response: { 200: supportTicketDetailSchema, 404: errorResponseSchema, 409: errorResponseSchema } },
    },
    async (request, reply) => {
      const ticket = await addCustomerReply(app.prisma, resolveEffectiveCustomerId(request.customer!), request.params.id, request.body.body);
      return reply.send(ticket);
    },
  );
}
