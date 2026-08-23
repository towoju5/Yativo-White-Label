import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { dashboardSummarySchema } from "@white-label/shared-types";
import { requireStaffAuth } from "../../middleware/requireStaffAuth.js";
import { getDashboardSummary } from "./dashboard.service.js";

export async function dashboardRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/admin/dashboard/summary",
    { preHandler: requireStaffAuth, schema: { response: { 200: dashboardSummarySchema } } },
    async (_request, reply) => {
      const summary = await getDashboardSummary(app.prisma);
      return reply.send(summary);
    },
  );
}
