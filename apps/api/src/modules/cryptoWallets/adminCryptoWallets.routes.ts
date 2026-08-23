import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  CRYPTO_DEPOSIT_CURRENCIES,
  cryptoWalletSchema,
  cryptoDepositSchema,
  createCryptoWalletSchema,
  paginationQuerySchema,
  paginatedResponseSchema,
} from "@white-label/shared-types";
import { requireStaffAuth, requirePermission } from "../../middleware/requireStaffAuth.js";
import { errorResponseSchema } from "../../lib/httpSchemas.js";
import { listCryptoWallets, createCryptoWallet, deleteCryptoWallet, listCryptoDeposits } from "./cryptoWallets.service.js";

export async function adminCryptoWalletsRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  // No lookup endpoint exists for this on Yativo's side — see CRYPTO_DEPOSIT_CURRENCIES' doc comment.
  server.get(
    "/admin/crypto/currencies",
    { preHandler: requireStaffAuth, schema: { response: { 200: z.array(z.string()) } } },
    async (_request, reply) => reply.send([...CRYPTO_DEPOSIT_CURRENCIES]),
  );

  server.get(
    "/admin/crypto/wallets",
    {
      preHandler: requireStaffAuth,
      schema: { querystring: paginationQuerySchema, response: { 200: paginatedResponseSchema(cryptoWalletSchema) } },
    },
    async (request, reply) => {
      const result = await listCryptoWallets(request.query.page, request.query.pageSize);
      return reply.send(result);
    },
  );

  server.post(
    "/admin/crypto/wallets",
    { preHandler: [requireStaffAuth, requirePermission("crypto.manage")], schema: { body: createCryptoWalletSchema, response: { 200: cryptoWalletSchema } } },
    async (request, reply) => {
      const wallet = await createCryptoWallet(request.body.currency, request.body.customerId);
      return reply.send(wallet);
    },
  );

  server.delete(
    "/admin/crypto/wallets/:id",
    {
      preHandler: [requireStaffAuth, requirePermission("crypto.manage")],
      schema: { params: z.object({ id: z.string() }), response: { 204: z.void(), 404: errorResponseSchema } },
    },
    async (request, reply) => {
      await deleteCryptoWallet(request.params.id);
      return reply.code(204).send();
    },
  );

  server.get(
    "/admin/crypto/deposits",
    {
      preHandler: requireStaffAuth,
      schema: { querystring: paginationQuerySchema, response: { 200: paginatedResponseSchema(cryptoDepositSchema) } },
    },
    async (request, reply) => {
      const result = await listCryptoDeposits(request.query.page, request.query.pageSize);
      return reply.send(result);
    },
  );
}
