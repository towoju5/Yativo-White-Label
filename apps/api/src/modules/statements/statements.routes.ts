import type { FastifyInstance } from "fastify";
import type { PrismaClient, Customer } from "@prisma/client";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { BrandingConfig } from "@white-label/shared-types";
import { z } from "zod";
import { exportStatementQuerySchema, emailStatementSchema } from "@white-label/shared-types";
import { requireCustomerAuth } from "../../middleware/requireCustomerAuth.js";
import { resolveEffectiveCustomerId } from "../../lib/portalPrincipal.js";
import { errorResponseSchema } from "../../lib/httpSchemas.js";
import { enqueueEmail } from "../../jobs/emailQueue.js";
import { getBranding } from "../branding/branding.service.js";
import { AppError, NotFoundError } from "../../lib/errors.js";
import { env } from "../../config/env.js";
import { signStatementToken } from "../../lib/statementVerification.js";
import { buildStatementDocument, renderStatementPdf, renderStatementExcel, statementFilename, statementContentType } from "./statements.service.js";

async function renderDocument(
  prisma: PrismaClient,
  customer: Customer,
  walletId: string,
  format: "PDF" | "EXCEL",
  dateFrom: Date,
  dateTo: Date,
  branding: BrandingConfig,
) {
  if (dateFrom > dateTo) throw new AppError("The start date must be before the end date.", 400, "INVALID_RANGE");

  const wallet = await prisma.wallet.findFirst({ where: { id: walletId, customerId: customer.id } });
  if (!wallet) throw new NotFoundError("Wallet");

  const doc = await buildStatementDocument(prisma, customer.id, walletId, dateFrom, dateTo);
  const accountLabel = `${wallet.currencyCode} Wallet`;
  const verifyToken = signStatementToken({ walletId, dateFrom: doc.dateFrom, dateTo: doc.dateTo });
  const renderOpts = {
    productName: branding.productName,
    logoUrl: branding.logoUrl,
    primaryColor: branding.primaryColor,
    accountLabel,
    customerName: customer.fullName ?? customer.businessName ?? customer.email,
    supportEmail: branding.supportEmail,
    stampUrl: branding.stampUrl,
    verifyUrl: `${env.WEB_APP_URL}/verify-statement/${verifyToken}`,
  };
  const buffer = format === "PDF" ? await renderStatementPdf(doc, renderOpts) : await renderStatementExcel(doc, renderOpts);
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
      const customer = await app.prisma.customer.findUniqueOrThrow({ where: { id: resolveEffectiveCustomerId(request.customer!) } });
      const branding = await getBranding(app.prisma);
      const { format, dateFrom, dateTo } = request.query;
      const { doc, buffer } = await renderDocument(app.prisma, customer, request.params.id, format, new Date(dateFrom), new Date(dateTo), branding);

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
      const customer = await app.prisma.customer.findUniqueOrThrow({ where: { id: resolveEffectiveCustomerId(request.customer!) } });
      const branding = await getBranding(app.prisma);
      const { format, dateFrom, dateTo } = request.body;
      const { doc, buffer } = await renderDocument(app.prisma, customer, request.params.id, format, new Date(dateFrom), new Date(dateTo), branding);

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
