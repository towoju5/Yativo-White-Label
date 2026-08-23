import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { apiKeySchema, createApiKeySchema, createApiKeyResultSchema } from "@white-label/shared-types";
import { requireStaffAuth, requirePermission } from "../../middleware/requireStaffAuth.js";
import { errorResponseSchema } from "../../lib/httpSchemas.js";
import { listApiKeys, createApiKey, revokeApiKey } from "./apiKeys.service.js";

export async function apiKeysRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/admin/api-keys",
    { preHandler: requireStaffAuth, schema: { response: { 200: z.array(apiKeySchema) } } },
    async (_request, reply) => {
      const keys = await listApiKeys(app.prisma);
      return reply.send(keys);
    },
  );

  server.post(
    "/admin/api-keys",
    { preHandler: [requireStaffAuth, requirePermission("api_keys.manage")], schema: { body: createApiKeySchema, response: { 200: createApiKeyResultSchema } } },
    async (request, reply) => {
      const key = await createApiKey(app.prisma, request.staffUser!.sub, request.body.name);
      return reply.send(key);
    },
  );

  server.delete(
    "/admin/api-keys/:id",
    {
      preHandler: [requireStaffAuth, requirePermission("api_keys.manage")],
      schema: { params: z.object({ id: z.string() }), response: { 204: z.void(), 404: errorResponseSchema } },
    },
    async (request, reply) => {
      await revokeApiKey(app.prisma, request.params.id);
      return reply.code(204).send();
    },
  );
}
