import { randomUUID } from "node:crypto";
import type { Card, PrismaClient } from "@prisma/client";
import { AppError, NotFoundError, InsufficientFundsError } from "../../lib/errors.js";
import { requireKycApprovedForService } from "../../lib/requireKycApproved.js";
import { yativoClient } from "../../lib/yativoClient.js";
import { ensureYativoCustomer } from "../../lib/ensureYativoCustomer.js";
import { postTransaction } from "../ledger/postTransaction.js";
import { settlePendingTransaction } from "../ledger/settlePendingTransaction.js";
import { reverseTransaction } from "../ledger/reverseTransaction.js";
import { getAvailableBalance } from "../ledger/balances.js";
import { ensurePlatformAccount } from "../ledger/accounts.js";
import logger from "../../lib/logger.js";

const CARD_CURRENCY = "USD";

export function cardToDto(card: Card) {
  return {
    id: card.id,
    customerId: card.customerId,
    yativoCardId: card.yativoCardId,
    network: card.network,
    last4: card.last4,
    status: card.status,
    createdAt: card.createdAt.toISOString(),
  };
}

/** Idempotent from our side (guarded by cardsActivatedAt) even though the guide doesn't document the issuer call itself as safely repeatable. Required once per customer before their first card. */
async function ensureCardsActivated(prisma: PrismaClient, customerId: string, yativoCustomerId: string): Promise<void> {
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
  if (customer.cardsActivatedAt) return;
  await yativoClient.fiat.cards.activateCustomer(yativoCustomerId);
  await prisma.customer.update({ where: { id: customerId }, data: { cardsActivatedAt: new Date() } });
}

/**
 * Card creation funds it up-front (Yativo's create-card call takes an initial balance), so this
 * follows the same reserve-then-settle pattern as a payout: hold the funds, call Yativo, then
 * settle the hold into a real debit — or release it if Yativo's call fails. Card creation is
 * synchronous (no webhook to wait for), so the hold is settled immediately rather than by a later
 * callback. Immediately after creation, this also fetches the card once (getCard) purely to
 * extract last4 for display — the full PAN/CVV from that call is discarded, never stored.
 */
export async function issueCard(prisma: PrismaClient, customerId: string, amountMinor: bigint) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new NotFoundError("Customer");
  await requireKycApprovedForService(prisma, "CARD", customer);

  // Resolved up front (not just before the Yativo create() call below) so the "virtual_card"
  // endorsement check can run before any funds are put on hold — a rejected endorsement
  // shouldn't need a compensating reversal the way a failed Yativo call does.
  const yativoCustomerId = await ensureYativoCustomer(prisma, customer);
  const { endorsements } = await yativoClient.fiat.customers.get(yativoCustomerId);
  const cardEndorsement = endorsements.find((e) => e.service === "virtual_card");
  if (cardEndorsement?.status !== "approved") {
    throw new AppError(
      "This account isn't yet approved to issue virtual cards — the virtual_card verification is still pending.",
      409,
      "ENDORSEMENT_REQUIRED",
    );
  }

  const currency = await prisma.currency.findUniqueOrThrow({ where: { code: CARD_CURRENCY } });
  const amount = Number(amountMinor) / 10 ** currency.decimals;
  if (amount < 3) throw new AppError("Card minimum initial funding is $3.", 400, "CARD_MINIMUM_FUNDING");

  const activeCount = await prisma.card.count({ where: { customerId, status: { in: ["ACTIVE", "FROZEN"] } } });
  if (activeCount >= 3) throw new AppError("You can have at most 3 active cards.", 409, "CARD_LIMIT_REACHED");

  const walletAccount = await prisma.account.findFirst({ where: { type: "CUSTOMER_WALLET", customerId, currencyCode: CARD_CURRENCY } });
  if (!walletAccount) throw new NotFoundError("Wallet");

  const available = await getAvailableBalance(prisma, walletAccount.id, "CUSTOMER_WALLET");
  if (available < amountMinor) throw new InsufficientFundsError(walletAccount.id);

  const settlement = await ensurePlatformAccount(prisma, "YATIVO_SETTLEMENT", CARD_CURRENCY);
  const suspense = await ensurePlatformAccount(prisma, "SUSPENSE_PENDING", CARD_CURRENCY);

  const cardId = randomUUID();
  const pendingTx = await postTransaction(prisma, {
    type: "CARD_TOPUP",
    status: "PENDING",
    idempotencyKey: `card-fund:${cardId}`,
    externalSource: "MANUAL",
    description: `Initial funding for new card`,
    lines: [
      { accountId: walletAccount.id, direction: "DEBIT", amountMinor, currencyCode: CARD_CURRENCY },
      { accountId: suspense.id, direction: "CREDIT", amountMinor, currencyCode: CARD_CURRENCY },
    ],
    enforceNonNegativeOn: [walletAccount.id],
  });

  let result;
  try {
    await ensureCardsActivated(prisma, customerId, yativoCustomerId);
    result = await yativoClient.fiat.cards.create({ yativoCustomerId, amount, idempotencyKey: cardId });
  } catch (err) {
    await reverseTransaction(prisma, pendingTx.id, "card issuance failed");
    throw err;
  }

  await settlePendingTransaction(
    prisma,
    pendingTx.id,
    [
      { accountId: walletAccount.id, direction: "DEBIT", amountMinor, currencyCode: CARD_CURRENCY },
      { accountId: settlement.id, direction: "CREDIT", amountMinor, currencyCode: CARD_CURRENCY },
    ],
    { type: "CARD_TOPUP", externalSource: "SYSTEM", description: `Card funding settled` },
  );

  // Best-effort: last4 is purely a display nicety, so a failure here shouldn't fail card creation
  // — the card was already successfully issued and funded on Yativo's side at this point.
  // Confirmed live: a card is sometimes not immediately fetchable right after create() (a brief
  // eventual-consistency gap), so this retries once after a short delay before giving up.
  let last4: string | null = null;
  for (const delayMs of [0, 3000]) {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    try {
      const detail = await yativoClient.fiat.cards.getCard(result.yativoCardId);
      last4 = detail.last4 ?? null;
      break;
    } catch (err) {
      logger.warn({ err, yativoCardId: result.yativoCardId, delayMs }, "Could not fetch card detail for last4 right after issuance");
    }
  }

  const card = await prisma.card.create({
    data: {
      id: cardId,
      customerId,
      yativoCardId: result.yativoCardId,
      network: result.brand.toUpperCase(),
      last4: last4 ?? "0000",
      status: "ACTIVE",
      type: "VIRTUAL",
      currencyCode: CARD_CURRENCY,
    },
  });
  return cardToDto(card);
}

async function findOwnedCard(prisma: PrismaClient, cardId: string, scopeCustomerId?: string): Promise<Card> {
  const card = await prisma.card.findFirst({ where: { id: cardId, ...(scopeCustomerId ? { customerId: scopeCustomerId } : {}) } });
  if (!card) throw new NotFoundError("Card");
  if (!card.yativoCardId) throw new AppError("This card was never linked to Yativo.", 409, "CARD_NOT_LINKED");
  return card;
}

/**
 * Full PAN + CVV, fetched fresh on every call — never persisted, never logged. Callers (routes)
 * are responsible for not echoing this into any log statement either.
 */
export async function revealCard(prisma: PrismaClient, cardId: string, scopeCustomerId?: string) {
  const card = await findOwnedCard(prisma, cardId, scopeCustomerId);
  const detail = await yativoClient.fiat.cards.getCard(card.yativoCardId!);
  return { cardNumber: detail.cardNumber, cvv: detail.cvv, expiry: detail.expiry };
}

export async function listCardTransactions(prisma: PrismaClient, cardId: string, scopeCustomerId?: string) {
  const card = await findOwnedCard(prisma, cardId, scopeCustomerId);
  return yativoClient.fiat.cards.listTransactions(card.yativoCardId!);
}

/** Richer than listPortalCards/listAdminCards — fetches the live card from Yativo for fields (billing address, brand, program, spend-to-date) that only exist on the issuer's side, not in our local ledger row. */
export async function getCardDetail(prisma: PrismaClient, cardId: string, scopeCustomerId?: string) {
  const card = await findOwnedCard(prisma, cardId, scopeCustomerId);
  const detail = await yativoClient.fiat.cards.getCard(card.yativoCardId!);
  return {
    ...cardToDto(card),
    cardholderName: detail.cardholderName ?? null,
    cardBrand: detail.cardBrand ?? null,
    cardProgram: detail.cardProgram ?? null,
    maskedPan: detail.maskedPan ?? null,
    contactlessPayment: detail.contactlessPayment ?? null,
    balance: detail.balance ?? null,
    spentThisMonth: detail.spentThisMonth ?? null,
    toppedUpThisMonth: detail.toppedUpThisMonth ?? null,
    billingAddress: detail.billingAddress
      ? {
          line1: detail.billingAddress.line1 ?? null,
          line2: detail.billingAddress.line2 ?? null,
          city: detail.billingAddress.city ?? null,
          state: detail.billingAddress.state ?? null,
          postalCode: detail.billingAddress.postalCode ?? null,
          country: detail.billingAddress.country ?? null,
        }
      : null,
  };
}

/**
 * Debits the wallet and credits the card via the same reserve-then-settle pattern as issuance.
 */
export async function topupCard(prisma: PrismaClient, cardId: string, amountMinor: bigint, scopeCustomerId?: string) {
  const card = await findOwnedCard(prisma, cardId, scopeCustomerId);
  if (card.status !== "ACTIVE") throw new AppError("Only an active card can be topped up.", 409, "CARD_NOT_ACTIVE");

  const currency = await prisma.currency.findUniqueOrThrow({ where: { code: CARD_CURRENCY } });
  const amount = Number(amountMinor) / 10 ** currency.decimals;

  const walletAccount = await prisma.account.findFirst({ where: { type: "CUSTOMER_WALLET", customerId: card.customerId, currencyCode: CARD_CURRENCY } });
  if (!walletAccount) throw new NotFoundError("Wallet");

  const available = await getAvailableBalance(prisma, walletAccount.id, "CUSTOMER_WALLET");
  if (available < amountMinor) throw new InsufficientFundsError(walletAccount.id);

  const settlement = await ensurePlatformAccount(prisma, "YATIVO_SETTLEMENT", CARD_CURRENCY);
  const suspense = await ensurePlatformAccount(prisma, "SUSPENSE_PENDING", CARD_CURRENCY);

  const topupId = randomUUID();
  const pendingTx = await postTransaction(prisma, {
    type: "CARD_TOPUP",
    status: "PENDING",
    idempotencyKey: `card-topup:${topupId}`,
    externalSource: "MANUAL",
    description: `Top-up for card ${card.id}`,
    lines: [
      { accountId: walletAccount.id, direction: "DEBIT", amountMinor, currencyCode: CARD_CURRENCY },
      { accountId: suspense.id, direction: "CREDIT", amountMinor, currencyCode: CARD_CURRENCY },
    ],
    enforceNonNegativeOn: [walletAccount.id],
  });

  try {
    await yativoClient.fiat.cards.topup({ cardId: card.yativoCardId!, amount, idempotencyKey: topupId });
  } catch (err) {
    await reverseTransaction(prisma, pendingTx.id, "card top-up failed");
    throw err;
  }

  await settlePendingTransaction(
    prisma,
    pendingTx.id,
    [
      { accountId: walletAccount.id, direction: "DEBIT", amountMinor, currencyCode: CARD_CURRENCY },
      { accountId: settlement.id, direction: "CREDIT", amountMinor, currencyCode: CARD_CURRENCY },
    ],
    { type: "CARD_TOPUP", externalSource: "SYSTEM", description: `Card top-up settled` },
  );

  return cardToDto(card);
}

/**
 * Yativo deducts a termination-style fee from the withdrawn amount before crediting the wallet,
 * and doesn't document the exact net amount in the response — so unlike topup, this does NOT
 * post a ledger credit for a guessed amount (crediting the wrong figure is worse than not
 * crediting automatically). The withdrawal itself goes through; reconciling the wallet credit is
 * left to the existing admin reconciliation tool, which compares ledger vs. upstream balances.
 */
export async function withdrawFromCard(prisma: PrismaClient, cardId: string, amountMinor: bigint, scopeCustomerId?: string) {
  const card = await findOwnedCard(prisma, cardId, scopeCustomerId);
  if (card.status !== "ACTIVE") throw new AppError("Only an active card can be withdrawn from.", 409, "CARD_NOT_ACTIVE");

  const currency = await prisma.currency.findUniqueOrThrow({ where: { code: CARD_CURRENCY } });
  const amount = Number(amountMinor) / 10 ** currency.decimals;

  const result = await yativoClient.fiat.cards.withdraw({ cardId: card.yativoCardId!, amount, idempotencyKey: randomUUID() });
  logger.info({ cardId: card.id, requestedAmount: amount, response: result.raw }, "Card withdrawal submitted — wallet credit not auto-posted, see reconciliation");
  return cardToDto(card);
}

/**
 * ⚠️ Known server-side inconsistency: the freeze/unfreeze action isn't always what actually
 * determines state at the issuer. Re-fetches the card after the update call and only accepts the
 * new local status if the issuer actually confirms it — otherwise throws, so the UI shows "didn't
 * take effect" instead of silently trusting a success response that didn't do anything.
 */
async function setFrozen(prisma: PrismaClient, cardId: string, frozen: boolean, scopeCustomerId?: string) {
  const card = await findOwnedCard(prisma, cardId, scopeCustomerId);
  await yativoClient.fiat.cards.setFreezeState(card.yativoCardId!, frozen ? "freeze" : "unfreeze");

  const detail = await yativoClient.fiat.cards.getCard(card.yativoCardId!);
  const issuerStatus = detail.status?.toLowerCase();
  const confirmed = issuerStatus ? (frozen ? issuerStatus.includes("froz") : !issuerStatus.includes("froz")) : undefined;
  if (confirmed === false) {
    throw new AppError(
      `The card issuer didn't actually ${frozen ? "freeze" : "unfreeze"} this card (reported status: ${detail.status}). Try again in a moment.`,
      502,
      "CARD_FREEZE_NOT_CONFIRMED",
    );
  }

  const updated = await prisma.card.update({ where: { id: cardId }, data: { status: frozen ? "FROZEN" : "ACTIVE" } });
  return cardToDto(updated);
}

export async function freezeCard(prisma: PrismaClient, cardId: string, scopeCustomerId?: string) {
  return setFrozen(prisma, cardId, true, scopeCustomerId);
}

export async function unfreezeCard(prisma: PrismaClient, cardId: string, scopeCustomerId?: string) {
  return setFrozen(prisma, cardId, false, scopeCustomerId);
}

export async function setCardAirlinePayments(prisma: PrismaClient, cardId: string, enabled: boolean, scopeCustomerId?: string) {
  const card = await findOwnedCard(prisma, cardId, scopeCustomerId);
  await yativoClient.fiat.cards.setAirlinePayments(card.yativoCardId!, enabled);
  return cardToDto(card);
}

/**
 * Not reversible — the route layer is responsible for making the user confirm before calling
 * this. Any remaining card balance is refunded to the wallet automatically on Yativo's side, but
 * the response carries no amount to credit against our own ledger, so (like withdraw) that
 * refund isn't auto-posted here — status is updated optimistically per the guide's own guidance.
 */
export async function terminateCard(prisma: PrismaClient, cardId: string, scopeCustomerId?: string) {
  const card = await findOwnedCard(prisma, cardId, scopeCustomerId);
  await yativoClient.fiat.cards.terminate(card.yativoCardId!, randomUUID());
  const updated = await prisma.card.update({ where: { id: cardId }, data: { status: "CLOSED" } });
  return cardToDto(updated);
}

export async function listPortalCards(prisma: PrismaClient, customerId: string) {
  const cards = await prisma.card.findMany({ where: { customerId }, orderBy: { createdAt: "desc" } });
  return cards.map(cardToDto);
}

export async function listAdminCards(prisma: PrismaClient, page: number, pageSize: number) {
  const [total, cards] = await Promise.all([
    prisma.card.count(),
    prisma.card.findMany({
      include: { customer: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  const items = cards.map((c) => ({ ...cardToDto(c), customerName: c.customer.fullName ?? c.customer.businessName ?? null }));
  return { items, total, page, pageSize };
}
