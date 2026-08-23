import type { PrismaClient } from "@prisma/client";
import type { CardTransactionCompletedPayload } from "@white-label/yativo-sdk";
import { postTransaction } from "../../modules/ledger/postTransaction.js";
import { ensurePlatformAccount } from "../../modules/ledger/accounts.js";
import type { WebhookHandlerResult } from "./result.js";

export async function handleCardTransactionCompleted(
  prisma: PrismaClient,
  payload: CardTransactionCompletedPayload,
  externalEventId: string,
): Promise<WebhookHandlerResult> {
  const card = await prisma.card.findFirst({ where: { yativoCardId: payload.yativoCardId } });
  if (!card) {
    return { status: "FAILED", errorMessage: `No card found for yativoCardId ${payload.yativoCardId}` };
  }

  const walletAccount = await prisma.account.findFirst({
    where: { type: "CUSTOMER_WALLET", customerId: card.customerId, currencyCode: payload.currencyCode },
  });
  if (!walletAccount) {
    return { status: "FAILED", errorMessage: `No ${payload.currencyCode} wallet for customer ${card.customerId}` };
  }

  const clearing = await ensurePlatformAccount(prisma, "YATIVO_CLEARING", payload.currencyCode);

  await postTransaction(prisma, {
    type: "CARD_WITHDRAWAL",
    status: "POSTED",
    idempotencyKey: `webhook:${externalEventId}`,
    externalSource: "YATIVO_WEBHOOK",
    description: payload.merchantName ? `Card purchase at ${payload.merchantName}` : "Card transaction",
    lines: [
      { accountId: walletAccount.id, direction: "DEBIT", amountMinor: BigInt(payload.amountMinor), currencyCode: payload.currencyCode },
      { accountId: clearing.id, direction: "CREDIT", amountMinor: BigInt(payload.amountMinor), currencyCode: payload.currencyCode },
    ],
  });

  return { status: "PROCESSED" };
}
