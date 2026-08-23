import type { PrismaClient } from "@prisma/client";
import type { SwapCompletedPayload } from "@white-label/yativo-sdk";
import { postTransaction } from "../../modules/ledger/postTransaction.js";
import { ensurePlatformAccount, ensureCustomerWalletAccount } from "../../modules/ledger/accounts.js";
import type { WebhookHandlerResult } from "./result.js";

export async function handleSwapCompleted(
  prisma: PrismaClient,
  payload: SwapCompletedPayload,
  externalEventId: string,
): Promise<WebhookHandlerResult> {
  const customer = await prisma.customer.findFirst({ where: { yativoCustomerId: payload.yativoCustomerId } });
  if (!customer) {
    return { status: "FAILED", errorMessage: `No customer found for yativoCustomerId ${payload.yativoCustomerId}` };
  }

  const clearingSource = await ensurePlatformAccount(prisma, "YATIVO_CLEARING", payload.sourceCurrency);
  const clearingTarget = await ensurePlatformAccount(prisma, "YATIVO_CLEARING", payload.targetCurrency);
  const sourceWallet = await ensureCustomerWalletAccount(prisma, customer.id, payload.sourceCurrency);
  const targetWallet = await ensureCustomerWalletAccount(prisma, customer.id, payload.targetCurrency);

  // Two currency legs in one balanced transaction: source-currency lines net to zero,
  // target-currency lines net to zero — postTransaction checks each currency independently.
  await postTransaction(prisma, {
    type: "SWAP",
    status: "POSTED",
    idempotencyKey: `webhook:${externalEventId}`,
    externalSource: "YATIVO_WEBHOOK",
    description: `Swap ${payload.sourceCurrency} -> ${payload.targetCurrency}`,
    lines: [
      { accountId: sourceWallet.id, direction: "DEBIT", amountMinor: BigInt(payload.sourceAmountMinor), currencyCode: payload.sourceCurrency },
      { accountId: clearingSource.id, direction: "CREDIT", amountMinor: BigInt(payload.sourceAmountMinor), currencyCode: payload.sourceCurrency },
      { accountId: clearingTarget.id, direction: "DEBIT", amountMinor: BigInt(payload.targetAmountMinor), currencyCode: payload.targetCurrency },
      { accountId: targetWallet.id, direction: "CREDIT", amountMinor: BigInt(payload.targetAmountMinor), currencyCode: payload.targetCurrency },
    ],
  });

  return { status: "PROCESSED" };
}
