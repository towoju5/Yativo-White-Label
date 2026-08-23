import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  beneficiarySchema,
  createBeneficiarySchema,
  updateBeneficiarySchema,
  payoutCountrySchema,
  payoutMethodSchema,
  beneficiaryFormFieldSchema,
} from "@white-label/shared-types";
import { requireCustomerAuth } from "../../middleware/requireCustomerAuth.js";
import { errorResponseSchema } from "../../lib/httpSchemas.js";
import {
  listBeneficiaries,
  createBeneficiary,
  getBeneficiary,
  updateBeneficiary,
  archiveBeneficiary,
  listPayoutCountries,
  listPayoutMethods,
  getBeneficiaryForm,
} from "./beneficiaries.service.js";

export async function beneficiariesRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/portal/beneficiaries/countries",
    { preHandler: requireCustomerAuth, schema: { response: { 200: z.array(payoutCountrySchema) } } },
    async (_request, reply) => {
      const countries = await listPayoutCountries();
      return reply.send(countries);
    },
  );

  server.get(
    "/portal/beneficiaries/payout-methods",
    {
      preHandler: requireCustomerAuth,
      schema: {
        querystring: z.object({ country: z.string().optional(), currency: z.string().optional() }),
        response: { 200: z.array(payoutMethodSchema) },
      },
    },
    async (request, reply) => {
      const methods = await listPayoutMethods(request.query.country, request.query.currency);
      return reply.send(methods);
    },
  );

  server.get(
    "/portal/beneficiaries/form/:gatewayId",
    {
      preHandler: requireCustomerAuth,
      schema: { params: z.object({ gatewayId: z.coerce.number() }), response: { 200: z.array(beneficiaryFormFieldSchema) } },
    },
    async (request, reply) => {
      const fields = await getBeneficiaryForm(request.params.gatewayId);
      return reply.send(fields);
    },
  );

  server.get(
    "/portal/beneficiaries",
    { preHandler: requireCustomerAuth, schema: { response: { 200: z.array(beneficiarySchema) } } },
    async (request, reply) => {
      const beneficiaries = await listBeneficiaries(app.prisma, request.customer!.sub);
      return reply.send(beneficiaries);
    },
  );

  server.post(
    "/portal/beneficiaries",
    { preHandler: requireCustomerAuth, schema: { body: createBeneficiarySchema, response: { 200: beneficiarySchema } } },
    async (request, reply) => {
      const beneficiary = await createBeneficiary(app.prisma, request.customer!.sub, request.body);
      return reply.send(beneficiary);
    },
  );

  server.get(
    "/portal/beneficiaries/:id",
    {
      preHandler: requireCustomerAuth,
      schema: { params: z.object({ id: z.string() }), response: { 200: beneficiarySchema, 404: errorResponseSchema } },
    },
    async (request, reply) => {
      const beneficiary = await getBeneficiary(app.prisma, request.params.id, request.customer!.sub);
      return reply.send(beneficiary);
    },
  );

  server.patch(
    "/portal/beneficiaries/:id",
    {
      preHandler: requireCustomerAuth,
      schema: { params: z.object({ id: z.string() }), body: updateBeneficiarySchema, response: { 200: beneficiarySchema, 404: errorResponseSchema } },
    },
    async (request, reply) => {
      const beneficiary = await updateBeneficiary(app.prisma, request.customer!.sub, request.params.id, request.body);
      return reply.send(beneficiary);
    },
  );

  server.delete(
    "/portal/beneficiaries/:id",
    {
      preHandler: requireCustomerAuth,
      schema: { params: z.object({ id: z.string() }), response: { 204: z.void(), 404: errorResponseSchema } },
    },
    async (request, reply) => {
      await archiveBeneficiary(app.prisma, request.customer!.sub, request.params.id);
      return reply.code(204).send();
    },
  );
}
