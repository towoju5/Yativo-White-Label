import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { depositCountrySchema, depositMethodSchema, createDepositSchema, depositResultSchema } from "@white-label/shared-types";
import { requireCustomerAuth } from "../../middleware/requireCustomerAuth.js";
import { resolveEffectiveCustomerId } from "../../lib/portalPrincipal.js";
import { yativoClient } from "../../lib/yativoClient.js";
import { ensureYativoCustomer } from "../../lib/ensureYativoCustomer.js";
import { ensureCustomerWalletAccount, ensurePlatformAccount } from "../ledger/accounts.js";
import { postTransaction } from "../ledger/postTransaction.js";
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
      const wallet = await ensureCustomerWalletAccount(app.prisma, customer.id, request.body.walletCurrencyCode);

      // Recorded so the deposit.confirmed webhook can recognize this as a payin (as opposed to an
      // unsolicited virtual-account transfer, which never hits this route) and, when pricing is
      // set to markup, add the platform's fee on top of what Yativo itself quoted here —
      // `transactionFee`/`exchangeRate` are human-readable strings ("3.4 MXN", "1 USD = 17.2 MXN"),
      // so this parse is best-effort and never blocks the deposit if it fails.
      let platformFee: string | null = null;
      let platformFeeLocal: string | null = null;
      let netReceiveAmount: string | null = null;
      if (result.depositId) {
        const walletCurrency = await app.prisma.currency.findUnique({ where: { code: request.body.walletCurrencyCode } });

        let yativoFeeMinor: bigint | null = null;
        const feeMajor = parseYativoFeeString(result.transactionFee);
        const rate = parseYativoFeeString(result.exchangeRate);
        if (feeMajor !== undefined && rate !== undefined && rate > 0 && walletCurrency) {
          yativoFeeMinor = majorToMinor(feeMajor / rate, walletCurrency.decimals);
        }

        let pendingTransactionId: string | null = null;
        if (walletCurrency && result.receiveAmount) {
          const receiveAmountMinor = majorToMinor(result.receiveAmount, walletCurrency.decimals);

          // Posted as PENDING so this deposit shows up in the customer's transaction history
          // right away, instead of being invisible until (and unless) the deposit.confirmed
          // webhook lands — mirrors createPortalPayout's PENDING hold at submission. Unlike a
          // payout hold, this CREDITs the wallet (its normal/increasing direction) rather than
          // debiting it, which getPendingHold deliberately never counts toward available balance
          // (see ledger/balances.ts) — so it's purely informational and can't be spent against.
          // Settled (reversed + re-posted against the real settlement account), not just left
          // alone, once deposit.handler.ts confirms the deposit — see settlePendingTransaction there.
          const suspense = await ensurePlatformAccount(app.prisma, "SUSPENSE_PENDING", request.body.walletCurrencyCode);
          const pendingTx = await postTransaction(app.prisma, {
            type: "DEPOSIT",
            status: "PENDING",
            idempotencyKey: `deposit:${result.depositId}`,
            externalSource: "MANUAL",
            externalRef: result.depositId,
            description: `Deposit initiated via Yativo (${result.depositId})`,
            lines: [
              { accountId: suspense.id, direction: "DEBIT", amountMinor: receiveAmountMinor, currencyCode: request.body.walletCurrencyCode },
              { accountId: wallet.id, direction: "CREDIT", amountMinor: receiveAmountMinor, currencyCode: request.body.walletCurrencyCode },
            ],
          });
          pendingTransactionId = pendingTx.id;

          // Previewed here so the customer sees what will actually come out of the deposit —
          // the same getEffectiveFee call the deposit.confirmed webhook makes at settlement (see
          // webhooks/handlers/deposit.handler.ts).
          const feeMinor = await getEffectiveFee(app.prisma, "PAYIN", customer.id, receiveAmountMinor, yativoFeeMinor ?? 0n);
          const feeMajorInWallet = Number(feeMinor) / 10 ** walletCurrency.decimals;
          platformFee = feeMajorInWallet.toFixed(walletCurrency.decimals);
          // Also shown in the deposit's local/method currency (what the customer is actually
          // paying with) alongside the wallet-currency figure above — same `rate` Yativo quoted
          // for this deposit ("1 USD = 1343.3322 NGN"), so it's exactly consistent with "Amount
          // to pay" above it. Left null if the rate string didn't parse.
          if (rate !== undefined && rate > 0) {
            platformFeeLocal = (feeMajorInWallet * rate).toFixed(2);
          }
          // `receiveAmount` above is Yativo's own figure — already net of Yativo's own
          // transactionFee, but NOT of this platform's fee, which is debited from the wallet
          // separately once the deposit.confirmed webhook lands. This is what will actually
          // remain in the wallet after that happens; shown as-is (can go negative) since a
          // misconfigured fee producing a negative net is exactly the kind of thing this should
          // surface loudly rather than hide.
          netReceiveAmount = ((Number(receiveAmountMinor - feeMinor)) / 10 ** walletCurrency.decimals).toFixed(walletCurrency.decimals);
        }

        await app.prisma.deposit.create({
          data: {
            customerId: customer.id,
            currencyCode: request.body.walletCurrencyCode,
            yativoDepositId: result.depositId,
            yativoFeeMinor,
            transactionId: pendingTransactionId,
          },
        });
      }

      // Fired immediately on submission — separate from DEPOSIT_RECEIVED, which only fires once
      // the deposit.confirmed webhook lands (and today, that webhook path is unreachable in local
      // dev, so this is the one confirmation a customer reliably gets for now).
      await sendNotificationEmail(app.prisma, "DEPOSIT_CREATED", customer.id, {
        amount: result.receiveAmount ?? request.body.amount,
        currency: request.body.walletCurrencyCode,
      });

      return reply.send({ ...result, platformFee, platformFeeLocal, netReceiveAmount });
    },
  );
}
