import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { depositCountrySchema, depositMethodSchema, createDepositSchema, depositResultSchema } from "@white-label/shared-types";
import { requireCustomerAuth } from "../../middleware/requireCustomerAuth.js";
import { resolveEffectiveCustomerId } from "../../lib/portalPrincipal.js";
import { yativoClient } from "../../lib/yativoClient.js";
import { ensureYativoCustomer } from "../../lib/ensureYativoCustomer.js";
import { ensureCustomerWalletAccount } from "../ledger/accounts.js";
import { env } from "../../config/env.js";
import { requireKycApprovedForService } from "../../lib/requireKycApproved.js";
import { errorResponseSchema } from "../../lib/httpSchemas.js";
import { parseYativoFeeString } from "../../lib/parseYativoFeeString.js";
import { majorToMinor } from "../../lib/money.js";
import { sendNotificationEmail } from "../notifications/notifications.service.js";
import { getEffectiveFee } from "../pricing/pricing.service.js";

// Native gateway pay-ins only (country → method → wallet + amount → initiate) — for
// long-lived bank-transfer receiving accounts, see modules/virtualAccounts instead.
export async function depositsRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/portal/deposit/countries",
    { preHandler: requireCustomerAuth, schema: { response: { 200: z.array(depositCountrySchema) } } },
    async (_request, reply) => {
      const countries = await yativoClient.fiat.paymentMethods.listPayinCountries();
      return reply.send(countries);
    },
  );

  server.get(
    "/portal/deposit/methods",
    {
      preHandler: requireCustomerAuth,
      schema: { querystring: z.object({ country: z.string() }), response: { 200: z.array(depositMethodSchema) } },
    },
    async (request, reply) => {
      const methods = await yativoClient.fiat.paymentMethods.listPayinMethodsByCountry({ country: request.query.country });
      return reply.send(methods.filter((m) => m.active));
    },
  );

  server.post(
    "/portal/deposit/initiate",
    {
      preHandler: requireCustomerAuth,
      schema: { body: createDepositSchema, response: { 200: depositResultSchema, 404: errorResponseSchema } },
    },
    async (request, reply) => {
      const customer = await app.prisma.customer.findUniqueOrThrow({ where: { id: resolveEffectiveCustomerId(request.customer!) } });
      await requireKycApprovedForService(app.prisma, "DEPOSIT", customer);

      const yativoCustomerId = await ensureYativoCustomer(app.prisma, customer);

      const result = await yativoClient.fiat.deposits.create({
        yativoCustomerId,
        gatewayId: request.body.gatewayId,
        walletCurrencyCode: request.body.walletCurrencyCode,
        amount: Number(request.body.amount),
        extraData: request.body.extraData,
        returnUrl: `${env.WEB_APP_URL}/portal/deposit`,
        idempotencyKey: randomUUID(),
      });

      // Only create the wallet once Yativo has actually accepted the deposit — creating it
      // eagerly before this call would leave a stray empty wallet behind on any failure (e.g.
      // an unsupported currency), and the deposit.confirmed webhook already creates it lazily
      // on completion (see webhooks/handlers/deposit.handler.ts) if this doesn't run first.
      await ensureCustomerWalletAccount(app.prisma, customer.id, request.body.walletCurrencyCode);

      // Recorded so the deposit.confirmed webhook can recognize this as a payin (as opposed to an
      // unsolicited virtual-account transfer, which never hits this route) and, when pricing is
      // set to markup, add the platform's fee on top of what Yativo itself quoted here —
      // `transactionFee`/`exchangeRate` are human-readable strings ("3.4 MXN", "1 USD = 17.2 MXN"),
      // so this parse is best-effort and never blocks the deposit if it fails.
      let platformFee: string | null = null;
      if (result.depositId) {
        const walletCurrency = await app.prisma.currency.findUnique({ where: { code: request.body.walletCurrencyCode } });

        let yativoFeeMinor: bigint | null = null;
        const feeMajor = parseYativoFeeString(result.transactionFee);
        const rate = parseYativoFeeString(result.exchangeRate);
        if (feeMajor !== undefined && rate !== undefined && rate > 0 && walletCurrency) {
          yativoFeeMinor = majorToMinor(feeMajor / rate, walletCurrency.decimals);
        }
        await app.prisma.deposit.create({
          data: { customerId: customer.id, currencyCode: request.body.walletCurrencyCode, yativoDepositId: result.depositId, yativoFeeMinor },
        });

        // Previewed here so the customer sees what will actually come out of the deposit —
        // the same getEffectiveFee call the deposit.confirmed webhook makes at settlement (see
        // webhooks/handlers/deposit.handler.ts). Best-effort: left null if Yativo didn't return a
        // receive amount or the wallet currency isn't seeded locally.
        if (walletCurrency && result.receiveAmount) {
          const receiveAmountMinor = majorToMinor(result.receiveAmount, walletCurrency.decimals);
          const feeMinor = await getEffectiveFee(app.prisma, "PAYIN", customer.id, receiveAmountMinor, yativoFeeMinor ?? 0n);
          platformFee = (Number(feeMinor) / 10 ** walletCurrency.decimals).toFixed(walletCurrency.decimals);
        }
      }

      // Fired immediately on submission — separate from DEPOSIT_RECEIVED, which only fires once
      // the deposit.confirmed webhook lands (and today, that webhook path is unreachable in local
      // dev, so this is the one confirmation a customer reliably gets for now).
      await sendNotificationEmail(app.prisma, "DEPOSIT_CREATED", customer.id, {
        amount: result.receiveAmount ?? request.body.amount,
        currency: request.body.walletCurrencyCode,
      });

      return reply.send({ ...result, platformFee });
    },
  );
}
