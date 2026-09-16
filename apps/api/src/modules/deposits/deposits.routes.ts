import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { depositCountrySchema, depositMethodSchema, createDepositSchema, depositResultSchema, depositQuoteRequestSchema, depositQuoteSchema } from "@white-label/shared-types";
import { requireCustomerAuth } from "../../middleware/requireCustomerAuth.js";
import { requirePortalPermission } from "../../middleware/requirePortalPermission.js";
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
import { filterEnabledGateways } from "../../lib/paymentGatewayOverrides.js";
import { loadEndorsementEligibilityResolver, requireEndorsementApproved, isEndorsementRestrictedForCustomer } from "../../lib/endorsementEligibility.js";
import { AppError } from "../../lib/errors.js";

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
      const customer = await app.prisma.customer.findUniqueOrThrow({ where: { id: resolveEffectiveCustomerId(request.customer!) } });
      const methods = await yativoClient.fiat.paymentMethods.listPayinMethodsByCountry({ country: request.query.country });
      const active = methods.filter((m) => m.active);
      const enabled = await filterEnabledGateways(app.prisma, "PAYIN", active);

      // Browsing methods is allowed before KYC/Yativo registration (only the actual quote/initiate
      // steps require it) — if the customer isn't registered with Yativo yet, there's no
      // endorsement checklist to check against, so every gated method is reported not-yet-eligible
      // (status unknown) rather than erroring the whole list out.
      const resolveEligibility = customer.yativoCustomerId
        ? await loadEndorsementEligibilityResolver(app.prisma, customer)
        : (endorsement: string | null) => (endorsement ? { eligible: false, endorsementStatus: null, hostedKycUrl: null } : { eligible: true, endorsementStatus: null, hostedKycUrl: null });
      return reply.send(
        enabled
          .filter((m) => !isEndorsementRestrictedForCustomer(m.endorsement, customer))
          .map((m) => ({ ...m, ...resolveEligibility(m.endorsement) })),
      );
    },
  );

  server.post(
    "/portal/deposit/quote",
    {
      preHandler: [requireCustomerAuth, requirePortalPermission("deposits.manage")],
      schema: { body: depositQuoteRequestSchema, response: { 200: depositQuoteSchema } },
    },
    async (request, reply) => {
      const customer = await app.prisma.customer.findUniqueOrThrow({ where: { id: resolveEffectiveCustomerId(request.customer!) } });
      await requireKycApprovedForService(app.prisma, "DEPOSIT", customer);

      // Re-resolved fresh from Yativo rather than trusted from the client — same rationale as
      // virtualAccounts.routes.ts's POST gate. `country` is only needed to re-look-up this
      // gateway's current endorsement requirement; nothing else here depends on it.
      const chosenMethod = (await yativoClient.fiat.paymentMethods.listPayinMethodsByCountry({ country: request.body.country })).find(
        (m) => m.gatewayId === request.body.gatewayId,
      );
      if (!chosenMethod) {
        throw new AppError("This deposit gateway is no longer available.", 404, "UNSUPPORTED_GATEWAY");
      }
      await requireEndorsementApproved(app.prisma, customer, chosenMethod.endorsement, "This deposit gateway");

      const yativoQuote = await yativoClient.fiat.quotes.createPayin({
        fromCurrency: request.body.localCurrency,
        toCurrency: request.body.walletCurrencyCode,
        methodId: Number(request.body.gatewayId),
        amount: Number(request.body.amount),
      });

      const walletCurrency = await app.prisma.currency.findUnique({ where: { code: request.body.walletCurrencyCode } });

      // `creditedAmount` is already in the TO currency (the wallet) — used as-is. `totalFees`,
      // however, is denominated in the FROM currency (the local/method currency), confirmed
      // against a live NGN quote (localAmount 6000, rate 1410.9832, totalFees 1530.98,
      // creditedAmount 3.17): credited_amount = (deposit_amount - total_fees) / exchange_rate.
      // (An earlier version of this code assumed totalFees was wallet-currency based on a COP
      // test at exchange_rate 1 — a rate of 1 can't actually distinguish the two currencies, so
      // that "confirmation" was inconclusive and the resulting conversion was wrong for any real
      // rate, producing a wildly inflated platformFee and a negative netReceiveAmount.)
      let platformFee: string | null = null;
      let platformFeeLocal: string | null = null;
      let netReceiveAmount: string | null = null;
      if (walletCurrency) {
        const creditedAmountMinor = majorToMinor(yativoQuote.creditedAmount, walletCurrency.decimals);

        // Convert totalFees from local currency into wallet-currency terms — same direction
        // /portal/deposit/initiate uses for `transactionFee` below (divide by rate).
        const rate = Number(yativoQuote.exchangeRate);
        const yativoFeeMinor = Number.isFinite(rate) && rate > 0
          ? majorToMinor(Number(yativoQuote.totalFees) / rate, walletCurrency.decimals)
          : 0n;

        // This platform's own fee (admin-configured global default, or a per-customer override),
        // computed on top of the amount that would actually land after Yativo's own fees — the
        // exact same base + upstream-fee convention /portal/deposit/initiate already uses, so the
        // number shown here at quote time never drifts from what actually settles.
        const platformFeeMinor = await getEffectiveFee(app.prisma, "PAYIN", customer.id, creditedAmountMinor, yativoFeeMinor);
        const netReceiveAmountMinor = creditedAmountMinor - platformFeeMinor;

        const feeMajorInWallet = Number(platformFeeMinor) / 10 ** walletCurrency.decimals;
        platformFee = feeMajorInWallet.toFixed(walletCurrency.decimals);
        // Same wallet->local direction /portal/deposit/initiate uses for its own platformFeeLocal
        // (multiply by rate). Left null if the rate is zero/unparseable.
        if (Number.isFinite(rate) && rate > 0) {
          platformFeeLocal = (feeMajorInWallet * rate).toFixed(2);
        }
        netReceiveAmount = (Number(netReceiveAmountMinor) / 10 ** walletCurrency.decimals).toFixed(walletCurrency.decimals);
      }

      return reply.send({
        quoteId: yativoQuote.quoteId,
        walletCurrencyCode: request.body.walletCurrencyCode,
        localCurrency: request.body.localCurrency,
        rate: yativoQuote.exchangeRate,
        localAmount: request.body.amount,
        yativoFee: yativoQuote.totalFees,
        creditedAmount: yativoQuote.creditedAmount,
        platformFee,
        platformFeeLocal,
        netReceiveAmount,
        expiresAt: yativoQuote.expiresAt,
      });
    },
  );

  server.post(
    "/portal/deposit/initiate",
    {
      preHandler: [requireCustomerAuth, requirePortalPermission("deposits.manage")],
      schema: { body: createDepositSchema, response: { 200: depositResultSchema, 404: errorResponseSchema } },
    },
    async (request, reply) => {
      const customer = await app.prisma.customer.findUniqueOrThrow({ where: { id: resolveEffectiveCustomerId(request.customer!) } });
      await requireKycApprovedForService(app.prisma, "DEPOSIT", customer);

      // Authoritative gate — run before any Yativo call, same as issueCard's endorsement check
      // (see cards.service.ts), so a rejected endorsement never needs a compensating reversal.
      const chosenMethod = (await yativoClient.fiat.paymentMethods.listPayinMethodsByCountry({ country: request.body.country })).find(
        (m) => m.gatewayId === request.body.gatewayId,
      );
      if (!chosenMethod) {
        throw new AppError("This deposit gateway is no longer available.", 404, "UNSUPPORTED_GATEWAY");
      }
      await requireEndorsementApproved(app.prisma, customer, chosenMethod.endorsement, "This deposit gateway");

      const yativoCustomerId = await ensureYativoCustomer(app.prisma, customer);

      const idempotencyKey = randomUUID();
      const result = await yativoClient.fiat.deposits.create({
        yativoCustomerId,
        gatewayId: request.body.gatewayId,
        walletCurrencyCode: request.body.walletCurrencyCode,
        quoteId: request.body.quoteId,
        amount: request.body.amount !== undefined ? Number(request.body.amount) : undefined,
        extraData: request.body.extraData,
        returnUrl: `${env.WEB_APP_URL}/portal/deposit`,
        idempotencyKey,
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
        let platformFeeMinor = 0n;
        if (walletCurrency && result.receiveAmount) {
          const receiveAmountMinor = majorToMinor(result.receiveAmount, walletCurrency.decimals);

          // Locked in now — not recomputed at settlement (see settlePayoutCompleted's doc
          // comment for the same rationale on the payout side) — so the wallet is credited the
          // correct net amount from this very first PENDING hold, and deposit.handler.ts settles
          // using this exact figure rather than a second, disconnected debit later.
          platformFeeMinor = await getEffectiveFee(app.prisma, "PAYIN", customer.id, receiveAmountMinor, yativoFeeMinor ?? 0n);
          const netReceiveAmountMinor = receiveAmountMinor - platformFeeMinor;

          // Posted as PENDING so this deposit shows up in the customer's transaction history
          // right away, instead of being invisible until (and unless) the deposit.confirmed
          // webhook lands — mirrors createPortalPayout's PENDING hold at submission. Unlike a
          // payout hold, this CREDITs the wallet (its normal/increasing direction) rather than
          // debiting it, which getPendingHold deliberately never counts toward available balance
          // (see ledger/balances.ts) — so it's purely informational and can't be spent against.
          // Split into net wallet credit + fee revenue credit here (rather than one gross credit
          // settled by a later, separate fee debit) so the customer sees the correct net amount
          // immediately, and the two never drift apart. The fee revenue credit is safe to post
          // even while PENDING — a PENDING line never moves an account's posted balance (see
          // postTransaction's doc comment) — it's actually recognized only once this settles.
          // Settled (reversed + re-posted against the real settlement account), not just left
          // alone, once deposit.handler.ts confirms the deposit — see settlePendingTransaction there.
          const suspense = await ensurePlatformAccount(app.prisma, "SUSPENSE_PENDING", request.body.walletCurrencyCode);
          const lines = [
            { accountId: suspense.id, direction: "DEBIT" as const, amountMinor: receiveAmountMinor, currencyCode: request.body.walletCurrencyCode },
            { accountId: wallet.id, direction: "CREDIT" as const, amountMinor: netReceiveAmountMinor, currencyCode: request.body.walletCurrencyCode },
          ];
          if (platformFeeMinor > 0n) {
            const feeRevenue = await ensurePlatformAccount(app.prisma, "PLATFORM_FEE_REVENUE", request.body.walletCurrencyCode);
            lines.push({ accountId: feeRevenue.id, direction: "CREDIT" as const, amountMinor: platformFeeMinor, currencyCode: request.body.walletCurrencyCode });
          }
          const pendingTx = await postTransaction(app.prisma, {
            type: "DEPOSIT",
            status: "PENDING",
            idempotencyKey: `deposit:${result.depositId}`,
            externalSource: "MANUAL",
            externalRef: result.depositId,
            // No provider name here — this is customer-facing (shown as the transaction's
            // subtitle); the reference id is already surfaced separately via externalRef.
            description: "Deposit initiated",
            lines,
          });
          pendingTransactionId = pendingTx.id;

          const feeMajorInWallet = Number(platformFeeMinor) / 10 ** walletCurrency.decimals;
          platformFee = feeMajorInWallet.toFixed(walletCurrency.decimals);
          // Also shown in the deposit's local/method currency (what the customer is actually
          // paying with) alongside the wallet-currency figure above — same `rate` Yativo quoted
          // for this deposit ("1 USD = 1343.3322 NGN"), so it's exactly consistent with "Amount
          // to pay" above it. Left null if the rate string didn't parse.
          if (rate !== undefined && rate > 0) {
            platformFeeLocal = (feeMajorInWallet * rate).toFixed(2);
          }
          netReceiveAmount = (Number(netReceiveAmountMinor) / 10 ** walletCurrency.decimals).toFixed(walletCurrency.decimals);
        }

        await app.prisma.deposit.create({
          data: {
            customerId: customer.id,
            currencyCode: request.body.walletCurrencyCode,
            yativoDepositId: result.depositId,
            yativoIdempotencyKey: idempotencyKey,
            yativoFeeMinor,
            platformFeeMinor,
            grossAmountMinor: result.receiveAmount && walletCurrency ? majorToMinor(result.receiveAmount, walletCurrency.decimals) : null,
            exchangeRate: result.exchangeRate,
            localCurrency: result.localCurrency,
            localAmount: result.localAmount,
            transactionId: pendingTransactionId,
          },
        });
      }

      // Fired immediately on submission — separate from DEPOSIT_RECEIVED, which only fires once
      // the deposit.confirmed webhook lands (and today, that webhook path is unreachable in local
      // dev, so this is the one confirmation a customer reliably gets for now).
      await sendNotificationEmail(app.prisma, "DEPOSIT_CREATED", customer.id, {
        amount: result.receiveAmount ?? request.body.amount ?? result.localAmount ?? "",
        currency: request.body.walletCurrencyCode,
      });

      return reply.send({ ...result, platformFee, platformFeeLocal, netReceiveAmount });
    },
  );
}
