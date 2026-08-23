import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { depositCountrySchema, depositMethodSchema, createDepositSchema, depositResultSchema } from "@white-label/shared-types";
import { requireCustomerAuth } from "../../middleware/requireCustomerAuth.js";
import { yativoClient } from "../../lib/yativoClient.js";
import { ensureYativoCustomer } from "../../lib/ensureYativoCustomer.js";
import { ensureCustomerWalletAccount } from "../ledger/accounts.js";
import { env } from "../../config/env.js";
import { requireKycApprovedForService } from "../../lib/requireKycApproved.js";
import { errorResponseSchema } from "../../lib/httpSchemas.js";

// Native gateway pay-ins only (country → method → wallet + amount → initiate) — for
// long-lived bank-transfer receiving accounts, see modules/virtualAccounts instead.
export async function depositsRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/portal/deposit/countries",
    { preHandler: requireCustomerAuth, schema: { response: { 200: z.array(depositCountrySchema) } } },
    async (_request, reply) => {
      const countries = await yativoClient.fiat.paymentMethods.listPayinCountries();
      return reply.send(countries);
    },
  );

  server.get(
    "/portal/deposit/methods",
    {
      preHandler: requireCustomerAuth,
      schema: { querystring: z.object({ country: z.string() }), response: { 200: z.array(depositMethodSchema) } },
    },
    async (request, reply) => {
      const methods = await yativoClient.fiat.paymentMethods.listPayinMethodsByCountry({ country: request.query.country });
      return reply.send(methods.filter((m) => m.active));
    },
  );

  server.post(
    "/portal/deposit/initiate",
    {
      preHandler: requireCustomerAuth,
      schema: { body: createDepositSchema, response: { 200: depositResultSchema, 404: errorResponseSchema } },
    },
    async (request, reply) => {
      const customer = await app.prisma.customer.findUniqueOrThrow({ where: { id: request.customer!.sub } });
      await requireKycApprovedForService(app.prisma, "DEPOSIT", customer);

      const yativoCustomerId = await ensureYativoCustomer(app.prisma, customer);

      const result = await yativoClient.fiat.deposits.create({
        yativoCustomerId,
        gatewayId: request.body.gatewayId,
        walletCurrencyCode: request.body.walletCurrencyCode,
        amount: Number(request.body.amount),
        extraData: request.body.extraData,
        returnUrl: `${env.WEB_APP_URL}/portal/deposit`,
        idempotencyKey: randomUUID(),
      });

      // Only create the wallet once Yativo has actually accepted the deposit — creating it
      // eagerly before this call would leave a stray empty wallet behind on any failure (e.g.
      // an unsupported currency), and the deposit.confirmed webhook already creates it lazily
      // on completion (see webhooks/handlers/deposit.handler.ts) if this doesn't run first.
      await ensureCustomerWalletAccount(app.prisma, customer.id, request.body.walletCurrencyCode);

      return reply.send(result);
    },
  );
}
