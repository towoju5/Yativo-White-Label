import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { dashboardSummarySchema, platformProfitReportSchema } from "@white-label/shared-types";
import { requireStaffAuth } from "../../middleware/requireStaffAuth.js";
import { getDashboardSummary, getPlatformProfitReport } from "./dashboard.service.js";

const profitQuerySchema = z.object({
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

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

  server.get(
    "/admin/dashboard/profit",
    { preHandler: requireStaffAuth, schema: { querystring: profitQuerySchema, response: { 200: platformProfitReportSchema } } },
    async (request, reply) => {
      const report = await getPlatformProfitReport(app.prisma, { dateFrom: request.query.dateFrom, dateTo: request.query.dateTo });
      return reply.send(report);
    },
  );
}
