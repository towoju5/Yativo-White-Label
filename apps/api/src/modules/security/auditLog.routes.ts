import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { customerAuditLogEntrySchema } from "@white-label/shared-types";
import { z } from "zod";
import { requireCustomerAuth } from "../../middleware/requireCustomerAuth.js";
import { resolveEffectiveCustomerId } from "../../lib/portalPrincipal.js";

export async function customerAuditLogRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/portal/security/activity",
    { preHandler: requireCustomerAuth, schema: { response: { 200: z.array(customerAuditLogEntrySchema) } } },
    async (request, reply) => {
      const customerId = resolveEffectiveCustomerId(request.customer!);
      const entries = await app.prisma.customerAuditLog.findMany({ where: { customerId }, orderBy: { createdAt: "desc" }, take: 50 });
      return reply.send(entries.map((e) => ({ id: e.id, action: e.action, ip: e.ip, userAgent: e.userAgent, createdAt: e.createdAt.toISOString() })));
    },
  );
}
