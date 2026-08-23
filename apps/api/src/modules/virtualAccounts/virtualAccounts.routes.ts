import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { virtualAccountSchema, virtualAccountCurrencySchema, createVirtualAccountSchema } from "@white-label/shared-types";
import { requireCustomerAuth } from "../../middleware/requireCustomerAuth.js";
import { yativoClient } from "../../lib/yativoClient.js";
import { ensureYativoCustomer } from "../../lib/ensureYativoCustomer.js";
import { requireKycApprovedForService } from "../../lib/requireKycApproved.js";
import { AppError } from "../../lib/errors.js";
import { errorResponseSchema } from "../../lib/httpSchemas.js";

/**
 * Dedicated bank-transfer receiving accounts — a separate product from the native gateway
 * deposit flow in modules/deposits (one-off pay-ins via CODI/SPEI/etc.). A virtual account is
 * long-lived: provisioned once per currency, then reused for every incoming transfer.
 */
export async function virtualAccountsRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/portal/virtual-accounts/currencies",
    { preHandler: requireCustomerAuth, schema: { response: { 200: z.array(virtualAccountCurrencySchema) } } },
    async (request, reply) => {
      const customer = await app.prisma.customer.findUniqueOrThrow({ where: { id: request.customer!.sub } });
      await requireKycApprovedForService(app.prisma, "VIRTUAL_ACCOUNT", customer);
      const yativoCustomerId = await ensureYativoCustomer(app.prisma, customer);

      const [currencies, { endorsements }] = await Promise.all([
        yativoClient.fiat.virtualAccounts.listSupportedCurrencies(),
        yativoClient.fiat.customers.get(yativoCustomerId),
      ]);

      const result = currencies.map((c) => {
        if (!c.endorsement) {
          return { currency: c.currency, endorsement: null, eligible: true, endorsementStatus: null, hostedKycUrl: null };
        }
        const match = endorsements.find((e) => e.service === c.endorsement);
        return {
          currency: c.currency,
          endorsement: c.endorsement,
          eligible: match?.status === "approved",
          endorsementStatus: match?.status ?? null,
          hostedKycUrl: match?.hostedKycUrl ?? null,
        };
      });
      return reply.send(result);
    },
  );

  server.get(
    "/portal/virtual-accounts",
    { preHandler: requireCustomerAuth, schema: { response: { 200: z.array(virtualAccountSchema) } } },
    async (request, reply) => {
      const customer = await app.prisma.customer.findUniqueOrThrow({ where: { id: request.customer!.sub } });
      await requireKycApprovedForService(app.prisma, "VIRTUAL_ACCOUNT", customer);
      const yativoCustomerId = await ensureYativoCustomer(app.prisma, customer);
      const accounts = await yativoClient.fiat.virtualAccounts.listForCustomer(yativoCustomerId);
      return reply.send(accounts);
    },
  );

  server.post(
    "/portal/virtual-accounts",
    {
      preHandler: requireCustomerAuth,
      schema: { body: createVirtualAccountSchema, response: { 200: virtualAccountSchema, 404: errorResponseSchema } },
    },
    async (request, reply) => {
      const customer = await app.prisma.customer.findUniqueOrThrow({ where: { id: request.customer!.sub } });
      await requireKycApprovedForService(app.prisma, "VIRTUAL_ACCOUNT", customer);
      const yativoCustomerId = await ensureYativoCustomer(app.prisma, customer);

      const [currencies, { endorsements }] = await Promise.all([
        yativoClient.fiat.virtualAccounts.listSupportedCurrencies(),
        yativoClient.fiat.customers.get(yativoCustomerId),
      ]);
      const chosen = currencies.find((c) => c.currency === request.body.currency);
      if (!chosen) {
        throw new AppError(`${request.body.currency} isn't a supported virtual account currency.`, 404, "UNSUPPORTED_CURRENCY");
      }
      if (chosen.endorsement) {
        const match = endorsements.find((e) => e.service === chosen.endorsement);
        if (match?.status !== "approved") {
          throw new AppError(
            `This currency requires ${chosen.endorsement.replace(/_/g, " ")} verification before you can generate an account.`,
            409,
            "ENDORSEMENT_REQUIRED",
          );
        }
      }

      const account = await yativoClient.fiat.virtualAccounts.getOrCreate(yativoCustomerId, request.body.currency);
      return reply.send(account);
    },
  );
}
