import type { PrismaClient } from "@prisma/client";
import type { BusinessSpendCardEventPayload } from "@white-label/yativo-sdk";
import type { WebhookHandlerResult } from "./result.js";

/**
 * `business_spend_card.*` — Yativo calling us about the Business Spend Card product (see
 * modules/businessSpendCards). Every action that originates on OUR side (create, wallet, status,
 * pin, limits) already updates local state and posts any ledger entries synchronously at call
 * time — these webhooks arrive after the fact and are treated as a safety net, not the primary
 * source of truth, so `.funded`/`.withdrawn`/`.pin_updated`/`.limits_updated` are recorded (see
 * yativo.routes.ts) but never re-post to the ledger here, which would double-charge a customer on
 * replay. `.terminated` is the one exception worth reconciling: it can also fire automatically
 * after a `withdraw` empties a card (flagged by `reason: "balance_withdrawn_in_full"`), so this
 * catches the case where that synchronous update (see businessSpendCards.service.ts's
 * walletAction) was missed for any reason.
 */
export async function handleBusinessSpendCardEvent(
  prisma: PrismaClient,
  eventType: string,
  payload: BusinessSpendCardEventPayload,
): Promise<WebhookHandlerResult> {
  const card = await prisma.businessSpendCard.findFirst({ where: { yativoCardId: payload.yativoCardId } });
  if (!card) {
    return { status: "IGNORED", errorMessage: `No local Business Spend Card found for yativoCardId ${payload.yativoCardId}` };
  }

  switch (eventType) {
    case "business_spend_card.activated":
      if (card.status !== "ACTIVE") await prisma.businessSpendCard.update({ where: { id: card.id }, data: { status: "ACTIVE" } });
      return { status: "PROCESSED" };
    case "business_spend_card.suspended":
      if (card.status !== "SUSPENDED") await prisma.businessSpendCard.update({ where: { id: card.id }, data: { status: "SUSPENDED" } });
      return { status: "PROCESSED" };
    case "business_spend_card.terminated":
      if (card.status !== "TERMINATED") await prisma.businessSpendCard.update({ where: { id: card.id }, data: { status: "TERMINATED" } });
      return { status: "PROCESSED" };
    case "business_spend_card.created":
    case "business_spend_card.funded":
    case "business_spend_card.withdrawn":
    case "business_spend_card.pin_updated":
    case "business_spend_card.limits_updated":
      // Already handled synchronously by the API call that triggered it — recorded for the admin
      // webhook log only, never re-applied here.
      return { status: "IGNORED", errorMessage: `${eventType} is applied synchronously; webhook recorded for audit only` };
    default:
      return { status: "IGNORED", errorMessage: `Unrecognized business_spend_card event: ${eventType}` };
  }
}
