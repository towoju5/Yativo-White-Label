import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { CRYPTO_DEPOSIT_CURRENCIES, cryptoWalletSchema, cryptoDepositSchema, createCryptoWalletSchema } from "@white-label/shared-types";
import { requireCustomerAuth } from "../../middleware/requireCustomerAuth.js";
import { resolveEffectiveCustomerId } from "../../lib/portalPrincipal.js";
import { requireKycApprovedForService } from "../../lib/requireKycApproved.js";
import { listMyCryptoWallets, getOrCreateMyCryptoWallet, listMyCryptoDeposits } from "./cryptoWallets.service.js";

export async function portalCryptoWalletsRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/portal/crypto/currencies",
    { preHandler: requireCustomerAuth, schema: { response: { 200: z.array(z.string()) } } },
    async (_request, reply) => reply.send([...CRYPTO_DEPOSIT_CURRENCIES]),
  );

  server.get(
    "/portal/crypto/wallets",
    { preHandler: requireCustomerAuth, schema: { response: { 200: z.array(cryptoWalletSchema) } } },
    async (request, reply) => {
      const wallets = await listMyCryptoWallets(resolveEffectiveCustomerId(request.customer!));
      return reply.send(wallets);
    },
  );

  server.post(
    "/portal/crypto/wallets",
    {
      preHandler: requireCustomerAuth,
      schema: { body: createCryptoWalletSchema.pick({ currency: true }), response: { 200: cryptoWalletSchema } },
    },
    async (request, reply) => {
      const customer = await app.prisma.customer.findUniqueOrThrow({ where: { id: resolveEffectiveCustomerId(request.customer!) } });
      await requireKycApprovedForService(app.prisma, "CRYPTO_WALLET", customer);
      const wallet = await getOrCreateMyCryptoWallet(customer.id, request.body.currency);
      return reply.send(wallet);
    },
  );

  server.get(
    "/portal/crypto/deposits",
    { preHandler: requireCustomerAuth, schema: { response: { 200: z.array(cryptoDepositSchema) } } },
    async (request, reply) => {
      const deposits = await listMyCryptoDeposits(resolveEffectiveCustomerId(request.customer!));
      return reply.send(deposits);
    },
  );
}
