import type { PrismaClient } from "@prisma/client";
import type { VirtualCardTransactionPayload, VirtualCardDeactivatedPayload } from "@white-label/yativo-sdk";
import { postTransaction } from "../../modules/ledger/postTransaction.js";
import { ensurePlatformAccount } from "../../modules/ledger/accounts.js";
import { sendNotificationEmail } from "../../modules/notifications/notifications.service.js";
import { formatMinorAmount } from "../../lib/formatMoney.js";
import type { WebhookHandlerResult } from "./result.js";

/**
 * `virtualcard.deactivated` — the one event in the virtualcard.* family with an explicit `event`
 * field, sent when Yativo auto-freezes a card after repeated failed charge attempts. Just mirrors
 * that status locally; unlike a staff-initiated freeze, there's nothing to call back to Yativo for.
 */
export async function handleVirtualCardDeactivated(prisma: PrismaClient, payload: VirtualCardDeactivatedPayload): Promise<WebhookHandlerResult> {
  const card = await prisma.card.findFirst({ where: { yativoCardId: payload.cardId } });
  if (!card) {
    return { status: "FAILED", errorMessage: `No card found for yativoCardId ${payload.cardId}` };
  }
  if (card.status === "FROZEN" || card.status === "CLOSED") {
    return { status: "IGNORED", errorMessage: `Card already ${card.status}` };
  }

  const updated = await prisma.card.update({ where: { id: card.id }, data: { status: "FROZEN" } });
  await sendNotificationEmail(prisma, "CARD_FROZEN", updated.customerId, { last4: updated.last4 });
  return { status: "PROCESSED" };
}

/**
 * ⚠️ Not currently reachable from the dispatcher. This models `virtualcard.transaction.debit` (a
 * card purchase) correctly per Yativo's guide, but several sibling events in the same family
 * (.reversed, .declined, .declined.frozen, .declined.terminated, .authorization.failed,
 * .crossborder, .terminated.refund — and even .topup.success/.withdrawal.success) share an
 * identical field shape with no field naming the event, so this app can't yet tell a real approved
 * purchase apart from those without risking posting an incorrect ledger entry. Kept here, ready to
 * wire into dispatcher.ts, once Yativo confirms a reliable way to distinguish them (e.g. a
 * dedicated field, or per-event delivery paths) — see the comment on classifyVirtualCardEvent in
 * yativo.routes.ts.
 */
export async function handleCardTransactionDebit(prisma: PrismaClient, payload: VirtualCardTransactionPayload, externalEventId: string): Promise<WebhookHandlerResult> {
  const card = await prisma.card.findFirst({ where: { yativoCardId: payload.yativoCardId } });
  if (!card) {
    return { status: "FAILED", errorMessage: `No card found for yativoCardId ${payload.yativoCardId}` };
  }

  const walletAccount = await prisma.account.findFirst({
    where: { type: "CUSTOMER_WALLET", customerId: card.customerId, currencyCode: card.currencyCode },
  });
  if (!walletAccount) {
    return { status: "FAILED", errorMessage: `No ${card.currencyCode} wallet for customer ${card.customerId}` };
  }

  const clearing = await ensurePlatformAccount(prisma, "YATIVO_CLEARING", card.currencyCode);
  const amountMinor = BigInt(payload.amountMinor);

  await postTransaction(prisma, {
    type: "CARD_WITHDRAWAL",
    status: "POSTED",
    idempotencyKey: `webhook:${externalEventId}`,
    externalSource: "YATIVO_WEBHOOK",
    description: payload.merchantName ? `Card purchase at ${payload.merchantName}` : "Card transaction",
    lines: [
      { accountId: walletAccount.id, direction: "DEBIT", amountMinor, currencyCode: card.currencyCode },
      { accountId: clearing.id, direction: "CREDIT", amountMinor, currencyCode: card.currencyCode },
    ],
  });

  await sendNotificationEmail(prisma, "CARD_TRANSACTION", card.customerId, {
    amount: await formatMinorAmount(prisma, card.currencyCode, amountMinor),
    currency: card.currencyCode,
    merchant: payload.merchantName ?? "a merchant",
  });

  return { status: "PROCESSED" };
}
