import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  customerSchema,
  customerDetailSchema,
  customerEndorsementSchema,
  beneficiarySchema,
  rejectKycSchema,
  adjustWalletSchema,
  statementLineSchema,
  ledgerTransactionSchema,
  paginationQuerySchema,
  paginatedResponseSchema,
  KYC_STATUSES,
  CUSTOMER_STATUSES,
} from "@white-label/shared-types";
import { requireStaffAuth, requireRole, requirePermission } from "../../middleware/requireStaffAuth.js";
import { errorResponseSchema } from "../../lib/httpSchemas.js";
import {
  listCustomers,
  getCustomerDetail,
  getCustomerEndorsements,
  regenerateCustomerEndorsementLink,
  approveKyc,
  rejectKyc,
  freezeCustomer,
  unfreezeCustomer,
  resubmitCustomerToYativo,
  customerToDto,
} from "./customers.service.js";
import { getWalletForCustomer, getWalletStatement, adjustWallet } from "../wallets/wallets.service.js";
import { listBeneficiaries, getBeneficiary } from "../beneficiaries/beneficiaries.service.js";

function ledgerTxToDto(tx: {
  id: string;
  type: string;
  status: string;
  idempotencyKey: string;
  externalSource: string;
  externalRef: string | null;
  description: string | null;
  metadata: unknown;
  reversalOfId: string | null;
  createdAt: Date;
  postedAt: Date | null;
  reversedAt: Date | null;
}) {
  return {
    ...tx,
    metadata: (tx.metadata as Record<string, unknown> | null) ?? null,
    createdAt: tx.createdAt.toISOString(),
    postedAt: tx.postedAt?.toISOString() ?? null,
    reversedAt: tx.reversedAt?.toISOString() ?? null,
  } as z.infer<typeof ledgerTransactionSchema>;
}

const listQuerySchema = paginationQuerySchema.extend({
  search: z.string().optional(),
  kycStatus: z.enum(KYC_STATUSES).optional(),
  status: z.enum(CUSTOMER_STATUSES).optional(),
});

export async function customersRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/admin/customers",
    {
      preHandler: requireStaffAuth,
      schema: { querystring: listQuerySchema, response: { 200: paginatedResponseSchema(customerSchema) } },
    },
    async (request, reply) => {
      const { page, pageSize, search, kycStatus, status } = request.query;
      const result = await listCustomers(app.prisma, { search, kycStatus, status }, page, pageSize);
      return reply.send(result);
    },
  );

  server.get(
    "/admin/customers/:id",
    {
      preHandler: requireStaffAuth,
      schema: { params: z.object({ id: z.string() }), response: { 200: customerDetailSchema, 404: errorResponseSchema } },
    },
    async (request, reply) => {
      const detail = await getCustomerDetail(app.prisma, request.params.id);
      return reply.send(detail);
    },
  );

  server.get(
    "/admin/customers/:id/endorsements",
    {
      preHandler: requireStaffAuth,
      schema: { params: z.object({ id: z.string() }), response: { 200: z.array(customerEndorsementSchema), 404: errorResponseSchema, 409: errorResponseSchema } },
    },
    async (request, reply) => {
      const endorsements = await getCustomerEndorsements(app.prisma, request.params.id);
      return reply.send(endorsements);
    },
  );

  server.post(
    "/admin/customers/:id/endorsements/:service/link",
    {
      preHandler: [requireStaffAuth, requirePermission("endorsements.manage")],
      schema: {
        params: z.object({ id: z.string(), service: z.string() }),
        response: { 200: z.array(customerEndorsementSchema), 404: errorResponseSchema, 409: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const endorsements = await regenerateCustomerEndorsementLink(app.prisma, request.params.id, request.params.service);
      return reply.send(endorsements);
    },
  );

  server.post(
    "/admin/customers/:id/kyc/approve",
    {
      preHandler: [requireStaffAuth, requirePermission("kyc.review")],
      schema: { params: z.object({ id: z.string() }), response: { 200: customerSchema, 404: errorResponseSchema } },
    },
    async (request, reply) => {
      const customer = await approveKyc(app.prisma, request.params.id);
      return reply.send(customerToDto(customer));
    },
  );

  server.post(
    "/admin/customers/:id/kyc/reject",
    {
      preHandler: [requireStaffAuth, requirePermission("kyc.review")],
      schema: {
        params: z.object({ id: z.string() }),
        body: rejectKycSchema,
        response: { 200: customerSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const customer = await rejectKyc(app.prisma, request.params.id, request.body.reason);
      return reply.send(customerToDto(customer));
    },
  );

  server.post(
    "/admin/customers/:id/freeze",
    {
      preHandler: [requireStaffAuth, requirePermission("customers.write")],
      schema: { params: z.object({ id: z.string() }), response: { 200: customerSchema, 404: errorResponseSchema } },
    },
    async (request, reply) => {
      const customer = await freezeCustomer(app.prisma, request.params.id);
      return reply.send(customerToDto(customer));
    },
  );

  server.post(
    "/admin/customers/:id/unfreeze",
    {
      preHandler: [requireStaffAuth, requirePermission("customers.write")],
      schema: { params: z.object({ id: z.string() }), response: { 200: customerSchema, 404: errorResponseSchema } },
    },
    async (request, reply) => {
      const customer = await unfreezeCustomer(app.prisma, request.params.id);
      return reply.send(customerToDto(customer));
    },
  );

  server.post(
    "/admin/customers/:id/yativo/resubmit",
    {
      preHandler: [requireStaffAuth, requirePermission("customers.write")],
      schema: { params: z.object({ id: z.string() }), response: { 200: customerSchema, 404: errorResponseSchema, 409: errorResponseSchema } },
    },
    async (request, reply) => {
      const customer = await resubmitCustomerToYativo(app.prisma, request.params.id);
      return reply.send(customerToDto(customer));
    },
  );

  server.get(
    "/admin/customers/:id/wallets/:walletId/statement",
    {
      preHandler: requireStaffAuth,
      schema: {
        params: z.object({ id: z.string(), walletId: z.string() }),
        querystring: paginationQuerySchema,
        response: { 200: paginatedResponseSchema(statementLineSchema), 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const wallet = await getWalletForCustomer(app.prisma, request.params.id, request.params.walletId);
      const result = await getWalletStatement(app.prisma, wallet.accountId, wallet.account.type, request.query.page, request.query.pageSize);
      return reply.send(result);
    },
  );

  server.post(
    "/admin/customers/:id/wallets/:walletId/adjust",
    {
      preHandler: [requireStaffAuth, requireRole("OWNER", "ADMIN")],
      schema: {
        params: z.object({ id: z.string(), walletId: z.string() }),
        body: adjustWalletSchema,
        response: { 200: ledgerTransactionSchema, 404: errorResponseSchema, 403: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const wallet = await getWalletForCustomer(app.prisma, request.params.id, request.params.walletId);
      const tx = await adjustWallet(app.prisma, wallet, request.body.direction, BigInt(request.body.amountMinor), request.body.reason);
      return reply.send(ledgerTxToDto(tx));
    },
  );

  // Read-only — admin never edits a customer's payment details (see updateBeneficiarySchema's
  // doc comment for why: Yativo has no update-beneficiary endpoint).
  server.get(
    "/admin/customers/:id/beneficiaries",
    {
      preHandler: requireStaffAuth,
      schema: { params: z.object({ id: z.string() }), response: { 200: z.array(beneficiarySchema) } },
    },
    async (request, reply) => {
      const beneficiaries = await listBeneficiaries(app.prisma, request.params.id);
      return reply.send(beneficiaries);
    },
  );

  server.get(
    "/admin/customers/:id/beneficiaries/:beneficiaryId",
    {
      preHandler: requireStaffAuth,
      schema: { params: z.object({ id: z.string(), beneficiaryId: z.string() }), response: { 200: beneficiarySchema, 404: errorResponseSchema } },
    },
    async (request, reply) => {
      const beneficiary = await getBeneficiary(app.prisma, request.params.beneficiaryId, request.params.id);
      return reply.send(beneficiary);
    },
  );
}
