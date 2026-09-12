import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { sessionSchema } from "@white-label/shared-types";
import { requireCustomerAuth } from "../../middleware/requireCustomerAuth.js";
import { resolveEffectiveCustomerId } from "../../lib/portalPrincipal.js";
import { errorResponseSchema } from "../../lib/httpSchemas.js";
import { NotFoundError } from "../../lib/errors.js";

/** Active-device list backed by CustomerRefreshToken rows — see SessionMeta/issueSession in portalAuth.service.ts for how ip/userAgent/lastUsedAt get populated, and PortalAccessClaims.sessionId for how "isCurrent" is determined. */
export async function sessionsRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/portal/security/sessions",
    { preHandler: requireCustomerAuth, schema: { response: { 200: z.array(sessionSchema) } } },
    async (request, reply) => {
      const customerId = resolveEffectiveCustomerId(request.customer!);
      const sessions = await app.prisma.customerRefreshToken.findMany({
        where: { customerId, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { lastUsedAt: "desc" },
      });
      return reply.send(
        sessions.map((s) => ({
          id: s.id,
          ip: s.ip,
          userAgent: s.userAgent,
          createdAt: s.createdAt.toISOString(),
          lastUsedAt: s.lastUsedAt?.toISOString() ?? null,
          isCurrent: s.id === request.customer!.sessionId,
        })),
      );
    },
  );

  server.delete(
    "/portal/security/sessions/:id",
    {
      preHandler: requireCustomerAuth,
      schema: { params: z.object({ id: z.string() }), response: { 204: z.void(), 404: errorResponseSchema } },
    },
    async (request, reply) => {
      const customerId = resolveEffectiveCustomerId(request.customer!);
      const session = await app.prisma.customerRefreshToken.findFirst({ where: { id: request.params.id, customerId, revokedAt: null } });
      if (!session) throw new NotFoundError("Session");
      await app.prisma.customerRefreshToken.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
      return reply.code(204).send();
    },
  );
}
