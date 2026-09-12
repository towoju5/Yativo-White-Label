import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { adminAuditLogEntrySchema, paginationQuerySchema, paginatedResponseSchema } from "@white-label/shared-types";
import { requireStaffAuth, requireRole } from "../../middleware/requireStaffAuth.js";
import { SYSTEM_ACTOR_ID } from "../../lib/adminAuditLog.js";

const listQuerySchema = paginationQuerySchema.extend({
  target: z.string().min(1).optional(),
  action: z.string().min(1).optional(),
});

export async function adminAuditLogRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/admin/audit-log",
    {
      // Who-did-what for every admin-visible mutation — restricted to OWNER/ADMIN, same tier as
      // the settle/reverse actions it records.
      preHandler: [requireStaffAuth, requireRole("OWNER", "ADMIN")],
      schema: { querystring: listQuerySchema, response: { 200: paginatedResponseSchema(adminAuditLogEntrySchema) } },
    },
    async (request, reply) => {
      const { page, pageSize, target, action } = request.query;
      const where = {
        ...(target ? { target: { contains: target, mode: "insensitive" as const } } : {}),
        ...(action ? { action } : {}),
      };

      const [total, entries] = await Promise.all([
        app.prisma.adminAuditLog.count({ where }),
        app.prisma.adminAuditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      ]);

      const staffIds = [...new Set(entries.map((e) => e.actorId).filter((id) => id !== SYSTEM_ACTOR_ID))];
      const staff = staffIds.length
        ? await app.prisma.staffUser.findMany({ where: { id: { in: staffIds } }, select: { id: true, email: true } })
        : [];
      const staffEmailById = new Map(staff.map((s) => [s.id, s.email]));

      return reply.send({
        items: entries.map((e) => ({
          id: e.id,
          actorId: e.actorId,
          actorLabel: e.actorId === SYSTEM_ACTOR_ID ? "System" : (staffEmailById.get(e.actorId) ?? null),
          action: e.action,
          target: e.target,
          metadata: (e.metadata as Record<string, unknown> | null) ?? null,
          createdAt: e.createdAt.toISOString(),
        })),
        total,
        page,
        pageSize,
      });
    },
  );
}
