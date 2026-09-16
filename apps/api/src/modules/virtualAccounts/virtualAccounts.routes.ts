import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  virtualAccountSchema,
  virtualAccountCurrencySchema,
  createVirtualAccountSchema,
  adminVirtualAccountSchema,
  paginationQuerySchema,
  paginatedResponseSchema,
} from "@white-label/shared-types";
import { requireCustomerAuth } from "../../middleware/requireCustomerAuth.js";
import { requireStaffAuth } from "../../middleware/requireStaffAuth.js";
import { requirePortalPermission } from "../../middleware/requirePortalPermission.js";
import { resolveEffectiveCustomerId } from "../../lib/portalPrincipal.js";
import { yativoClient } from "../../lib/yativoClient.js";
import { ensureYativoCustomer } from "../../lib/ensureYativoCustomer.js";
import { isEndorsementRestrictedForCustomer, isHiddenEndorsement } from "../../lib/endorsementEligibility.js";
import { AppError } from "../../lib/errors.js";
import { errorResponseSchema } from "../../lib/httpSchemas.js";

/**
 * Dedicated bank-transfer receiving accounts — a separate product from the native gateway
 * deposit flow in modules/deposits (one-off pay-ins via CODI/SPEI/etc.). A virtual account is
 * long-lived: provisioned once per currency, then reused for every incoming transfer.
 */
export async function virtualAccountsRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/portal/virtual-accounts/currencies",
    { preHandler: [requireCustomerAuth, requirePortalPermission("virtual_accounts.manage")], schema: { response: { 200: z.array(virtualAccountCurrencySchema) } } },
    async (request, reply) => {
      const customer = await app.prisma.customer.findUniqueOrThrow({ where: { id: resolveEffectiveCustomerId(request.customer!) } });
      const yativoCustomerId = await ensureYativoCustomer(app.prisma, customer);

      const [currencies, { endorsements }] = await Promise.all([
        yativoClient.fiat.virtualAccounts.listSupportedCurrencies(),
        yativoClient.fiat.customers.get(yativoCustomerId),
      ]);

      const result = currencies
        .filter((c) => !isHiddenEndorsement(c.endorsement) && !isEndorsementRestrictedForCustomer(c.endorsement, customer))
        .map((c) => {
          if (!c.endorsement) {
            return { currency: c.currency, endorsement: null, eligible: true, endorsementStatus: null, hostedKycUrl: null };
          }
          const match = endorsements.find((e) => e.service === c.endorsement);
          return {
            currency: c.currency,
            endorsement: c.endorsement,
            eligible: match?.status === "approved",
            endorsementStatus: match?.status ?? null,
            hostedKycUrl: match?.hostedKycUrl ?? null,
          };
        });
      return reply.send(result);
    },
  );

  server.get(
    "/portal/virtual-accounts",
    { preHandler: [requireCustomerAuth, requirePortalPermission("virtual_accounts.manage")], schema: { response: { 200: z.array(virtualAccountSchema) } } },
    async (request, reply) => {
      const customer = await app.prisma.customer.findUniqueOrThrow({ where: { id: resolveEffectiveCustomerId(request.customer!) } });
      const yativoCustomerId = await ensureYativoCustomer(app.prisma, customer);
      const accounts = await yativoClient.fiat.virtualAccounts.listForCustomer(yativoCustomerId);

      // Trusting Yativo's customer_id alone to scope this list isn't safe (confirmed live: it has
      // returned other customers' accounts too, e.g. from data created before per-customer
      // registration was strictly enforced). The local VirtualAccount table (recorded on creation,
      // below) is this app's own record of which accounts belong to this customer, so filter the
      // upstream list down to those before returning it.
      const owned = await app.prisma.virtualAccount.findMany({ where: { customerId: customer.id }, select: { yativoAccountId: true } });
      const ownedIds = new Set(owned.map((o) => o.yativoAccountId));
      return reply.send(accounts.filter((a) => a.accountId && ownedIds.has(a.accountId)));
    },
  );

  server.post(
    "/portal/virtual-accounts",
    {
      preHandler: [requireCustomerAuth, requirePortalPermission("virtual_accounts.manage")],
      schema: { body: createVirtualAccountSchema, response: { 200: virtualAccountSchema, 404: errorResponseSchema } },
    },
    async (request, reply) => {
      const customer = await app.prisma.customer.findUniqueOrThrow({ where: { id: resolveEffectiveCustomerId(request.customer!) } });
      const yativoCustomerId = await ensureYativoCustomer(app.prisma, customer);

      const [currencies, { endorsements }] = await Promise.all([
        yativoClient.fiat.virtualAccounts.listSupportedCurrencies(),
        yativoClient.fiat.customers.get(yativoCustomerId),
      ]);
      const chosen = currencies.find((c) => c.currency === request.body.currency);
      if (!chosen || isHiddenEndorsement(chosen.endorsement)) {
        throw new AppError(`${request.body.currency} isn't a supported virtual account currency.`, 404, "UNSUPPORTED_CURRENCY");
      }
      if (isEndorsementRestrictedForCustomer(chosen.endorsement, customer)) {
        throw new AppError("This currency is only available to business customers.", 403, "BUSINESS_CUSTOMER_REQUIRED");
      }
      if (chosen.endorsement) {
        const match = endorsements.find((e) => e.service === chosen.endorsement);
        if (match?.status !== "approved") {
          throw new AppError(
            `This currency requires ${chosen.endorsement.replace(/_/g, " ")} verification before you can generate an account.`,
            409,
            "ENDORSEMENT_REQUIRED",
          );
        }
      }

      const account = await yativoClient.fiat.virtualAccounts.getOrCreate(yativoCustomerId, request.body.currency);

      // Recorded locally so the virtual_account.deposit webhook (and the GET handler above) can
      // attribute an account to this customer via account-number matching rather than trusting
      // Yativo's customer_id alone. `identifiers` stores the whole flattened response since the
      // field actually naming the account number varies by country/rail (accountNumber/iban/clabe/pixKey/...).
      if (account.accountId) {
        await app.prisma.virtualAccount.upsert({
          where: { yativoAccountId: account.accountId },
          update: { identifiers: account },
          create: { customerId: customer.id, currencyCode: request.body.currency, yativoAccountId: account.accountId, identifiers: account },
        });
      }

      return reply.send(account);
    },
  );

  server.get(
    "/admin/virtual-accounts",
    {
      preHandler: requireStaffAuth,
      schema: {
        querystring: paginationQuerySchema.extend({ customerId: z.string().optional() }),
        response: { 200: paginatedResponseSchema(adminVirtualAccountSchema) },
      },
    },
    async (request, reply) => {
      const { page, pageSize, customerId } = request.query;
      const where = customerId ? { customerId } : {};
      const [total, accounts] = await Promise.all([
        app.prisma.virtualAccount.count({ where }),
        app.prisma.virtualAccount.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: { customer: { select: { id: true, email: true, fullName: true, businessName: true } } },
        }),
      ]);
      return reply.send({
        items: accounts.map((a) => ({
          id: a.id,
          customerId: a.customerId,
          customerName: a.customer.fullName ?? a.customer.businessName,
          customerEmail: a.customer.email,
          currencyCode: a.currencyCode,
          yativoAccountId: a.yativoAccountId,
          identifiers: a.identifiers as Record<string, unknown>,
          createdAt: a.createdAt.toISOString(),
        })),
        page,
        pageSize,
        total,
      });
    },
  );
}
