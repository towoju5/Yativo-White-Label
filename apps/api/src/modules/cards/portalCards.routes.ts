import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  cardSchema,
  cardDetailSchema,
  portalIssueCardSchema,
  cardAmountSchema,
  cardRevealSchema,
  cardTransactionSchema,
  setAirlinePaymentsSchema,
} from "@white-label/shared-types";
import { requireCustomerAuth } from "../../middleware/requireCustomerAuth.js";
import { resolveEffectiveCustomerId } from "../../lib/portalPrincipal.js";
import { errorResponseSchema } from "../../lib/httpSchemas.js";
import {
  issueCard,
  freezeCard,
  unfreezeCard,
  terminateCard,
  revealCard,
  topupCard,
  withdrawFromCard,
  setCardAirlinePayments,
  listCardTransactions,
  listPortalCards,
  getCardDetail,
} from "./cards.service.js";

export async function portalCardsRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();
  const idParam = z.object({ id: z.string() });

  server.get(
    "/portal/cards",
    { preHandler: requireCustomerAuth, schema: { response: { 200: z.array(cardSchema) } } },
    async (request, reply) => {
      const cards = await listPortalCards(app.prisma, resolveEffectiveCustomerId(request.customer!));
      return reply.send(cards);
    },
  );

  server.post(
    "/portal/cards",
    { preHandler: requireCustomerAuth, schema: { body: portalIssueCardSchema, response: { 200: cardSchema, 409: errorResponseSchema } } },
    async (request, reply) => {
      const card = await issueCard(app.prisma, resolveEffectiveCustomerId(request.customer!), BigInt(request.body.amountMinor));
      return reply.send(card);
    },
  );

  server.get(
    "/portal/cards/:id",
    { preHandler: requireCustomerAuth, schema: { params: idParam, response: { 200: cardDetailSchema, 404: errorResponseSchema } } },
    async (request, reply) => {
      const card = await getCardDetail(app.prisma, request.params.id, resolveEffectiveCustomerId(request.customer!));
      return reply.send(card);
    },
  );

  // POST, not GET: this returns the full PAN + CVV in plaintext — deliberately not a cacheable,
  // URL-loggable GET. Only ever called from an explicit "reveal" click in the UI.
  server.post(
    "/portal/cards/:id/reveal",
    { preHandler: requireCustomerAuth, schema: { params: idParam, response: { 200: cardRevealSchema, 404: errorResponseSchema } } },
    async (request, reply) => {
      const reveal = await revealCard(app.prisma, request.params.id, resolveEffectiveCustomerId(request.customer!));
      return reply.send(reveal);
    },
  );

  server.get(
    "/portal/cards/:id/transactions",
    { preHandler: requireCustomerAuth, schema: { params: idParam, response: { 200: z.array(cardTransactionSchema), 404: errorResponseSchema } } },
    async (request, reply) => {
      const transactions = await listCardTransactions(app.prisma, request.params.id, resolveEffectiveCustomerId(request.customer!));
      return reply.send(transactions);
    },
  );

  server.post(
    "/portal/cards/:id/topup",
    { preHandler: requireCustomerAuth, schema: { params: idParam, body: cardAmountSchema, response: { 200: cardSchema, 409: errorResponseSchema } } },
    async (request, reply) => {
      const card = await topupCard(app.prisma, request.params.id, BigInt(request.body.amountMinor), resolveEffectiveCustomerId(request.customer!));
      return reply.send(card);
    },
  );

  server.post(
    "/portal/cards/:id/withdraw",
    { preHandler: requireCustomerAuth, schema: { params: idParam, body: cardAmountSchema, response: { 200: cardSchema, 409: errorResponseSchema } } },
    async (request, reply) => {
      const card = await withdrawFromCard(app.prisma, request.params.id, BigInt(request.body.amountMinor), resolveEffectiveCustomerId(request.customer!));
      return reply.send(card);
    },
  );

  server.post(
    "/portal/cards/:id/freeze",
    { preHandler: requireCustomerAuth, schema: { params: idParam, response: { 200: cardSchema, 404: errorResponseSchema } } },
    async (request, reply) => {
      const card = await freezeCard(app.prisma, request.params.id, resolveEffectiveCustomerId(request.customer!));
      return reply.send(card);
    },
  );

  server.post(
    "/portal/cards/:id/unfreeze",
    { preHandler: requireCustomerAuth, schema: { params: idParam, response: { 200: cardSchema, 404: errorResponseSchema } } },
    async (request, reply) => {
      const card = await unfreezeCard(app.prisma, request.params.id, resolveEffectiveCustomerId(request.customer!));
      return reply.send(card);
    },
  );

  server.post(
    "/portal/cards/:id/airline-payments",
    { preHandler: requireCustomerAuth, schema: { params: idParam, body: setAirlinePaymentsSchema, response: { 200: cardSchema, 404: errorResponseSchema } } },
    async (request, reply) => {
      const card = await setCardAirlinePayments(app.prisma, request.params.id, request.body.enabled, resolveEffectiveCustomerId(request.customer!));
      return reply.send(card);
    },
  );

  // Not DELETE /cards/:id — Yativo's delete-card route is broken server-side (throws on every
  // call per the integration guide); terminate is the real, permanent way to disable a card.
  server.post(
    "/portal/cards/:id/terminate",
    { preHandler: requireCustomerAuth, schema: { params: idParam, response: { 200: cardSchema, 404: errorResponseSchema } } },
    async (request, reply) => {
      const card = await terminateCard(app.prisma, request.params.id, resolveEffectiveCustomerId(request.customer!));
      return reply.send(card);
    },
  );
}
