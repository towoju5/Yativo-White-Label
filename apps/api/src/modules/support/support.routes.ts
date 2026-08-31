import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createSupportTicketSchema } from "@white-label/shared-types";
import { requireCustomerAuth } from "../../middleware/requireCustomerAuth.js";
import { errorResponseSchema } from "../../lib/httpSchemas.js";
import { submitSupportTicket } from "./support.service.js";

export async function supportRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.post(
    "/portal/support/tickets",
    {
      preHandler: requireCustomerAuth,
      schema: { body: createSupportTicketSchema, response: { 200: z.object({ submitted: z.boolean() }), 409: errorResponseSchema } },
    },
    async (request, reply) => {
      await submitSupportTicket(app.prisma, request.customer!.sub, request.body);
      return reply.send({ submitted: true });
    },
  );
}
