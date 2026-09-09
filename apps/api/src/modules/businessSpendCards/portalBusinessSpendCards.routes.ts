import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  businessSpendCardSchema,
  portalIssueBusinessSpendCardSchema,
  businessSpendCardWalletActionSchema,
  businessSpendCardWalletActionResultSchema,
  businessSpendCardStatusActionSchema,
  businessSpendCardPinSchema,
  businessSpendCardLimitsSchema,
  businessSpendCardTransactionSchema,
} from "@white-label/shared-types";
import { requireCustomerAuth } from "../../middleware/requireCustomerAuth.js";
import { requirePortalPermission } from "../../middleware/requirePortalPermission.js";
import { resolveEffectiveCustomerId } from "../../lib/portalPrincipal.js";
import { errorResponseSchema } from "../../lib/httpSchemas.js";
import {
  issueBusinessSpendCard,
  fundBusinessSpendCard,
  withdrawBusinessSpendCard,
  updateBusinessSpendCardStatus,
  setBusinessSpendCardPin,
  updateBusinessSpendCardLimits,
  listBusinessSpendCardTransactions,
  listPortalBusinessSpendCards,
} from "./businessSpendCards.service.js";

export async function portalBusinessSpendCardsRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();
  const idParam = z.object({ id: z.string() });

  server.get(
    "/portal/business-spend-cards",
    { preHandler: [requireCustomerAuth, requirePortalPermission("cards.manage")], schema: { response: { 200: z.array(businessSpendCardSchema) } } },
    async (request, reply) => {
      const cards = await listPortalBusinessSpendCards(app.prisma, resolveEffectiveCustomerId(request.customer!));
      return reply.send(cards);
    },
  );

  server.post(
    "/portal/business-spend-cards",
    { preHandler: [requireCustomerAuth, requirePortalPermission("cards.manage")], schema: { body: portalIssueBusinessSpendCardSchema, response: { 200: businessSpendCardSchema, 403: errorResponseSchema } } },
    async (request, reply) => {
      const card = await issueBusinessSpendCard(app.prisma, resolveEffectiveCustomerId(request.customer!), request.body.cardType);
      return reply.send(card);
    },
  );

  server.post(
    "/portal/business-spend-cards/:id/wallet",
    {
      preHandler: [requireCustomerAuth, requirePortalPermission("cards.manage")],
      schema: { params: idParam, body: businessSpendCardWalletActionSchema, response: { 200: businessSpendCardWalletActionResultSchema, 404: errorResponseSchema, 409: errorResponseSchema } },
    },
    async (request, reply) => {
      const amountMinor = BigInt(request.body.amountMinor);
      const scopeCustomerId = resolveEffectiveCustomerId(request.customer!);
      const result =
        request.body.action === "fund"
          ? await fundBusinessSpendCard(app.prisma, request.params.id, amountMinor, scopeCustomerId)
          : await withdrawBusinessSpendCard(app.prisma, request.params.id, amountMinor, scopeCustomerId);
      return reply.send(result);
    },
  );

  server.post(
    "/portal/business-spend-cards/:id/status",
    {
      preHandler: [requireCustomerAuth, requirePortalPermission("cards.manage")],
      schema: { params: idParam, body: businessSpendCardStatusActionSchema, response: { 200: businessSpendCardSchema, 404: errorResponseSchema } },
    },
    async (request, reply) => {
      const card = await updateBusinessSpendCardStatus(app.prisma, request.params.id, request.body.action, resolveEffectiveCustomerId(request.customer!));
      return reply.send(card);
    },
  );

  server.post(
    "/portal/business-spend-cards/:id/pin",
    { preHandler: [requireCustomerAuth, requirePortalPermission("cards.manage")], schema: { params: idParam, body: businessSpendCardPinSchema, response: { 200: businessSpendCardSchema, 404: errorResponseSchema } } },
    async (request, reply) => {
      const card = await setBusinessSpendCardPin(
        app.prisma,
        request.params.id,
        request.body.pin,
        request.body.reasonCode,
        request.body.comment,
        resolveEffectiveCustomerId(request.customer!),
      );
      return reply.send(card);
    },
  );

  server.put(
    "/portal/business-spend-cards/:id/limits",
    {
      preHandler: [requireCustomerAuth, requirePortalPermission("cards.manage")],
      schema: { params: idParam, body: businessSpendCardLimitsSchema, response: { 200: z.object({ card: businessSpendCardSchema, limits: z.array(z.record(z.unknown())) }), 404: errorResponseSchema } },
    },
    async (request, reply) => {
      const result = await updateBusinessSpendCardLimits(app.prisma, request.params.id, request.body.limits, resolveEffectiveCustomerId(request.customer!));
      return reply.send(result);
    },
  );

  server.get(
    "/portal/business-spend-cards/:id/transactions",
    { preHandler: [requireCustomerAuth, requirePortalPermission("cards.manage")], schema: { params: idParam, response: { 200: z.array(businessSpendCardTransactionSchema), 404: errorResponseSchema } } },
    async (request, reply) => {
      const transactions = await listBusinessSpendCardTransactions(app.prisma, request.params.id, resolveEffectiveCustomerId(request.customer!));
      return reply.send(transactions);
    },
  );
}
