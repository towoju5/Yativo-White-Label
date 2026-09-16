import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  individualKycSubmissionSchema,
  businessKycSubmissionSchema,
  kycStatusResponseSchema,
  kycCountrySchema,
  kycSubdivisionSchema,
  kycIdentificationTypeSchema,
  kycPostalCodeRuleSchema,
  kycOccupationSchema,
  kycLabelMapSchema,
  customerEndorsementSchema,
} from "@white-label/shared-types";
import { z } from "zod";
import type { SubmitIndividualKycInput, SubmitBusinessKycInput } from "@white-label/yativo-sdk";
import { requireCustomerAuth } from "../../middleware/requireCustomerAuth.js";
import { yativoClient } from "../../lib/yativoClient.js";
import { ensureYativoCustomer } from "../../lib/ensureYativoCustomer.js";
import { AppError } from "../../lib/errors.js";
import { parseMultipartKycRequest, injectFiles } from "../../lib/parseMultipartKyc.js";
import { errorResponseSchema } from "../../lib/httpSchemas.js";
import { getCustomerEndorsements, regenerateCustomerEndorsementLink } from "../customers/customers.service.js";
import { isEndorsementRestrictedForCustomer } from "../../lib/endorsementEligibility.js";
import { getPlatformSettings } from "../platformSettings/platformSettings.service.js";
import { sendOpsAlert } from "../notifications/channels/opsAlert.js";
import logger from "../../lib/logger.js";
import { buildIndividualKycDraft, buildBusinessKycDraft } from "./kycDraft.js";

const kycDraftResponseSchema = z.object({
  type: z.enum(["INDIVIDUAL", "BUSINESS"]),
  draft: z.record(z.unknown()).nullable(),
});

async function resolveCountryIso3(iso2: string): Promise<string> {
  const countries = await yativoClient.fiat.kycReference.listCountries();
  // console.log("resolveCountryIso3", iso2, countries);
  // logger.debug({ iso2, countries }, "resolveCountryIso3");
  const match = countries.find((c) => c.code === iso2);
  if (!match) throw new AppError(`Unrecognized country code "${iso2}".`, 400, "UNKNOWN_COUNTRY");
  return match.iso3;
}

export async function kycRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/portal/kyc",
    { preHandler: requireCustomerAuth, schema: { response: { 200: kycStatusResponseSchema } } },
    async (request, reply) => {
      const [customer, settings] = await Promise.all([
        app.prisma.customer.findUniqueOrThrow({ where: { id: request.customer!.sub } }),
        getPlatformSettings(app.prisma),
      ]);
      return reply.send({
        kycStatus: customer.kycStatus,
        kycSubmissionId: customer.kycSubmissionId,
        kycSubmittedAt: customer.kycSubmittedAt?.toISOString() ?? null,
        requiredServices: settings.kycRequiredServices,
      });
    },
  );

  server.get(
    "/portal/kyc/endorsements",
    { preHandler: requireCustomerAuth, schema: { response: { 200: z.array(customerEndorsementSchema), 409: errorResponseSchema } } },
    async (request, reply) => {
      const customer = await app.prisma.customer.findUniqueOrThrow({ where: { id: request.customer!.sub } });
      const endorsements = await getCustomerEndorsements(app.prisma, request.customer!.sub);
      // Customer-facing only — an admin-hidden service, and any service restricted to business
      // customers (e.g. cobo_pobo) that this customer isn't, are excluded from what the customer
      // sees, but never from the live status checks that gate card/account/wallet creation elsewhere.
      return reply.send(endorsements.filter((e) => e.isVisible && !isEndorsementRestrictedForCustomer(e.service, customer)));
    },
  );

  server.post(
    "/portal/kyc/endorsements/:service/link",
    {
      preHandler: requireCustomerAuth,
      schema: {
        params: z.object({ service: z.string() }),
        response: { 200: z.array(customerEndorsementSchema), 409: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const customer = await app.prisma.customer.findUniqueOrThrow({ where: { id: request.customer!.sub } });
      const endorsements = await regenerateCustomerEndorsementLink(app.prisma, request.customer!.sub, request.params.service);
      return reply.send(endorsements.filter((e) => e.isVisible && !isEndorsementRestrictedForCustomer(e.service, customer)));
    },
  );

  // --- Reference/lookup proxies: drive the KYC form's dropdowns + client-side validation. ---

  server.get(
    "/portal/kyc/reference/countries",
    { preHandler: requireCustomerAuth, schema: { response: { 200: z.array(kycCountrySchema) } } },
    async (_request, reply) => reply.send(await yativoClient.fiat.kycReference.listCountries()),
  );

  server.get(
    "/portal/kyc/reference/subdivisions/:country",
    {
      preHandler: requireCustomerAuth,
      schema: { params: z.object({ country: z.string().length(2) }), response: { 200: z.array(kycSubdivisionSchema) } },
    },
    async (request, reply) => reply.send(await yativoClient.fiat.kycReference.listSubdivisions(request.params.country)),
  );

  server.get(
    "/portal/kyc/reference/identification-types/:country",
    {
      preHandler: requireCustomerAuth,
      schema: { params: z.object({ country: z.string().length(2) }), response: { 200: z.array(kycIdentificationTypeSchema) } },
    },
    async (request, reply) => reply.send(await yativoClient.fiat.kycReference.listIdentificationTypes(request.params.country)),
  );

  server.get(
    "/portal/kyc/reference/postal-codes/:country",
    {
      preHandler: requireCustomerAuth,
      schema: { params: z.object({ country: z.string().length(2) }), response: { 200: kycPostalCodeRuleSchema } },
    },
    async (request, reply) => {
      const rule = await yativoClient.fiat.kycReference.getPostalCodeRule(request.params.country);
      return reply.send({
        countryCode: rule.country_code,
        usesPostalCodes: rule.uses_postal_codes,
        ruleRegex: rule.validation?.rule_regex ?? null,
        ruleSamples: rule.validation?.rule_samples ?? [],
      });
    },
  );

  server.get(
    "/portal/kyc/reference/occupations",
    { preHandler: requireCustomerAuth, schema: { response: { 200: z.array(kycOccupationSchema) } } },
    async (_request, reply) => {
      const items = await yativoClient.fiat.kycReference.listOccupations();
      return reply.send(items.map((i) => ({ code: i.code, label: i.occupation })));
    },
  );

  server.get(
    "/portal/kyc/reference/business-industries",
    { preHandler: requireCustomerAuth, schema: { response: { 200: z.array(kycOccupationSchema) } } },
    async (_request, reply) => {
      const items = await yativoClient.fiat.kycReference.listBusinessIndustries();
      return reply.send(items.map((i) => ({ code: i.code, label: i.occupation })));
    },
  );

  server.get(
    "/portal/kyc/reference/individual/account-purposes",
    { preHandler: requireCustomerAuth, schema: { response: { 200: kycLabelMapSchema } } },
    async (_request, reply) => reply.send(await yativoClient.fiat.kycReference.listIndividualAccountPurposes()),
  );
  server.get(
    "/portal/kyc/reference/individual/source-of-funds",
    { preHandler: requireCustomerAuth, schema: { response: { 200: kycLabelMapSchema } } },
    async (_request, reply) => reply.send(await yativoClient.fiat.kycReference.listIndividualSourceOfFunds()),
  );
  server.get(
    "/portal/kyc/reference/individual/expected-monthly-payments",
    { preHandler: requireCustomerAuth, schema: { response: { 200: kycLabelMapSchema } } },
    async (_request, reply) => reply.send(await yativoClient.fiat.kycReference.listIndividualExpectedMonthlyPayments()),
  );
  server.get(
    "/portal/kyc/reference/business/account-purposes",
    { preHandler: requireCustomerAuth, schema: { response: { 200: kycLabelMapSchema } } },
    async (_request, reply) => reply.send(await yativoClient.fiat.kycReference.listBusinessAccountPurposes()),
  );
  server.get(
    "/portal/kyc/reference/business/source-of-funds",
    { preHandler: requireCustomerAuth, schema: { response: { 200: kycLabelMapSchema } } },
    async (_request, reply) => reply.send(await yativoClient.fiat.kycReference.listBusinessSourceOfFunds()),
  );

  server.get(
    "/portal/kyc/draft",
    { preHandler: requireCustomerAuth, schema: { response: { 200: kycDraftResponseSchema } } },
    async (request, reply) => {
      const customer = await app.prisma.customer.findUniqueOrThrow({ where: { id: request.customer!.sub } });
      return reply.send({ type: customer.type, draft: (customer.kycDraft as Record<string, unknown> | null) ?? null });
    },
  );

  // --- Submission ---

  server.post(
    "/portal/kyc/individual",
    { preHandler: requireCustomerAuth, schema: { response: { 200: kycStatusResponseSchema } } },
    async (request, reply) => {
      const customer = await app.prisma.customer.findUniqueOrThrow({ where: { id: request.customer!.sub } });
      if (customer.type !== "INDIVIDUAL") {
        throw new AppError("This account is registered as a business — use business verification instead.", 400, "WRONG_CUSTOMER_TYPE");
      }

      const { payload, files } = await parseMultipartKycRequest(request);
      const parsed = individualKycSubmissionSchema.safeParse(payload);
      if (!parsed.success) {
        throw new AppError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), 400, "VALIDATION_ERROR");
      }
      const body = injectFiles<typeof parsed.data, SubmitIndividualKycInput>(parsed.data, files);

      // Best-effort — saved before the Yativo call so a rejected/failed attempt still leaves the
      // non-sensitive fields available to pre-fill the next retry. Never blocks the actual submission.
      await app.prisma.customer
        .update({ where: { id: customer.id }, data: { kycDraft: buildIndividualKycDraft(parsed.data) } })
        .catch((err) => logger.warn({ err, customerId: customer.id }, "Failed to save individual KYC draft snapshot"));

      const countryIso3 = await resolveCountryIso3(parsed.data.residentialAddress.country);
      const yativoCustomerId = await ensureYativoCustomer(app.prisma, customer, {
        phone: `${parsed.data.callingCode}${parsed.data.phone}`,
        countryIso3,
      });

      const result = await yativoClient.fiat.kyc.submitIndividual(yativoCustomerId, body);

      const updated = await app.prisma.customer.update({
        where: { id: customer.id },
        data: {
          fullName: `${body.firstName} ${body.lastName}`,
          kycStatus: "PENDING",
          kycSubmissionId: result.submissionId,
          kycSubmittedAt: new Date(),
        },
      });
      await sendOpsAlert(`🪪 Individual KYC submitted for review — customer ${updated.id} (${updated.email}).`);
      const settings = await getPlatformSettings(app.prisma);
      return reply.send({
        kycStatus: updated.kycStatus,
        kycSubmissionId: updated.kycSubmissionId,
        kycSubmittedAt: updated.kycSubmittedAt!.toISOString(),
        requiredServices: settings.kycRequiredServices,
      });
    },
  );

  server.post(
    "/portal/kyc/business",
    { preHandler: requireCustomerAuth, schema: { response: { 200: kycStatusResponseSchema } } },
    async (request, reply) => {
      const customer = await app.prisma.customer.findUniqueOrThrow({ where: { id: request.customer!.sub } });
      if (customer.type !== "BUSINESS") {
        throw new AppError("This account is registered as an individual — use individual verification instead.", 400, "WRONG_CUSTOMER_TYPE");
      }

      const { payload, files } = await parseMultipartKycRequest(request);
      const parsed = businessKycSubmissionSchema.safeParse(payload);
      if (!parsed.success) {
        throw new AppError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), 400, "VALIDATION_ERROR");
      }
      const body = injectFiles<typeof parsed.data, SubmitBusinessKycInput>(parsed.data, files);

      // Best-effort — saved before the Yativo call so a rejected/failed attempt still leaves the
      // non-sensitive fields available to pre-fill the next retry. Never blocks the actual submission.
      await app.prisma.customer
        .update({ where: { id: customer.id }, data: { kycDraft: buildBusinessKycDraft(parsed.data) } })
        .catch((err) => logger.warn({ err, customerId: customer.id }, "Failed to save business KYC draft snapshot"));

      const countryIso3 = await resolveCountryIso3(parsed.data.registeredAddress.country);
      const yativoCustomerId = await ensureYativoCustomer(app.prisma, customer, {
        phone: `${parsed.data.phoneCallingCode}${parsed.data.phoneNumber}`,
        countryIso3,
      });

      const result = await yativoClient.fiat.kyc.submitBusiness(yativoCustomerId, body);

      const updated = await app.prisma.customer.update({
        where: { id: customer.id },
        data: {
          businessName: body.businessLegalName,
          kycStatus: "PENDING",
          kycSubmissionId: result.submissionId,
          kycSubmittedAt: new Date(),
        },
      });
      await sendOpsAlert(`🪪 Business KYB submitted for review — customer ${updated.id} (${updated.email}).`);
      const settings = await getPlatformSettings(app.prisma);
      return reply.send({
        kycStatus: updated.kycStatus,
        kycSubmissionId: updated.kycSubmissionId,
        kycSubmittedAt: updated.kycSubmittedAt!.toISOString(),
        requiredServices: settings.kycRequiredServices,
      });
    },
  );
}
