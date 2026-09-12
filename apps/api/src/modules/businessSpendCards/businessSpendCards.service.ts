import { randomUUID } from "node:crypto";
import type { BusinessSpendCard, PrismaClient } from "@prisma/client";
import type { BusinessSpendCardLimit } from "@white-label/shared-types";
import { AppError, NotFoundError, InsufficientFundsError } from "../../lib/errors.js";
import { requireKycApprovedForService } from "../../lib/requireKycApproved.js";
import { requireBusinessCustomer } from "../../lib/requireBusinessCustomer.js";
import { yativoClient } from "../../lib/yativoClient.js";
import { ensureYativoCustomer } from "../../lib/ensureYativoCustomer.js";
import { postTransaction } from "../ledger/postTransaction.js";
import { settlePendingTransaction } from "../ledger/settlePendingTransaction.js";
import { reverseTransaction } from "../ledger/reverseTransaction.js";
import { getAvailableBalance } from "../ledger/balances.js";
import { ensurePlatformAccount, ensureCustomerWalletAccount } from "../ledger/accounts.js";
import { getEffectiveFee } from "../pricing/pricing.service.js";
import { sendNotificationEmail } from "../notifications/notifications.service.js";
import { majorToMinor } from "../../lib/money.js";
import logger from "../../lib/logger.js";

// One cardholder per card, business customers only — a separate Yativo product from
// modules/cards (fiat/cards.ts's "virtual card"). Always USD on our side, same as that product.
const BSC_CURRENCY = "USD";

export function businessSpendCardToDto(card: BusinessSpendCard) {
  return {
    id: card.id,
    customerId: card.customerId,
    yativoCardId: card.yativoCardId,
    issuanceType: card.issuanceType,
    status: card.status,
    maskedPan: card.maskedPan,
    expirationDate: card.expirationDate,
    createdAt: card.createdAt.toISOString(),
  };
}

/**
 * Every prerequisite from the integration guide, checked independently (any one failing blocks
 * creation) — business-type + full KYC submitted are cheap local checks; the virtual_card
 * endorsement and can_create_vc flag both require a live fetch of the Yativo customer record.
 */
export async function issueBusinessSpendCard(prisma: PrismaClient, customerId: string, cardType: "VIRTUAL" | "PHYSICAL" = "VIRTUAL") {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new NotFoundError("Customer");

  requireBusinessCustomer(customer);
  // "Full KYC must be submitted" is looser than (and distinct from) the endorsement check below —
  // it only requires KYC to be past NOT_STARTED, not fully APPROVED.
  if (customer.kycStatus === "NOT_STARTED") {
    throw new AppError("Full KYC must be submitted for this customer before a Business Spend Card can be created.", 403, "KYC_NOT_SUBMITTED");
  }
  // Respects the admin's PlatformSettings.kycRequiredServices toggle, same as every other
  // product — separate from (and in addition to) the guide's own two checks.
  await requireKycApprovedForService(prisma, "BUSINESS_SPEND_CARD", customer);

  const yativoCustomerId = await ensureYativoCustomer(prisma, customer);
  const fiatCustomer = await yativoClient.fiat.customers.get(yativoCustomerId);

  const cardEndorsement = fiatCustomer.endorsements.find((e) => e.service === "virtual_card");
  if (cardEndorsement?.status !== "approved") {
    throw new AppError("This customer does not have an active virtual card endorsement.", 403, "ENDORSEMENT_REQUIRED");
  }
  if (fiatCustomer.canCreateVc !== true) {
    throw new AppError("customer is not yet provisioned for service.", 403, "NOT_PROVISIONED");
  }

  // No principal amount to reserve — card creation itself isn't funded in this product (unlike
  // modules/cards' issueCard) — so, like terminateCard, there's just a possible flat fee.
  const feeMinor = await getEffectiveFee(prisma, "BUSINESS_SPEND_CARD_CREATE", customerId, 0n);

  const idempotencyKey = randomUUID();
  const result = await yativoClient.fiat.spendCards.create({
    customerId: yativoCustomerId,
    cardType: cardType === "PHYSICAL" ? "Physical" : "Virtual",
    idempotencyKey,
  });

  const card = await prisma.businessSpendCard.create({
    data: {
      customerId,
      yativoCardId: result.yativoCardId,
      issuanceType: cardType,
      status: "ACTIVE",
      maskedPan: result.maskedPan ?? null,
      expirationDate: result.expirationDate ?? null,
    },
  });

  if (feeMinor > 0n) {
    const walletAccount = await ensureCustomerWalletAccount(prisma, customerId, BSC_CURRENCY);
    const feeRevenue = await ensurePlatformAccount(prisma, "PLATFORM_FEE_REVENUE", BSC_CURRENCY);
    await postTransaction(prisma, {
      type: "FEE",
      status: "POSTED",
      idempotencyKey: `fee:bsc-create:${card.id}`,
      externalSource: "SYSTEM",
      description: `Business Spend Card creation fee for ${card.id}`,
      lines: [
        { accountId: walletAccount.id, direction: "DEBIT", amountMinor: feeMinor, currencyCode: BSC_CURRENCY },
        { accountId: feeRevenue.id, direction: "CREDIT", amountMinor: feeMinor, currencyCode: BSC_CURRENCY },
      ],
    });
  }

  await sendNotificationEmail(prisma, "BUSINESS_SPEND_CARD_ISSUED", customerId, { maskedPan: card.maskedPan ?? "" });
  return businessSpendCardToDto(card);
}

async function findOwnedBusinessSpendCard(prisma: PrismaClient, cardId: string, scopeCustomerId?: string): Promise<BusinessSpendCard> {
  const card = await prisma.businessSpendCard.findFirst({ where: { id: cardId, ...(scopeCustomerId ? { customerId: scopeCustomerId } : {}) } });
  if (!card) throw new NotFoundError("Business Spend Card");
  return card;
}

async function chargeFee(
  prisma: PrismaClient,
  walletAccountId: string,
  customerId: string,
  feeMinor: bigint,
  idempotencyKey: string,
  description: string,
): Promise<void> {
  if (feeMinor <= 0n) return;
  const feeRevenue = await ensurePlatformAccount(prisma, "PLATFORM_FEE_REVENUE", BSC_CURRENCY);
  await postTransaction(prisma, {
    type: "FEE",
    status: "POSTED",
    idempotencyKey,
    externalSource: "SYSTEM",
    description,
    lines: [
      { accountId: walletAccountId, direction: "DEBIT", amountMinor: feeMinor, currencyCode: BSC_CURRENCY },
      { accountId: feeRevenue.id, direction: "CREDIT", amountMinor: feeMinor, currencyCode: BSC_CURRENCY },
    ],
  });
}

/**
 * `fund` moves money from the customer's own wallet onto the card (reserve-then-settle, same
 * pattern as modules/cards' topupCard); `withdraw` moves it back (the guide is explicit here,
 * unlike the older card product, that the full requested amount lands back net of a *separate*
 * fee line — so unlike withdrawFromCard, this DOES credit the wallet back). A withdrawal that
 * empties the card auto-terminates it on Yativo's side — reflected locally immediately rather
 * than waiting for the business_spend_card.terminated webhook, which only serves as a safety net.
 */
async function walletAction(prisma: PrismaClient, cardId: string, action: "fund" | "withdraw", amountMinor: bigint, scopeCustomerId?: string) {
  const card = await findOwnedBusinessSpendCard(prisma, cardId, scopeCustomerId);
  if (card.status !== "ACTIVE") throw new AppError("Only an active Business Spend Card can be funded or withdrawn from.", 409, "CARD_NOT_ACTIVE");

  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: card.customerId } });
  const yativoCustomerId = await ensureYativoCustomer(prisma, customer);

  const currency = await prisma.currency.findUniqueOrThrow({ where: { code: BSC_CURRENCY } });
  const amount = Number(amountMinor) / 10 ** currency.decimals;

  const walletAccount = await prisma.account.findFirst({ where: { type: "CUSTOMER_WALLET", customerId: card.customerId, currencyCode: BSC_CURRENCY } });
  if (!walletAccount) throw new NotFoundError("Wallet");

  const service = action === "fund" ? "BUSINESS_SPEND_CARD_FUND" : "BUSINESS_SPEND_CARD_WITHDRAW";
  const feeMinor = await getEffectiveFee(prisma, service, card.customerId, amountMinor);
  const settlement = await ensurePlatformAccount(prisma, "YATIVO_SETTLEMENT", BSC_CURRENCY);
  const idempotencyKey = randomUUID();

  let cardEmptied: boolean | undefined;
  let cardTerminated: boolean | undefined;
  let terminationError: string | null | undefined;
  let updatedCard = card;

  if (action === "fund") {
    const available = await getAvailableBalance(prisma, walletAccount.id, "CUSTOMER_WALLET");
    if (available < amountMinor + feeMinor) throw new InsufficientFundsError(walletAccount.id);

    const suspense = await ensurePlatformAccount(prisma, "SUSPENSE_PENDING", BSC_CURRENCY);
    const pendingTx = await postTransaction(prisma, {
      type: "CARD_TOPUP",
      status: "PENDING",
      idempotencyKey: `bsc-fund:${idempotencyKey}`,
      externalSource: "MANUAL",
      description: `Fund Business Spend Card ${card.id}`,
      lines: [
        { accountId: walletAccount.id, direction: "DEBIT", amountMinor, currencyCode: BSC_CURRENCY },
        { accountId: suspense.id, direction: "CREDIT", amountMinor, currencyCode: BSC_CURRENCY },
      ],
      enforceNonNegativeOn: [walletAccount.id],
    });

    try {
      await yativoClient.fiat.spendCards.walletAction({ action: "fund", customerId: yativoCustomerId, amount, idempotencyKey });
    } catch (err) {
      await reverseTransaction(prisma, pendingTx.id, "business spend card funding failed");
      throw err;
    }

    await settlePendingTransaction(
      prisma,
      pendingTx.id,
      [
        { accountId: walletAccount.id, direction: "DEBIT", amountMinor, currencyCode: BSC_CURRENCY },
        { accountId: settlement.id, direction: "CREDIT", amountMinor, currencyCode: BSC_CURRENCY },
      ],
      { type: "CARD_TOPUP", externalSource: "SYSTEM", description: `Business Spend Card funding settled` },
    );

    await chargeFee(prisma, walletAccount.id, card.customerId, feeMinor, `fee:bsc-fund:${idempotencyKey}`, `Business Spend Card funding fee for ${card.id}`);
  } else {
    // Fee-only pre-check: the withdrawn amount is credited back, never debited, so only the fee
    // needs a balance guard here.
    const available = await getAvailableBalance(prisma, walletAccount.id, "CUSTOMER_WALLET");
    if (available < feeMinor) throw new InsufficientFundsError(walletAccount.id);

    const result = await yativoClient.fiat.spendCards.walletAction({ action: "withdraw", customerId: yativoCustomerId, amount, idempotencyKey });
    cardEmptied = result.cardEmptied;
    cardTerminated = result.cardTerminated;
    terminationError = result.terminationError;

    const confirmedAmountMinor = majorToMinor(result.amount, currency.decimals);
    await postTransaction(prisma, {
      type: "CARD_WITHDRAWAL",
      status: "POSTED",
      idempotencyKey: `bsc-withdraw:${idempotencyKey}`,
      externalSource: "SYSTEM",
      description: `Withdraw Business Spend Card ${card.id}`,
      lines: [
        { accountId: settlement.id, direction: "DEBIT", amountMinor: confirmedAmountMinor, currencyCode: BSC_CURRENCY },
        { accountId: walletAccount.id, direction: "CREDIT", amountMinor: confirmedAmountMinor, currencyCode: BSC_CURRENCY },
      ],
    });

    await chargeFee(prisma, walletAccount.id, card.customerId, feeMinor, `fee:bsc-withdraw:${idempotencyKey}`, `Business Spend Card withdrawal fee for ${card.id}`);

    if (cardEmptied && cardTerminated) {
      updatedCard = await prisma.businessSpendCard.update({ where: { id: card.id }, data: { status: "TERMINATED" } });
      await sendNotificationEmail(prisma, "BUSINESS_SPEND_CARD_TERMINATED", card.customerId, { maskedPan: card.maskedPan ?? "" });
    } else if (cardEmptied && terminationError) {
      logger.warn({ cardId: card.id, terminationError }, "Business Spend Card emptied by withdrawal but automatic termination failed — retry via updateBusinessSpendCardStatus");
    }
  }

  return { card: businessSpendCardToDto(updatedCard), cardEmptied, cardTerminated, terminationError };
}

export async function fundBusinessSpendCard(prisma: PrismaClient, cardId: string, amountMinor: bigint, scopeCustomerId?: string) {
  return walletAction(prisma, cardId, "fund", amountMinor, scopeCustomerId);
}

export async function withdrawBusinessSpendCard(prisma: PrismaClient, cardId: string, amountMinor: bigint, scopeCustomerId?: string) {
  return walletAction(prisma, cardId, "withdraw", amountMinor, scopeCustomerId);
}

const STATUS_SERVICE = {
  activate: "BUSINESS_SPEND_CARD_ACTIVATE",
  suspend: "BUSINESS_SPEND_CARD_SUSPEND",
  terminate: "BUSINESS_SPEND_CARD_TERMINATE",
} as const;

const STATUS_RESULT = { activate: "ACTIVE", suspend: "SUSPENDED", terminate: "TERMINATED" } as const;

/** `terminate` is permanent — the route layer is responsible for making the caller confirm before calling this, same convention as modules/cards' terminateCard. */
export async function updateBusinessSpendCardStatus(
  prisma: PrismaClient,
  cardId: string,
  action: "activate" | "suspend" | "terminate",
  scopeCustomerId?: string,
) {
  const card = await findOwnedBusinessSpendCard(prisma, cardId, scopeCustomerId);
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: card.customerId } });
  const yativoCustomerId = await ensureYativoCustomer(prisma, customer);

  await yativoClient.fiat.spendCards.updateStatus({ customerId: yativoCustomerId, cardId: card.yativoCardId, action });
  const updated = await prisma.businessSpendCard.update({ where: { id: card.id }, data: { status: STATUS_RESULT[action] } });

  // No principal amount here either — only a FIXED pricing rule has any effect (PERCENTAGE/COMBINED
  // compute against amountMinor=0), same caveat as terminateCard.
  const feeMinor = await getEffectiveFee(prisma, STATUS_SERVICE[action], card.customerId, 0n);
  if (feeMinor > 0n) {
    const walletAccount = await prisma.account.findFirst({ where: { type: "CUSTOMER_WALLET", customerId: card.customerId, currencyCode: BSC_CURRENCY } });
    if (!walletAccount) throw new NotFoundError("Wallet");
    await chargeFee(prisma, walletAccount.id, card.customerId, feeMinor, `fee:bsc-${action}:${card.id}:${updated.updatedAt.getTime()}`, `Business Spend Card ${action} fee for ${card.id}`);
  }

  const notification = action === "activate" ? "BUSINESS_SPEND_CARD_ACTIVATED" : action === "suspend" ? "BUSINESS_SPEND_CARD_SUSPENDED" : "BUSINESS_SPEND_CARD_TERMINATED";
  await sendNotificationEmail(prisma, notification, card.customerId, { maskedPan: card.maskedPan ?? "" });

  return businessSpendCardToDto(updated);
}

export async function setBusinessSpendCardPin(prisma: PrismaClient, cardId: string, pin: string, reasonCode: string | undefined, comment: string | undefined, scopeCustomerId?: string) {
  const card = await findOwnedBusinessSpendCard(prisma, cardId, scopeCustomerId);
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: card.customerId } });
  const yativoCustomerId = await ensureYativoCustomer(prisma, customer);

  // PIN itself is never persisted or logged, on our side or Yativo's webhook payloads.
  await yativoClient.fiat.spendCards.setPin({ customerId: yativoCustomerId, cardId: card.yativoCardId, pin, reasonCode, comment });

  const feeMinor = await getEffectiveFee(prisma, "BUSINESS_SPEND_CARD_PIN_UPDATE", card.customerId, 0n);
  if (feeMinor > 0n) {
    const walletAccount = await prisma.account.findFirst({ where: { type: "CUSTOMER_WALLET", customerId: card.customerId, currencyCode: BSC_CURRENCY } });
    if (!walletAccount) throw new NotFoundError("Wallet");
    await chargeFee(prisma, walletAccount.id, card.customerId, feeMinor, `fee:bsc-pin:${card.id}:${randomUUID()}`, `Business Spend Card PIN update fee for ${card.id}`);
  }

  return businessSpendCardToDto(card);
}

export async function updateBusinessSpendCardLimits(prisma: PrismaClient, cardId: string, limits: BusinessSpendCardLimit[], scopeCustomerId?: string) {
  const card = await findOwnedBusinessSpendCard(prisma, cardId, scopeCustomerId);
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: card.customerId } });
  const yativoCustomerId = await ensureYativoCustomer(prisma, customer);

  const result = await yativoClient.fiat.spendCards.updateLimits({ customerId: yativoCustomerId, cardId: card.yativoCardId, limits });

  const feeMinor = await getEffectiveFee(prisma, "BUSINESS_SPEND_CARD_LIMITS_UPDATE", card.customerId, 0n);
  if (feeMinor > 0n) {
    const walletAccount = await prisma.account.findFirst({ where: { type: "CUSTOMER_WALLET", customerId: card.customerId, currencyCode: BSC_CURRENCY } });
    if (!walletAccount) throw new NotFoundError("Wallet");
    await chargeFee(prisma, walletAccount.id, card.customerId, feeMinor, `fee:bsc-limits:${card.id}:${randomUUID()}`, `Business Spend Card limits update fee for ${card.id}`);
  }

  return { card: businessSpendCardToDto(card), limits: result };
}

export async function listBusinessSpendCardTransactions(prisma: PrismaClient, cardId: string, scopeCustomerId?: string) {
  const card = await findOwnedBusinessSpendCard(prisma, cardId, scopeCustomerId);
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: card.customerId } });
  const yativoCustomerId = await ensureYativoCustomer(prisma, customer);
  const { items } = await yativoClient.fiat.spendCards.listTransactions({ customerId: yativoCustomerId, cardId: card.yativoCardId });
  return items;
}

export async function listPortalBusinessSpendCards(prisma: PrismaClient, customerId: string) {
  const cards = await prisma.businessSpendCard.findMany({ where: { customerId }, orderBy: { createdAt: "desc" } });
  return cards.map(businessSpendCardToDto);
}

export async function listAdminBusinessSpendCards(prisma: PrismaClient, page: number, pageSize: number) {
  const [total, cards] = await Promise.all([
    prisma.businessSpendCard.count(),
    prisma.businessSpendCard.findMany({
      include: { customer: { select: { fullName: true, businessName: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  const items = cards.map((c) => ({ ...businessSpendCardToDto(c), customerName: c.customer.fullName ?? c.customer.businessName ?? null }));
  return { items, total, page, pageSize };
}
