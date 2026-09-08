import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { pricingServiceSchema, pricingRuleSchema, updatePricingDefaultSchema, customerPricingRuleSchema, upsertPricingOverrideSchema } from "@white-label/shared-types";
import { requireStaffAuth, requireRole } from "../../middleware/requireStaffAuth.js";
import { errorResponseSchema } from "../../lib/httpSchemas.js";
import { listPricingDefaults, updatePricingDefault, listCustomerPricing, upsertPricingOverride, deletePricingOverride } from "./pricing.service.js";

export async function pricingRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();
  const serviceParam = z.object({ service: pricingServiceSchema });
  const customerServiceParams = z.object({ customerId: z.string(), service: pricingServiceSchema });

  server.get(
    "/admin/pricing",
    { preHandler: requireStaffAuth, schema: { response: { 200: z.array(pricingRuleSchema) } } },
    async (_request, reply) => {
      const defaults = await listPricingDefaults(app.prisma);
      return reply.send(defaults);
    },
  );

  server.patch(
    "/admin/pricing/:service",
    {
      preHandler: [requireStaffAuth, requireRole("OWNER", "ADMIN")],
      schema: { params: serviceParam, body: updatePricingDefaultSchema, response: { 200: pricingRuleSchema, 404: errorResponseSchema } },
    },
    async (request, reply) => {
      const updated = await updatePricingDefault(app.prisma, request.params.service, request.body);
      return reply.send(updated);
    },
  );

  server.get(
    "/admin/customers/:customerId/pricing",
    { preHandler: requireStaffAuth, schema: { params: z.object({ customerId: z.string() }), response: { 200: z.array(customerPricingRuleSchema) } } },
    async (request, reply) => {
      const rules = await listCustomerPricing(app.prisma, request.params.customerId);
      return reply.send(rules);
    },
  );

  server.put(
    "/admin/customers/:customerId/pricing/:service",
    {
      preHandler: [requireStaffAuth, requireRole("OWNER", "ADMIN")],
      schema: { params: customerServiceParams, body: upsertPricingOverrideSchema, response: { 200: customerPricingRuleSchema } },
    },
    async (request, reply) => {
      const override = await upsertPricingOverride(app.prisma, request.params.customerId, request.params.service, request.body);
      return reply.send(override);
    },
  );

  server.delete(
    "/admin/customers/:customerId/pricing/:service",
    {
      preHandler: [requireStaffAuth, requireRole("OWNER", "ADMIN")],
      schema: { params: customerServiceParams, response: { 200: customerPricingRuleSchema, 404: errorResponseSchema } },
    },
    async (request, reply) => {
      const reverted = await deletePricingOverride(app.prisma, request.params.customerId, request.params.service);
      return reply.send(reverted);
    },
  );
}
