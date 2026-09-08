import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  adminBusinessSpendCardListItemSchema,
  businessSpendCardSchema,
  issueBusinessSpendCardSchema,
  businessSpendCardWalletActionSchema,
  businessSpendCardWalletActionResultSchema,
  businessSpendCardStatusActionSchema,
  businessSpendCardPinSchema,
  businessSpendCardLimitsSchema,
  businessSpendCardTransactionSchema,
  paginationQuerySchema,
  paginatedResponseSchema,
} from "@white-label/shared-types";
import { requireStaffAuth, requirePermission } from "../../middleware/requireStaffAuth.js";
import { errorResponseSchema } from "../../lib/httpSchemas.js";
import {
  issueBusinessSpendCard,
  fundBusinessSpendCard,
  withdrawBusinessSpendCard,
  updateBusinessSpendCardStatus,
  setBusinessSpendCardPin,
  updateBusinessSpendCardLimits,
  listBusinessSpendCardTransactions,
  listAdminBusinessSpendCards,
} from "./businessSpendCards.service.js";

export async function adminBusinessSpendCardsRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();
  const idParam = z.object({ id: z.string() });

  server.get(
    "/admin/business-spend-cards",
    { preHandler: requireStaffAuth, schema: { querystring: paginationQuerySchema, response: { 200: paginatedResponseSchema(adminBusinessSpendCardListItemSchema) } } },
    async (request, reply) => {
      const result = await listAdminBusinessSpendCards(app.prisma, request.query.page, request.query.pageSize);
      return reply.send(result);
    },
  );

  server.post(
    "/admin/business-spend-cards",
    {
      preHandler: [requireStaffAuth, requirePermission("businessSpendCards.manage")],
      schema: { body: issueBusinessSpendCardSchema, response: { 200: businessSpendCardSchema, 403: errorResponseSchema, 404: errorResponseSchema } },
    },
    async (request, reply) => {
      const card = await issueBusinessSpendCard(app.prisma, request.body.customerId, request.body.cardType);
      return reply.send(card);
    },
  );

  server.post(
    "/admin/business-spend-cards/:id/wallet",
    {
      preHandler: [requireStaffAuth, requirePermission("businessSpendCards.manage")],
      schema: { params: idParam, body: businessSpendCardWalletActionSchema, response: { 200: businessSpendCardWalletActionResultSchema, 404: errorResponseSchema, 409: errorResponseSchema } },
    },
    async (request, reply) => {
      const amountMinor = BigInt(request.body.amountMinor);
      const result =
        request.body.action === "fund"
          ? await fundBusinessSpendCard(app.prisma, request.params.id, amountMinor)
          : await withdrawBusinessSpendCard(app.prisma, request.params.id, amountMinor);
      return reply.send(result);
    },
  );

  server.post(
    "/admin/business-spend-cards/:id/status",
    {
      preHandler: [requireStaffAuth, requirePermission("businessSpendCards.manage")],
      schema: { params: idParam, body: businessSpendCardStatusActionSchema, response: { 200: businessSpendCardSchema, 404: errorResponseSchema } },
    },
    async (request, reply) => {
      const card = await updateBusinessSpendCardStatus(app.prisma, request.params.id, request.body.action);
      return reply.send(card);
    },
  );

  server.post(
    "/admin/business-spend-cards/:id/pin",
    {
      preHandler: [requireStaffAuth, requirePermission("businessSpendCards.manage")],
      schema: { params: idParam, body: businessSpendCardPinSchema, response: { 200: businessSpendCardSchema, 404: errorResponseSchema } },
    },
    async (request, reply) => {
      const card = await setBusinessSpendCardPin(app.prisma, request.params.id, request.body.pin, request.body.reasonCode, request.body.comment);
      return reply.send(card);
    },
  );

  server.put(
    "/admin/business-spend-cards/:id/limits",
    {
      preHandler: [requireStaffAuth, requirePermission("businessSpendCards.manage")],
      schema: { params: idParam, body: businessSpendCardLimitsSchema, response: { 200: z.object({ card: businessSpendCardSchema, limits: z.array(z.record(z.unknown())) }), 404: errorResponseSchema } },
    },
    async (request, reply) => {
      const result = await updateBusinessSpendCardLimits(app.prisma, request.params.id, request.body.limits);
      return reply.send(result);
    },
  );

  server.get(
    "/admin/business-spend-cards/:id/transactions",
    { preHandler: requireStaffAuth, schema: { params: idParam, response: { 200: z.array(businessSpendCardTransactionSchema), 404: errorResponseSchema } } },
    async (request, reply) => {
      const transactions = await listBusinessSpendCardTransactions(app.prisma, request.params.id);
      return reply.send(transactions);
    },
  );
}
