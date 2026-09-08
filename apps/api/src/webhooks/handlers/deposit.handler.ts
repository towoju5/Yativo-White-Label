import type { PrismaClient } from "@prisma/client";
import type { DepositConfirmedPayload } from "@white-label/yativo-sdk";
import { postTransaction } from "../../modules/ledger/postTransaction.js";
import { ensurePlatformAccount, ensureCustomerWalletAccount } from "../../modules/ledger/accounts.js";
import { getEffectiveFee } from "../../modules/pricing/pricing.service.js";
import { sendNotificationEmail } from "../../modules/notifications/notifications.service.js";
import { formatMinorAmount } from "../../lib/formatMoney.js";
import type { WebhookHandlerResult } from "./result.js";

export async function handleDepositConfirmed(
  prisma: PrismaClient,
  payload: DepositConfirmedPayload,
  externalEventId: string,
): Promise<WebhookHandlerResult> {
  const customer = await prisma.customer.findFirst({ where: { yativoCustomerId: payload.yativoCustomerId } });
  if (!customer) {
    return { status: "FAILED", errorMessage: `No customer found for yativoCustomerId ${payload.yativoCustomerId}` };
  }

  const settlement = await ensurePlatformAccount(prisma, "YATIVO_SETTLEMENT", payload.currencyCode);
  const wallet = await ensureCustomerWalletAccount(prisma, customer.id, payload.currencyCode);
  const amountMinor = BigInt(payload.amountMinor);

  await postTransaction(prisma, {
    type: "DEPOSIT",
    status: "POSTED",
    // Derived from the webhook's own externalEventId — replaying the same webhook
    // (e.g. after a retry) is a guaranteed no-op via postTransaction's idempotency check.
    idempotencyKey: `webhook:${externalEventId}`,
    externalSource: "YATIVO_WEBHOOK",
    externalRef: payload.yativoDepositId,
    description: `Deposit confirmed via Yativo (${payload.yativoDepositId})`,
    lines: [
      { accountId: settlement.id, direction: "DEBIT", amountMinor, currencyCode: payload.currencyCode },
      { accountId: wallet.id, direction: "CREDIT", amountMinor, currencyCode: payload.currencyCode },
    ],
  });

  // A payin (POST /portal/deposit/initiate) records itself here at initiation time; an
  // unsolicited transfer into a long-lived virtual account never does — that's the only signal
  // this app has to tell the two rails apart (see modules/deposits/deposits.routes.ts).
  const payinRecord = await prisma.deposit.findUnique({ where: { yativoDepositId: payload.yativoDepositId } });
  const service = payinRecord ? "PAYIN" : "VIRTUAL_ACCOUNT_DEPOSIT";
  const upstreamFeeMinor = payinRecord?.yativoFeeMinor ?? 0n;

  const feeMinor = await getEffectiveFee(prisma, service, customer.id, amountMinor, upstreamFeeMinor);
  if (feeMinor > 0n) {
    const feeRevenue = await ensurePlatformAccount(prisma, "PLATFORM_FEE_REVENUE", payload.currencyCode);
    await postTransaction(prisma, {
      type: "FEE",
      status: "POSTED",
      idempotencyKey: `fee:deposit:${externalEventId}`,
      externalSource: "YATIVO_WEBHOOK",
      description: `${service === "PAYIN" ? "Deposit" : "Virtual account deposit"} fee for ${payload.yativoDepositId}`,
      lines: [
        { accountId: wallet.id, direction: "DEBIT", amountMinor: feeMinor, currencyCode: payload.currencyCode },
        { accountId: feeRevenue.id, direction: "CREDIT", amountMinor: feeMinor, currencyCode: payload.currencyCode },
      ],
    });
  }

  await sendNotificationEmail(prisma, "DEPOSIT_RECEIVED", customer.id, {
    amount: await formatMinorAmount(prisma, payload.currencyCode, amountMinor),
    currency: payload.currencyCode,
  });

  return { status: "PROCESSED" };
}
