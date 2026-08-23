import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  adminCardListItemSchema,
  cardSchema,
  cardDetailSchema,
  issueCardSchema,
  cardRevealSchema,
  cardTransactionSchema,
  paginationQuerySchema,
  paginatedResponseSchema,
} from "@white-label/shared-types";
import { requireStaffAuth, requirePermission } from "../../middleware/requireStaffAuth.js";
import { errorResponseSchema } from "../../lib/httpSchemas.js";
import { issueCard, freezeCard, unfreezeCard, terminateCard, revealCard, listCardTransactions, listAdminCards, getCardDetail } from "./cards.service.js";

export async function adminCardsRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();
  const idParam = z.object({ id: z.string() });

  server.get(
    "/admin/cards",
    {
      preHandler: requireStaffAuth,
      schema: { querystring: paginationQuerySchema, response: { 200: paginatedResponseSchema(adminCardListItemSchema) } },
    },
    async (request, reply) => {
      const result = await listAdminCards(app.prisma, request.query.page, request.query.pageSize);
      return reply.send(result);
    },
  );

  server.post(
    "/admin/cards/issue",
    { preHandler: [requireStaffAuth, requirePermission("cards.manage")], schema: { body: issueCardSchema, response: { 200: cardSchema, 404: errorResponseSchema } } },
    async (request, reply) => {
      const card = await issueCard(app.prisma, request.body.customerId, BigInt(request.body.amountMinor));
      return reply.send(card);
    },
  );

  server.get(
    "/admin/cards/:id",
    { preHandler: requireStaffAuth, schema: { params: idParam, response: { 200: cardDetailSchema, 404: errorResponseSchema } } },
    async (request, reply) => {
      const card = await getCardDetail(app.prisma, request.params.id);
      return reply.send(card);
    },
  );

  // POST, not GET — see the portal route's doc comment: full PAN + CVV in plaintext.
  server.post(
    "/admin/cards/:id/reveal",
    { preHandler: [requireStaffAuth, requirePermission("cards.manage")], schema: { params: idParam, response: { 200: cardRevealSchema, 404: errorResponseSchema } } },
    async (request, reply) => {
      const reveal = await revealCard(app.prisma, request.params.id);
      return reply.send(reveal);
    },
  );

  server.get(
    "/admin/cards/:id/transactions",
    { preHandler: requireStaffAuth, schema: { params: idParam, response: { 200: z.array(cardTransactionSchema), 404: errorResponseSchema } } },
    async (request, reply) => {
      const transactions = await listCardTransactions(app.prisma, request.params.id);
      return reply.send(transactions);
    },
  );

  server.post(
    "/admin/cards/:id/freeze",
    { preHandler: [requireStaffAuth, requirePermission("cards.manage")], schema: { params: idParam, response: { 200: cardSchema, 404: errorResponseSchema } } },
    async (request, reply) => {
      const card = await freezeCard(app.prisma, request.params.id);
      return reply.send(card);
    },
  );

  server.post(
    "/admin/cards/:id/unfreeze",
    { preHandler: [requireStaffAuth, requirePermission("cards.manage")], schema: { params: idParam, response: { 200: cardSchema, 404: errorResponseSchema } } },
    async (request, reply) => {
      const card = await unfreezeCard(app.prisma, request.params.id);
      return reply.send(card);
    },
  );

  server.post(
    "/admin/cards/:id/terminate",
    { preHandler: [requireStaffAuth, requirePermission("cards.manage")], schema: { params: idParam, response: { 200: cardSchema, 404: errorResponseSchema } } },
    async (request, reply) => {
      const card = await terminateCard(app.prisma, request.params.id);
      return reply.send(card);
    },
  );
}
