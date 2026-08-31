import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { exportStatementQuerySchema, emailStatementSchema } from "@white-label/shared-types";
import { requireCustomerAuth } from "../../middleware/requireCustomerAuth.js";
import { errorResponseSchema } from "../../lib/httpSchemas.js";
import { enqueueEmail } from "../../jobs/emailQueue.js";
import { getBranding } from "../branding/branding.service.js";
import { AppError, NotFoundError } from "../../lib/errors.js";
import { buildStatementDocument, renderStatementPdf, renderStatementExcel, statementFilename, statementContentType } from "./statements.service.js";

async function renderDocument(prisma: PrismaClient, customerId: string, walletId: string, format: "PDF" | "EXCEL", dateFrom: Date, dateTo: Date, productName: string) {
  if (dateFrom > dateTo) throw new AppError("The start date must be before the end date.", 400, "INVALID_RANGE");

  const wallet = await prisma.wallet.findFirst({ where: { id: walletId, customerId } });
  if (!wallet) throw new NotFoundError("Wallet");

  const doc = await buildStatementDocument(prisma, customerId, walletId, dateFrom, dateTo);
  const accountLabel = `${wallet.currencyCode} wallet`;
  const buffer = format === "PDF" ? await renderStatementPdf(doc, { productName, accountLabel }) : await renderStatementExcel(doc, { productName, accountLabel });
  return { doc, buffer };
}

export async function statementsRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/portal/wallets/:id/statement/export",
    {
      preHandler: requireCustomerAuth,
      schema: { params: z.object({ id: z.string() }), querystring: exportStatementQuerySchema, response: { 200: z.any(), 404: errorResponseSchema, 400: errorResponseSchema } },
    },
    async (request, reply) => {
      const branding = await getBranding(app.prisma);
      const { format, dateFrom, dateTo } = request.query;
      const { doc, buffer } = await renderDocument(app.prisma, request.customer!.sub, request.params.id, format, new Date(dateFrom), new Date(dateTo), branding.productName);

      reply.header("Content-Type", statementContentType(format));
      reply.header("Content-Disposition", `attachment; filename="${statementFilename(doc, format)}"`);
      return reply.send(buffer);
    },
  );

  server.post(
    "/portal/wallets/:id/statement/email",
    {
      preHandler: requireCustomerAuth,
      schema: {
        params: z.object({ id: z.string() }),
        body: emailStatementSchema,
        response: { 200: z.object({ sent: z.boolean(), to: z.string() }), 404: errorResponseSchema, 400: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const customer = await app.prisma.customer.findUniqueOrThrow({ where: { id: request.customer!.sub } });
      const branding = await getBranding(app.prisma);
      const { format, dateFrom, dateTo } = request.body;
      const { doc, buffer } = await renderDocument(app.prisma, request.customer!.sub, request.params.id, format, new Date(dateFrom), new Date(dateTo), branding.productName);

      await enqueueEmail({
        to: customer.email,
        subject: `Your ${doc.currencyCode} statement of account — ${branding.productName}`,
        html: `<p>Hi ${customer.fullName ?? customer.businessName ?? "there"},</p><p>Attached is your ${doc.currencyCode} statement of account for ${new Date(doc.dateFrom).toLocaleDateString()} – ${new Date(doc.dateTo).toLocaleDateString()}.</p>`,
        attachments: [{ filename: statementFilename(doc, format), contentBase64: buffer.toString("base64"), contentType: statementContentType(format) }],
      });

      return reply.send({ sent: true, to: customer.email });
    },
  );
}
