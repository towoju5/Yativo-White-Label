import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { reconciliationReportSchema, paginationQuerySchema, paginatedResponseSchema, yativoWalletBalanceSchema } from "@white-label/shared-types";
import { z } from "zod";
import { requireStaffAuth, requirePermission } from "../../middleware/requireStaffAuth.js";
import { yativoClient } from "../../lib/yativoClient.js";
import { listReconciliationReports, runReconciliation, reconciliationReportToDto, getYativoWalletBalances } from "./reconciliation.service.js";

export async function reconciliationRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/admin/reconciliation",
    {
      preHandler: requireStaffAuth,
      schema: { querystring: paginationQuerySchema, response: { 200: paginatedResponseSchema(reconciliationReportSchema) } },
    },
    async (request, reply) => {
      const result = await listReconciliationReports(app.prisma, request.query.page, request.query.pageSize);
      return reply.send(result);
    },
  );

  server.post(
    "/admin/reconciliation/run",
    { preHandler: [requireStaffAuth, requirePermission("reconciliation.manage")], schema: { response: { 200: z.array(reconciliationReportSchema) } } },
    async (_request, reply) => {
      const reports = await runReconciliation(app.prisma, yativoClient);
      return reply.send(reports.map(reconciliationReportToDto));
    },
  );

  /** Live from Yativo, not cached — the platform's own Yativo wallet balances, including the internal "usdcc" card-funding wallet. Admin-only (see getYativoWalletBalances doc comment). */
  server.get(
    "/admin/wallets/yativo-balances",
    { preHandler: requireStaffAuth, schema: { response: { 200: z.array(yativoWalletBalanceSchema) } } },
    async (_request, reply) => {
      const balances = await getYativoWalletBalances(yativoClient);
      return reply.send(balances);
    },
  );
}
