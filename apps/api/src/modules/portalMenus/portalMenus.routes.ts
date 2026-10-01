import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { portalMenuKeySchema, portalMenuSchema, portalMenusResponseSchema, updatePortalMenuSchema } from "@white-label/shared-types";
import { requireStaffAuth, requireRole } from "../../middleware/requireStaffAuth.js";
import { logAdminAction } from "../../lib/adminAuditLog.js";
import { listPortalMenus, setPortalMenuEnabled } from "./portalMenus.service.js";

export async function portalMenusRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  // Public — same access model as GET /nav-labels: the portal shell reads it to decide which nav
  // items to render, and it reveals nothing beyond which features this deployment offers.
  server.get("/portal-menus", { schema: { response: { 200: portalMenusResponseSchema } } }, async (_request, reply) => {
    reply.send(await listPortalMenus(app.prisma));
  });

  server.put(
    "/admin/portal-menus/:key",
    {
      preHandler: [requireStaffAuth, requireRole("OWNER", "ADMIN")],
      schema: { params: z.object({ key: portalMenuKeySchema }), body: updatePortalMenuSchema, response: { 200: portalMenuSchema } },
    },
    async (request, reply) => {
      const menu = await setPortalMenuEnabled(app.prisma, request.params.key, request.body.enabled);
      await logAdminAction(app.prisma, request.staffUser!.sub, "portal_menu.toggle", `portal_menu:${request.params.key}`, { enabled: request.body.enabled });
      return reply.send(menu);
    },
  );
}
