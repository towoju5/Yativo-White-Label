import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  walletBalanceSchema,
  statementLineSchema,
  paginationQuerySchema,
  paginatedResponseSchema,
  portalWalletCurrencyOptionsSchema,
  addWalletCurrencySchema,
} from "@white-label/shared-types";
import { requireCustomerAuth } from "../../middleware/requireCustomerAuth.js";
import { resolveEffectiveCustomerId } from "../../lib/portalPrincipal.js";
import { errorResponseSchema } from "../../lib/httpSchemas.js";
import {
  listCustomerWallets,
  getWalletStatement,
  getWalletForCustomer,
  getPortalWalletCurrencyOptions,
  addCustomerWalletCurrency,
  deleteCustomerWallet,
} from "./wallets.service.js";

export async function portalWalletsRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/portal/wallets",
    { preHandler: requireCustomerAuth, schema: { response: { 200: z.array(walletBalanceSchema) } } },
    async (request, reply) => {
      const wallets = await listCustomerWallets(app.prisma, resolveEffectiveCustomerId(request.customer!));
      return reply.send(wallets);
    },
  );

  server.get(
    "/portal/wallets/currencies",
    { preHandler: requireCustomerAuth, schema: { response: { 200: portalWalletCurrencyOptionsSchema } } },
    async (request, reply) => {
      const options = await getPortalWalletCurrencyOptions(app.prisma, resolveEffectiveCustomerId(request.customer!));
      return reply.send(options);
    },
  );

  server.post(
    "/portal/wallets",
    {
      preHandler: requireCustomerAuth,
      schema: { body: addWalletCurrencySchema, response: { 200: walletBalanceSchema, 404: errorResponseSchema, 409: errorResponseSchema } },
    },
    async (request, reply) => {
      const wallet = await addCustomerWalletCurrency(app.prisma, resolveEffectiveCustomerId(request.customer!), request.body.currencyCode);
      return reply.send(wallet);
    },
  );

  server.delete(
    "/portal/wallets/:id",
    {
      preHandler: requireCustomerAuth,
      schema: { params: z.object({ id: z.string() }), response: { 204: z.void(), 404: errorResponseSchema, 409: errorResponseSchema } },
    },
    async (request, reply) => {
      await deleteCustomerWallet(app.prisma, resolveEffectiveCustomerId(request.customer!), request.params.id);
      return reply.code(204).send();
    },
  );

  server.get(
    "/portal/wallets/:id/statement",
    {
      preHandler: requireCustomerAuth,
      schema: {
        params: z.object({ id: z.string() }),
        querystring: paginationQuerySchema,
        response: { 200: paginatedResponseSchema(statementLineSchema), 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const wallet = await getWalletForCustomer(app.prisma, resolveEffectiveCustomerId(request.customer!), request.params.id);
      const result = await getWalletStatement(app.prisma, wallet.accountId, wallet.account.type, request.query.page, request.query.pageSize);
      return reply.send(result);
    },
  );
}
