import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { quoteRequestSchema, quoteSchema } from "@white-label/shared-types";
import { requireCustomerAuth } from "../../middleware/requireCustomerAuth.js";
import { resolveEffectiveCustomerId } from "../../lib/portalPrincipal.js";
import { AppError, NotFoundError } from "../../lib/errors.js";
import { yativoClient } from "../../lib/yativoClient.js";
import { getBeneficiaryGatewayInfo } from "../beneficiaries/beneficiaries.service.js";

/**
 * Yativo's real quote endpoint (POST /exchange-rate — see fiat/quotes.ts). Cross-currency:
 * `debitCurrency` is the wallet being debited, the payout currency is whatever the chosen
 * beneficiary's gateway pays out in. Confirmed against Yativo's own docs AND live cross-currency
 * arithmetic (see fiat/quotes.ts's GetFiatQuoteInput.amount doc): `amount` is the DEBIT-side
 * (fromCurrency) figure, the SAME convention as the payout submission's own `amount` — an earlier
 * version of this comment claimed the opposite, based on an assumption that was never actually
 * arithmetic-checked and was wrong. `sendAmount` here is what the customer wants to send FROM
 * their wallet; the recipient's receive-side figure is entirely an OUTPUT of the quote, not an
 * input. Quotes expire ~5 minutes after issuance (`expiresAt`) — the send-money UI re-quotes if
 * the customer takes too long to confirm.
 */
export async function quotesRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.post(
    "/portal/quotes",
    { preHandler: requireCustomerAuth, schema: { body: quoteRequestSchema, response: { 200: quoteSchema } } },
    async (request, reply) => {
      const { beneficiaryId, debitCurrency, sendAmount } = request.body;

      const beneficiary = await app.prisma.beneficiary.findFirst({
        where: { id: beneficiaryId, customerId: resolveEffectiveCustomerId(request.customer!), archivedAt: null },
      });
      if (!beneficiary) throw new NotFoundError("Beneficiary");
      const { gatewayId, currency: payoutCurrency } = getBeneficiaryGatewayInfo(beneficiary);

      // debitCurrency always corresponds to a wallet the customer actually holds, so it must be
      // seeded locally. payoutCurrency doesn't have that guarantee — Yativo's payout corridors
      // (per beneficiary country/gateway) cover far more currencies than the wallet-holding
      // currencies this table is otherwise about (e.g. NGN is a valid payout destination via
      // gateway 1271 but was never one of the 8 currencies Yativo lists in /currencies/all).
      // Confirmed live: without this fallback, a payout to an unseeded currency 500s here instead
      // of producing a quote. Falls back to the ISO 4217 standard of 2 decimals.
      const [debitCurrencyRow, payoutCurrencyRow] = await Promise.all([
        app.prisma.currency.findUniqueOrThrow({ where: { code: debitCurrency } }),
        app.prisma.currency.findUnique({ where: { code: payoutCurrency } }),
      ]);
      const payoutDecimals = payoutCurrencyRow?.decimals ?? 2;

      const yativoQuote = await yativoClient.fiat.quotes.create({
        fromCurrency: debitCurrency,
        toCurrency: payoutCurrency,
        methodId: gatewayId,
        amount: Number(sendAmount),
      });

      // Neither figure is a simple echo of the request now that `amount` is debit-side — both are
      // genuinely computed by Yativo (fee-inclusive debit total, rate-converted receive amount) —
      // so there's no safe fallback for either if the provider omits one.
      if (yativoQuote.customerTotalAmountDue === undefined || yativoQuote.customerReceiveAmount === undefined) {
        throw new AppError("The payment provider didn't return a complete quote. Please try again.", 502, "PROVIDER_ERROR");
      }

      const toMinor = (majorAmount: string, decimals: number) => Math.round(Number(majorAmount) * 10 ** decimals).toString();

      return reply.send({
        quoteId: yativoQuote.quoteId,
        debitCurrency,
        payoutCurrency,
        debitDecimals: debitCurrencyRow.decimals,
        payoutDecimals,
        methodId: String(gatewayId),
        rate: yativoQuote.rate,
        debitAmountMinor: toMinor(yativoQuote.customerTotalAmountDue, debitCurrencyRow.decimals),
        receiveAmountMinor: toMinor(yativoQuote.customerReceiveAmount, payoutDecimals),
        expiresAt: yativoQuote.expiresAt,
      });
    },
  );
}
