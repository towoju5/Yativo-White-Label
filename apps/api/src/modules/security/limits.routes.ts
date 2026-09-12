import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { customerLimitSchema, platformLimitDefaultSchema, updatePlatformLimitDefaultSchema, updateCustomerLimitSchema } from "@white-label/shared-types";
import { requireCustomerAuth } from "../../middleware/requireCustomerAuth.js";
import { requireStaffAuth, requireRole } from "../../middleware/requireStaffAuth.js";
import { resolveEffectiveCustomerId } from "../../lib/portalPrincipal.js";
import { listCustomerLimits, listPlatformLimitDefaults, setPlatformLimitDefault, setCustomerLimit } from "./limits.service.js";

export async function limitsRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/portal/security/limits",
    { preHandler: requireCustomerAuth, schema: { response: { 200: z.array(customerLimitSchema) } } },
    async (request, reply) => {
      const limits = await listCustomerLimits(app.prisma, resolveEffectiveCustomerId(request.customer!));
      return reply.send(limits);
    },
  );

  server.get(
    "/admin/settings/limits",
    { preHandler: requireStaffAuth, schema: { response: { 200: z.array(platformLimitDefaultSchema) } } },
    async (_request, reply) => reply.send(await listPlatformLimitDefaults(app.prisma)),
  );

  server.put(
    "/admin/settings/limits/:currencyCode",
    {
      preHandler: [requireStaffAuth, requireRole("OWNER", "ADMIN")],
      schema: { params: z.object({ currencyCode: z.string() }), body: updatePlatformLimitDefaultSchema, response: { 200: platformLimitDefaultSchema } },
    },
    async (request, reply) => {
      const result = await setPlatformLimitDefault(app.prisma, request.params.currencyCode, request.body.dailyLimitMinor, request.body.monthlyLimitMinor);
      return reply.send(result);
    },
  );

  server.get(
    "/admin/customers/:customerId/limits",
    { preHandler: requireStaffAuth, schema: { params: z.object({ customerId: z.string() }), response: { 200: z.array(customerLimitSchema) } } },
    async (request, reply) => reply.send(await listCustomerLimits(app.prisma, request.params.customerId)),
  );

  server.put(
    "/admin/customers/:customerId/limits",
    {
      preHandler: [requireStaffAuth, requireRole("OWNER", "ADMIN")],
      schema: { params: z.object({ customerId: z.string() }), body: updateCustomerLimitSchema, response: { 200: z.array(customerLimitSchema) } },
    },
    async (request, reply) => {
      const result = await setCustomerLimit(app.prisma, request.params.customerId, request.body.currencyCode, request.body.dailyLimitMinor, request.body.monthlyLimitMinor);
      return reply.send(result);
    },
  );
}
