import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { pricingServiceSchema, pricingRuleSchema, updatePricingDefaultSchema, customerPricingRuleSchema, upsertPricingOverrideSchema, fxMarginSchema } from "@white-label/shared-types";
import { requireStaffAuth, requireRole } from "../../middleware/requireStaffAuth.js";
import { errorResponseSchema } from "../../lib/httpSchemas.js";
import { listPricingDefaults, updatePricingDefault, listCustomerPricing, upsertPricingOverride, deletePricingOverride } from "./pricing.service.js";
import { requireStepUp } from "../../middleware/requireStepUp.js";
import { logAdminAction } from "../../lib/adminAuditLog.js";
import { getFxMarginBps } from "./fxMargin.js";

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
      preHandler: [requireStaffAuth, requireRole("OWNER", "ADMIN"), requireStepUp("Change platform pricing")],
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
      preHandler: [requireStaffAuth, requireRole("OWNER", "ADMIN"), requireStepUp("Change a customer's pricing")],
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
      preHandler: [requireStaffAuth, requireRole("OWNER", "ADMIN"), requireStepUp("Reset a customer's pricing")],
      schema: { params: customerServiceParams, response: { 200: customerPricingRuleSchema, 404: errorResponseSchema } },
    },
    async (request, reply) => {
      const reverted = await deletePricingOverride(app.prisma, request.params.customerId, request.params.service);
      return reply.send(reverted);
    },
  );
  // The exchange-rate float — one platform-wide margin on every conversion (see fxMargin.ts).
  server.get(
    "/admin/pricing/fx-margin",
    { preHandler: requireStaffAuth, schema: { response: { 200: fxMarginSchema } } },
    async (_request, reply) => reply.send({ fxMarginBps: await getFxMarginBps(app.prisma) }),
  );

  server.put(
    "/admin/pricing/fx-margin",
    {
      preHandler: [requireStaffAuth, requireRole("OWNER", "ADMIN"), requireStepUp("Change the exchange-rate float")],
      schema: { body: fxMarginSchema, response: { 200: fxMarginSchema } },
    },
    async (request, reply) => {
      const previous = await getFxMarginBps(app.prisma);
      const settings = await app.prisma.platformSettings.update({ where: { id: 1 }, data: { fxMarginBps: request.body.fxMarginBps } });
      await logAdminAction(app.prisma, request.staffUser!.sub, "pricing.fx_margin", "platform_settings", { from: previous, to: settings.fxMarginBps });
      return reply.send({ fxMarginBps: settings.fxMarginBps });
    },
  );
}
