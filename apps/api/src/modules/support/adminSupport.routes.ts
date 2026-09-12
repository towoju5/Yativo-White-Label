import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  adminSupportTicketListItemSchema,
  adminSupportTicketDetailSchema,
  addSupportTicketMessageSchema,
  updateSupportTicketStatusSchema,
  supportTicketStatusSchema,
} from "@white-label/shared-types";
import { requireStaffAuth } from "../../middleware/requireStaffAuth.js";
import { errorResponseSchema } from "../../lib/httpSchemas.js";
import { listTicketsForAdmin, getTicketForAdmin, addStaffReply, updateTicketStatus } from "./support.service.js";

export async function adminSupportRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/admin/support/tickets",
    {
      preHandler: requireStaffAuth,
      schema: { querystring: z.object({ status: supportTicketStatusSchema.optional() }), response: { 200: z.array(adminSupportTicketListItemSchema) } },
    },
    async (request, reply) => {
      const tickets = await listTicketsForAdmin(app.prisma, request.query.status);
      return reply.send(tickets);
    },
  );

  server.get(
    "/admin/support/tickets/:id",
    {
      preHandler: requireStaffAuth,
      schema: { params: z.object({ id: z.string() }), response: { 200: adminSupportTicketDetailSchema, 404: errorResponseSchema } },
    },
    async (request, reply) => {
      const ticket = await getTicketForAdmin(app.prisma, request.params.id);
      return reply.send(ticket);
    },
  );

  server.post(
    "/admin/support/tickets/:id/messages",
    {
      preHandler: requireStaffAuth,
      schema: { params: z.object({ id: z.string() }), body: addSupportTicketMessageSchema, response: { 200: adminSupportTicketDetailSchema, 404: errorResponseSchema } },
    },
    async (request, reply) => {
      const ticket = await addStaffReply(app.prisma, request.staffUser!.sub, request.params.id, request.body.body);
      return reply.send(ticket);
    },
  );

  server.patch(
    "/admin/support/tickets/:id/status",
    {
      preHandler: requireStaffAuth,
      schema: { params: z.object({ id: z.string() }), body: updateSupportTicketStatusSchema, response: { 200: adminSupportTicketDetailSchema, 404: errorResponseSchema } },
    },
    async (request, reply) => {
      const ticket = await updateTicketStatus(app.prisma, request.params.id, request.body.status);
      return reply.send(ticket);
    },
  );
}
