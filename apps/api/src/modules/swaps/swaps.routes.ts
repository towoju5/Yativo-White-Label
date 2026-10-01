import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createSwapSchema, swapOptionsSchema, swapQuoteRequestSchema, swapQuoteSchema, swapSchema } from "@white-label/shared-types";
import { requireCustomerAuth } from "../../middleware/requireCustomerAuth.js";
import { requirePortalPermission } from "../../middleware/requirePortalPermission.js";
import { resolveEffectiveCustomerId } from "../../lib/portalPrincipal.js";
import { errorResponseSchema } from "../../lib/httpSchemas.js";
import { requirePortalMenu } from "../portalMenus/portalMenus.service.js";
import { createSwap, getSwapOptions, listSwaps, quoteSwap } from "./swaps.service.js";

/** Every route here is off until an admin enables the "swap" menu (Settings → Customer menu). */
export async function portalSwapsRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();
  const gate = requirePortalMenu("swap");

  server.get(
    "/portal/swaps/options",
    { preHandler: [requireCustomerAuth, gate, requirePortalPermission("wallets.view")], schema: { response: { 200: swapOptionsSchema, 503: errorResponseSchema } } },
    async (_request, reply) => reply.send(await getSwapOptions(app.prisma, app.redis)),
  );

  server.post(
    "/portal/swaps/quote",
    {
      preHandler: [requireCustomerAuth, gate, requirePortalPermission("wallets.transfer")],
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
      schema: { body: swapQuoteRequestSchema, response: { 200: swapQuoteSchema, 404: errorResponseSchema, 422: errorResponseSchema, 503: errorResponseSchema } },
    },
    async (request, reply) => reply.send(await quoteSwap(app.prisma, app.redis, resolveEffectiveCustomerId(request.customer!), request.body)),
  );

  server.post(
    "/portal/swaps",
    {
      preHandler: [requireCustomerAuth, gate, requirePortalPermission("wallets.transfer")],
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: { body: createSwapSchema, response: { 200: swapSchema, 404: errorResponseSchema, 409: errorResponseSchema } },
    },
    async (request, reply) => reply.send(await createSwap(app.prisma, app.redis, resolveEffectiveCustomerId(request.customer!), request.body.quoteId)),
  );

  server.get(
    "/portal/swaps",
    {
      preHandler: [requireCustomerAuth, gate, requirePortalPermission("wallets.view")],
      schema: { querystring: z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) }), response: { 200: z.array(swapSchema) } },
    },
    async (request, reply) => reply.send(await listSwaps(app.prisma, resolveEffectiveCustomerId(request.customer!), request.query.limit)),
  );
}
