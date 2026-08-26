import type { PrismaClient } from "@prisma/client";
import type { DepositConfirmedPayload } from "@white-label/yativo-sdk";
import { postTransaction } from "../../modules/ledger/postTransaction.js";
import { ensurePlatformAccount, ensureCustomerWalletAccount } from "../../modules/ledger/accounts.js";
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
      { accountId: settlement.id, direction: "DEBIT", amountMinor: BigInt(payload.amountMinor), currencyCode: payload.currencyCode },
      { accountId: wallet.id, direction: "CREDIT", amountMinor: BigInt(payload.amountMinor), currencyCode: payload.currencyCode },
    ],
  });

  await sendNotificationEmail(prisma, "DEPOSIT_RECEIVED", customer.id, {
    amount: await formatMinorAmount(prisma, payload.currencyCode, BigInt(payload.amountMinor)),
    currency: payload.currencyCode,
  });

  return { status: "PROCESSED" };
}
