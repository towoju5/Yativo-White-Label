import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { adminPaymentGatewaySchema, updateGatewayEnabledSchema, depositCountrySchema, payoutCountrySchema } from "@white-label/shared-types";
import { requireStaffAuth, requireRole } from "../../middleware/requireStaffAuth.js";
import { yativoClient } from "../../lib/yativoClient.js";
import { listDisabledGatewayIds, setGatewayEnabled } from "../../lib/paymentGatewayOverrides.js";

/**
 * Admin control over which payment rails customers can use, independent of whatever Yativo
 * itself reports as active — this platform is built on top of Yativo but decides its own product
 * surface (see PaymentGatewayOverride's doc comment). Portal-facing gateway listings (deposits,
 * beneficiary payout methods) apply the same override via filterEnabledGateways.
 */
export async function paymentGatewaysRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/admin/settings/payment-gateways/payin/countries",
    { preHandler: requireStaffAuth, schema: { response: { 200: z.array(depositCountrySchema) } } },
    async (_request, reply) => reply.send(await yativoClient.fiat.paymentMethods.listPayinCountries()),
  );

  server.get(
    "/admin/settings/payment-gateways/payout/countries",
    { preHandler: requireStaffAuth, schema: { response: { 200: z.array(payoutCountrySchema) } } },
    async (_request, reply) => reply.send(await yativoClient.fiat.paymentMethods.listPayoutCountries()),
  );

  server.get(
    "/admin/settings/payment-gateways/payin",
    {
      preHandler: requireStaffAuth,
      schema: { querystring: z.object({ country: z.string() }), response: { 200: z.array(adminPaymentGatewaySchema) } },
    },
    async (request, reply) => {
      const [methods, disabled] = await Promise.all([
        yativoClient.fiat.paymentMethods.listPayinMethodsByCountry({ country: request.query.country }),
        listDisabledGatewayIds(app.prisma, "PAYIN"),
      ]);
      return reply.send(
        methods.map((m) => ({
          gatewayId: m.gatewayId,
          methodName: m.methodName,
          country: m.country,
          currency: m.currency,
          active: m.active,
          isEnabledForCustomers: !disabled.has(m.gatewayId),
        })),
      );
    },
  );

  server.get(
    "/admin/settings/payment-gateways/payout",
    {
      preHandler: requireStaffAuth,
      schema: {
        querystring: z.object({ country: z.string().optional(), currency: z.string().optional() }),
        response: { 200: z.array(adminPaymentGatewaySchema) },
      },
    },
    async (request, reply) => {
      const [methods, disabled] = await Promise.all([
        yativoClient.fiat.paymentMethods.listPayoutMethods({ country: request.query.country, currency: request.query.currency }),
        listDisabledGatewayIds(app.prisma, "PAYOUT"),
      ]);
      return reply.send(
        methods.map((m) => ({
          gatewayId: m.gatewayId,
          methodName: m.methodName,
          country: m.country,
          currency: m.currency,
          active: m.active,
          isEnabledForCustomers: !disabled.has(m.gatewayId),
        })),
      );
    },
  );

  server.patch(
    "/admin/settings/payment-gateways/:kind/:gatewayId",
    {
      preHandler: [requireStaffAuth, requireRole("OWNER", "ADMIN")],
      schema: {
        params: z.object({ kind: z.enum(["PAYIN", "PAYOUT"]), gatewayId: z.string() }),
        body: updateGatewayEnabledSchema,
        response: { 204: z.void() },
      },
    },
    async (request, reply) => {
      await setGatewayEnabled(app.prisma, request.params.kind, request.params.gatewayId, request.body.isEnabledForCustomers);
      return reply.code(204).send();
    },
  );
}
