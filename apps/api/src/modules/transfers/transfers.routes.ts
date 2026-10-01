import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  createTransferSchema,
  transferLookupSchema,
  transferProfileSchema,
  transferQuoteQuerySchema,
  transferQuoteSchema,
  transferRecipientSchema,
  transferSchema,
} from "@white-label/shared-types";
import { requireCustomerAuth } from "../../middleware/requireCustomerAuth.js";
import { requirePortalPermission } from "../../middleware/requirePortalPermission.js";
import { resolveEffectiveCustomerId } from "../../lib/portalPrincipal.js";
import { errorResponseSchema } from "../../lib/httpSchemas.js";
import { createTransfer, getTransferProfile, listRecentRecipients, listTransfers, lookupRecipient, quoteTransfer } from "./transfers.service.js";

export async function portalTransfersRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/portal/transfers/profile",
    { preHandler: requireCustomerAuth, schema: { response: { 200: transferProfileSchema } } },
    async (request, reply) => reply.send(await getTransferProfile(app.prisma, resolveEffectiveCustomerId(request.customer!))),
  );

  // Tighter than the global limit — each call confirms whether an email/phone/id belongs to a
  // customer, so this is the endpoint someone would hammer to enumerate accounts.
  server.post(
    "/portal/transfers/lookup",
    {
      preHandler: [requireCustomerAuth, requirePortalPermission("wallets.transfer")],
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
      schema: { body: transferLookupSchema, response: { 200: transferRecipientSchema, 404: errorResponseSchema, 409: errorResponseSchema } },
    },
    async (request, reply) => reply.send(await lookupRecipient(app.prisma, resolveEffectiveCustomerId(request.customer!), request.body)),
  );

  server.get(
    "/portal/transfers/quote",
    { preHandler: [requireCustomerAuth, requirePortalPermission("wallets.transfer")], schema: { querystring: transferQuoteQuerySchema, response: { 200: transferQuoteSchema } } },
    async (request, reply) =>
      reply.send(await quoteTransfer(app.prisma, resolveEffectiveCustomerId(request.customer!), request.query.currencyCode, BigInt(request.query.amountMinor))),
  );

  server.post(
    "/portal/transfers",
    {
      preHandler: [requireCustomerAuth, requirePortalPermission("wallets.transfer")],
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: { body: createTransferSchema, response: { 200: transferSchema, 404: errorResponseSchema, 409: errorResponseSchema } },
    },
    async (request, reply) => reply.send(await createTransfer(app.prisma, resolveEffectiveCustomerId(request.customer!), request.body)),
  );

  server.get(
    "/portal/transfers",
    {
      preHandler: [requireCustomerAuth, requirePortalPermission("wallets.view")],
      schema: { querystring: z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) }), response: { 200: z.array(transferSchema) } },
    },
    async (request, reply) => reply.send(await listTransfers(app.prisma, resolveEffectiveCustomerId(request.customer!), request.query.limit)),
  );

  server.get(
    "/portal/transfers/recent-recipients",
    { preHandler: [requireCustomerAuth, requirePortalPermission("wallets.transfer")], schema: { response: { 200: z.array(transferRecipientSchema) } } },
    async (request, reply) => reply.send(await listRecentRecipients(app.prisma, resolveEffectiveCustomerId(request.customer!))),
  );
}
