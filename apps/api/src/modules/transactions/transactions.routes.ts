import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  adminTransactionListItemSchema,
  paginationQuerySchema,
  paginatedResponseSchema,
  transactionDetailSchema,
  LEDGER_TRANSACTION_TYPES,
  LEDGER_TRANSACTION_STATUSES,
  currencyCodeSchema,
} from "@white-label/shared-types";
import { requireStaffAuth, requireRole } from "../../middleware/requireStaffAuth.js";
import { requireCustomerAuth } from "../../middleware/requireCustomerAuth.js";
import { errorResponseSchema } from "../../lib/httpSchemas.js";
import { listLedgerTransactions, adminSettleTransaction, adminReverseTransaction } from "./transactions.service.js";
import { getTransactionDetailForCustomer } from "../wallets/wallets.service.js";

const adjustBodySchema = z.object({ reason: z.string().min(1, "A reason is required") });

const listQuerySchema = paginationQuerySchema.extend({
  type: z.enum(LEDGER_TRANSACTION_TYPES).optional(),
  status: z.enum(LEDGER_TRANSACTION_STATUSES).optional(),
  customerId: z.string().optional(),
  currencyCode: currencyCodeSchema.optional(),
});

export async function transactionsRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/portal/transactions/:id",
    {
      preHandler: requireCustomerAuth,
      schema: { params: z.object({ id: z.string() }), response: { 200: transactionDetailSchema, 404: errorResponseSchema } },
    },
    async (request, reply) => {
      const detail = await getTransactionDetailForCustomer(app.prisma, request.customer!.sub, request.params.id);
      return reply.send(detail);
    },
  );

  server.get(
    "/admin/transactions",
    {
      preHandler: requireStaffAuth,
      schema: { querystring: listQuerySchema, response: { 200: paginatedResponseSchema(adminTransactionListItemSchema) } },
    },
    async (request, reply) => {
      const { page, pageSize, type, status, customerId, currencyCode } = request.query;
      const result = await listLedgerTransactions(app.prisma, { type, status, customerId, currencyCode }, page, pageSize);
      return reply.send(result);
    },
  );

  server.post(
    "/admin/transactions/:id/settle",
    {
      preHandler: [requireStaffAuth, requireRole("OWNER", "ADMIN")],
      schema: { params: z.object({ id: z.string() }), body: adjustBodySchema, response: { 200: z.object({ id: z.string(), status: z.string() }), 404: errorResponseSchema, 409: errorResponseSchema } },
    },
    async (request, reply) => {
      const tx = await adminSettleTransaction(app.prisma, request.params.id, request.body.reason);
      return reply.send({ id: tx.id, status: tx.status });
    },
  );

  server.post(
    "/admin/transactions/:id/reverse",
    {
      preHandler: [requireStaffAuth, requireRole("OWNER", "ADMIN")],
      schema: { params: z.object({ id: z.string() }), body: adjustBodySchema, response: { 200: z.object({ id: z.string(), status: z.string() }), 404: errorResponseSchema, 409: errorResponseSchema } },
    },
    async (request, reply) => {
      const tx = await adminReverseTransaction(app.prisma, request.params.id, request.body.reason);
      return reply.send({ id: tx.id, status: tx.status });
    },
  );
}
