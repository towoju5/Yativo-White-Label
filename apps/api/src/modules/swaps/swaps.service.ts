import { randomUUID } from "node:crypto";
import type { CurrencySwap, PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";
import type { SwapQuoteRequest } from "@white-label/shared-types";
import { AppError, NotFoundError, InsufficientFundsError } from "../../lib/errors.js";
import { formatMinorAmount } from "../../lib/formatMoney.js";
import { postTransaction } from "../ledger/postTransaction.js";
import { getAvailableBalance } from "../ledger/balances.js";
import { ensureCustomerWalletAccount, ensurePlatformAccount } from "../ledger/accounts.js";
import type { EntryLine } from "../ledger/types.js";
import { getEffectiveFee } from "../pricing/pricing.service.js";
import { getFxMarginBps } from "../pricing/fxMargin.js";
import { sendNotificationEmail } from "../notifications/notifications.service.js";
import { assertRatesFreshForPricing, convertMinor, crossRate, getExchangeRates, rateToDecimalString } from "./exchangeRates.service.js";

/** How long a quoted rate is honoured. Rates refresh about once a minute, so holding longer would let a customer pick the better of two rates. */
const QUOTE_TTL_SECONDS = 60;
const quoteKey = (quoteId: string) => `swap:quote:${quoteId}`;

type StoredQuote = {
  quoteId: string;
  customerId: string;
  fromCurrency: string;
  toCurrency: string;
  amountMinor: string;
  feeMinor: string;
  toAmountMinor: string;
  /** Market conversion minus toAmountMinor — what the exchange-rate float kept, in the target currency. */
  fxMarginMinor: string;
  rate: string;
  rateUpdatedAt: string;
  expiresAt: string;
};

/** Same posture as internal transfers: no KYC gate (ledger-only, never touches Yativo — see transfers.service.ts), only a frozen account blocks it. */
async function assertCanSwap(prisma: PrismaClient, customerId: string) {
  const c = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
  if (c.status !== "ACTIVE" || c.deletedAt) {
    throw new AppError("Your account is frozen, so swaps are disabled. Contact support.", 403, "ACCOUNT_FROZEN");
  }
}

/** Currencies a customer can swap INTO: enabled for customers by the admin, with a live rate. Any wallet they already hold can be swapped OUT of. */
export async function getSwapOptions(prisma: PrismaClient, redis: Redis) {
  const [rates, currencies] = await Promise.all([
    getExchangeRates(redis),
    prisma.currency.findMany({ where: { isEnabledForCustomers: true, isActive: true }, orderBy: { code: "asc" } }),
  ]);
  return {
    currencies: currencies
      .filter((c) => crossRate(rates, rates.base, c.code) !== null)
      .map((c) => ({ code: c.code, name: c.name, symbol: c.symbol, decimals: c.decimals })),
    rates: { base: rates.base, rates: rates.rates, updatedAt: rates.updatedAt },
  };
}

export async function quoteSwap(prisma: PrismaClient, redis: Redis, customerId: string, input: SwapQuoteRequest) {
  const { fromCurrency, toCurrency } = input;
  const amountMinor = BigInt(input.amountMinor);
  if (fromCurrency === toCurrency) throw new AppError("Pick two different currencies.", 400, "SAME_CURRENCY");
  if (amountMinor <= 0n) throw new AppError("Enter an amount greater than zero.", 400, "INVALID_AMOUNT");
  await assertCanSwap(prisma, customerId);

  const sourceWallet = await prisma.account.findFirst({ where: { type: "CUSTOMER_WALLET", customerId, currencyCode: fromCurrency } });
  if (!sourceWallet) throw new NotFoundError("Wallet");

  const [fromRow, toRow] = await Promise.all([
    prisma.currency.findUniqueOrThrow({ where: { code: fromCurrency } }),
    prisma.currency.findUnique({ where: { code: toCurrency } }),
  ]);
  if (!toRow?.isEnabledForCustomers || !toRow.isActive) {
    throw new AppError(`Swapping into ${toCurrency} isn't available.`, 422, "CURRENCY_NOT_AVAILABLE");
  }

  const rates = await getExchangeRates(redis);
  assertRatesFreshForPricing(rates);
  const rawRate = crossRate(rates, fromCurrency, toCurrency);
  if (rawRate === null) throw new AppError(`No exchange rate is available for ${fromCurrency} → ${toCurrency} right now.`, 422, "RATE_UNAVAILABLE");

  // The platform's exchange-rate float (Settings → Pricing): the customer converts at a rate this
  // much below market. The difference — market conversion minus what they get — is the margin,
  // booked as fee revenue in the target currency when the swap posts.
  const fxMarginBps = await getFxMarginBps(prisma);
  const marketToMinor = convertMinor(amountMinor, rateToDecimalString(rawRate), fromRow.decimals, toRow.decimals);
  const rate = rateToDecimalString(rawRate * (1 - fxMarginBps / 10000));
  const toAmountMinor = convertMinor(amountMinor, rate, fromRow.decimals, toRow.decimals);
  if (toAmountMinor <= 0n) throw new AppError("That amount is too small to convert.", 400, "AMOUNT_TOO_SMALL");
  const fxMarginMinor = marketToMinor > toAmountMinor ? marketToMinor - toAmountMinor : 0n;

  const feeMinor = await getEffectiveFee(prisma, "CURRENCY_SWAP", customerId, amountMinor);

  const quote: StoredQuote = {
    quoteId: randomUUID(),
    customerId,
    fromCurrency,
    toCurrency,
    amountMinor: amountMinor.toString(),
    feeMinor: feeMinor.toString(),
    toAmountMinor: toAmountMinor.toString(),
    fxMarginMinor: fxMarginMinor.toString(),
    rate,
    rateUpdatedAt: rates.updatedAt,
    expiresAt: new Date(Date.now() + QUOTE_TTL_SECONDS * 1000).toISOString(),
  };
  await redis.set(quoteKey(quote.quoteId), JSON.stringify(quote), "EX", QUOTE_TTL_SECONDS);

  const { customerId: _owner, fxMarginMinor: _margin, ...dto } = quote;
  return { ...dto, totalDebitMinor: (amountMinor + feeMinor).toString() };
}

/**
 * Converts at exactly the quoted figures, in one POSTED ledger transaction: source wallet debited
 * amount+fee, target wallet credited the converted amount, fee to PLATFORM_FEE_REVENUE (source
 * currency) and the exchange-rate float's margin to PLATFORM_FEE_REVENUE (target currency).
 * PLATFORM_RESERVE is the counter-account in both currencies, at the market conversion, so its per-currency balance is the
 * platform's open FX position from customer swaps — the real Yativo balances don't move. The
 * idempotency key is the quote id, so one quote can only ever convert once.
 */
export async function createSwap(prisma: PrismaClient, redis: Redis, customerId: string, quoteId: string) {
  const idempotencyKey = `swap:${customerId}:${quoteId}`;
  const existing = await prisma.ledgerTransaction.findUnique({ where: { idempotencyKey } });
  if (existing) {
    const prior = await prisma.currencySwap.findUnique({ where: { transactionId: existing.id } });
    if (prior) return swapToDto(prior);
  }

  const raw = await redis.get(quoteKey(quoteId));
  const quote = raw ? (JSON.parse(raw) as StoredQuote) : null;
  // Someone else's quote id is treated exactly like an expired one — never confirms it exists.
  if (!quote || quote.customerId !== customerId) {
    throw new AppError("This quote has expired. Get a new quote to continue.", 409, "QUOTE_EXPIRED");
  }
  await assertCanSwap(prisma, customerId);

  const amountMinor = BigInt(quote.amountMinor);
  const feeMinor = BigInt(quote.feeMinor);
  const toAmountMinor = BigInt(quote.toAmountMinor);
  const fxMarginMinor = BigInt(quote.fxMarginMinor ?? "0");
  const totalMinor = amountMinor + feeMinor;

  const sourceWallet = await prisma.account.findFirst({ where: { type: "CUSTOMER_WALLET", customerId, currencyCode: quote.fromCurrency } });
  if (!sourceWallet) throw new NotFoundError("Wallet");

  // Fast, non-authoritative fail-fast; enforceNonNegativeOn below is the real guarantee.
  const available = await getAvailableBalance(prisma, sourceWallet.id, "CUSTOMER_WALLET");
  if (available < totalMinor) throw new InsufficientFundsError(sourceWallet.id);

  // The customer may not hold the target currency yet — provisioned on demand, same as transfers do.
  const [targetWallet, reserveFrom, reserveTo] = await Promise.all([
    ensureCustomerWalletAccount(prisma, customerId, quote.toCurrency),
    ensurePlatformAccount(prisma, "PLATFORM_RESERVE", quote.fromCurrency),
    ensurePlatformAccount(prisma, "PLATFORM_RESERVE", quote.toCurrency),
  ]);

  // Two currency legs in one balanced transaction — postTransaction checks each currency independently.
  const lines: EntryLine[] = [
    { accountId: sourceWallet.id, direction: "DEBIT", amountMinor: totalMinor, currencyCode: quote.fromCurrency },
    { accountId: reserveFrom.id, direction: "CREDIT", amountMinor, currencyCode: quote.fromCurrency },
    { accountId: reserveTo.id, direction: "DEBIT", amountMinor: toAmountMinor + fxMarginMinor, currencyCode: quote.toCurrency },
    { accountId: targetWallet.id, direction: "CREDIT", amountMinor: toAmountMinor, currencyCode: quote.toCurrency },
  ];
  if (fxMarginMinor > 0n) {
    const marginRevenue = await ensurePlatformAccount(prisma, "PLATFORM_FEE_REVENUE", quote.toCurrency);
    lines.push({ accountId: marginRevenue.id, direction: "CREDIT", amountMinor: fxMarginMinor, currencyCode: quote.toCurrency });
  }
  if (feeMinor > 0n) {
    const feeRevenue = await ensurePlatformAccount(prisma, "PLATFORM_FEE_REVENUE", quote.fromCurrency);
    lines.push({ accountId: feeRevenue.id, direction: "CREDIT", amountMinor: feeMinor, currencyCode: quote.fromCurrency });
  }

  const swapId = randomUUID();
  const tx = await postTransaction(prisma, {
    type: "SWAP",
    status: "POSTED",
    idempotencyKey,
    externalSource: "MANUAL",
    // The rate isn't repeated here — the transaction detail shows it alongside both legs.
    description: `Swap ${quote.fromCurrency} → ${quote.toCurrency}`,
    metadata: {
      swapId,
      fromCurrency: quote.fromCurrency,
      toCurrency: quote.toCurrency,
      amountMinor: quote.amountMinor,
      feeMinor: quote.feeMinor,
      toAmountMinor: quote.toAmountMinor,
      fxMarginMinor: quote.fxMarginMinor,
      rate: quote.rate,
      rateUpdatedAt: quote.rateUpdatedAt,
    },
    lines,
    enforceNonNegativeOn: [sourceWallet.id],
  });

  const swap = await prisma.currencySwap.create({
    data: {
      id: swapId,
      customerId,
      fromCurrencyCode: quote.fromCurrency,
      toCurrencyCode: quote.toCurrency,
      fromAmountMinor: amountMinor,
      feeMinor,
      toAmountMinor,
      fxMarginMinor,
      rate: quote.rate,
      rateUpdatedAt: new Date(quote.rateUpdatedAt),
      transactionId: tx.id,
    },
  });
  await redis.del(quoteKey(quoteId));

  await sendNotificationEmail(prisma, "SWAP_COMPLETED", customerId, {
    sourceAmount: await formatMinorAmount(prisma, quote.fromCurrency, amountMinor),
    sourceCurrency: quote.fromCurrency,
    targetAmount: await formatMinorAmount(prisma, quote.toCurrency, toAmountMinor),
    targetCurrency: quote.toCurrency,
  });

  return swapToDto(swap);
}

function swapToDto(s: CurrencySwap) {
  return {
    id: s.id,
    fromCurrency: s.fromCurrencyCode,
    toCurrency: s.toCurrencyCode,
    fromAmountMinor: s.fromAmountMinor.toString(),
    feeMinor: s.feeMinor.toString(),
    toAmountMinor: s.toAmountMinor.toString(),
    rate: s.rate,
    transactionId: s.transactionId,
    createdAt: s.createdAt.toISOString(),
  };
}

export async function listSwaps(prisma: PrismaClient, customerId: string, limit: number) {
  const rows = await prisma.currencySwap.findMany({ where: { customerId }, orderBy: { createdAt: "desc" }, take: limit });
  return rows.map(swapToDto);
}
