import { randomUUID } from "node:crypto";
import type { Payout, PrismaClient, LedgerExternalSource } from "@prisma/client";
import type { CreatePayoutInput } from "@white-label/shared-types";
import { env } from "../../config/env.js";
import { yativoClient } from "../../lib/yativoClient.js";
import { ensureYativoCustomer } from "../../lib/ensureYativoCustomer.js";
import { NotFoundError, InsufficientFundsError, AppError } from "../../lib/errors.js";
import { requireKycApprovedForService } from "../../lib/requireKycApproved.js";
import { postTransaction } from "../ledger/postTransaction.js";
import { settlePendingTransaction } from "../ledger/settlePendingTransaction.js";
import { getAvailableBalance } from "../ledger/balances.js";
import { ensurePlatformAccount } from "../ledger/accounts.js";
import { getBeneficiaryGatewayInfo } from "../beneficiaries/beneficiaries.service.js";

type PayoutWithTransaction = Payout & { transaction: { status: "PENDING" | "POSTED" | "REVERSED" } };

/**
 * A Payout's `transactionId` always points at the original PENDING hold
 * transaction. Once settled, `settlePendingTransaction` flips that original
 * to REVERSED (releasing the hold — see reverseTransaction.ts) and posts a
 * *separate* POSTED settlement transaction keyed deterministically as
 * `settle:${transactionId}`. So the payout's business-facing status can't be
 * read directly off the original transaction — it's derived: still PENDING
 * while held, POSTED once a settlement transaction exists for it, or
 * REVERSED if the hold was released with no settlement (a failed payout).
 */
async function derivePayoutStatuses(
  prisma: PrismaClient,
  payouts: PayoutWithTransaction[],
): Promise<Map<string, "PENDING" | "POSTED" | "REVERSED">> {
  const reversedIds = payouts.filter((p) => p.transaction.status === "REVERSED").map((p) => p.transactionId);
  const settlements =
    reversedIds.length === 0
      ? []
      : await prisma.ledgerTransaction.findMany({
          where: { idempotencyKey: { in: reversedIds.map((id) => `settle:${id}`) } },
          select: { idempotencyKey: true, status: true },
        });
  const settledTransactionIds = new Set(
    settlements.filter((s) => s.status === "POSTED").map((s) => s.idempotencyKey.replace(/^settle:/, "")),
  );

  const result = new Map<string, "PENDING" | "POSTED" | "REVERSED">();
  for (const p of payouts) {
    if (p.transaction.status !== "REVERSED") {
      result.set(p.id, p.transaction.status);
    } else {
      result.set(p.id, settledTransactionIds.has(p.transactionId) ? "POSTED" : "REVERSED");
    }
  }
  return result;
}

function payoutToDto(payout: PayoutWithTransaction, status: "PENDING" | "POSTED" | "REVERSED") {
  return {
    id: payout.id,
    customerId: payout.customerId,
    beneficiaryId: payout.beneficiaryId,
    currencyCode: payout.currencyCode,
    amountMinor: payout.amountMinor.toString(),
    status,
    transactionId: payout.transactionId,
    yativoPayoutId: payout.yativoPayoutId,
    createdAt: payout.createdAt.toISOString(),
  };
}

async function toSinglePayoutDto(prisma: PrismaClient, payout: PayoutWithTransaction) {
  const statuses = await derivePayoutStatuses(prisma, [payout]);
  return payoutToDto(payout, statuses.get(payout.id)!);
}

/**
 * Atomically posts a POSTED settlement for a payout's PENDING hold (reversing
 * the hold + posting the final DEBIT wallet / CREDIT settlement in one DB
 * transaction) and, if a fee was charged, a separate POSTED FEE transaction.
 * Shared by the `payout.completed` webhook handler and the mock-mode
 * synchronous escape hatch in createPortalPayout below.
 */
export async function settlePayoutCompleted(
  prisma: PrismaClient,
  payout: { id: string; customerId: string; currencyCode: string; amountMinor: bigint; transactionId: string },
  opts: { externalSource: LedgerExternalSource; feeMinor?: bigint },
) {
  const walletAccount = await prisma.account.findFirstOrThrow({
    where: { type: "CUSTOMER_WALLET", customerId: payout.customerId, currencyCode: payout.currencyCode },
  });
  const settlement = await ensurePlatformAccount(prisma, "YATIVO_SETTLEMENT", payout.currencyCode);

  const tx = await settlePendingTransaction(
    prisma,
    payout.transactionId,
    [
      { accountId: walletAccount.id, direction: "DEBIT", amountMinor: payout.amountMinor, currencyCode: payout.currencyCode },
      { accountId: settlement.id, direction: "CREDIT", amountMinor: payout.amountMinor, currencyCode: payout.currencyCode },
    ],
    { type: "PAYOUT", externalSource: opts.externalSource, description: `Payout ${payout.id} settled` },
  );

  if (opts.feeMinor && opts.feeMinor > 0n) {
    const feeRevenue = await ensurePlatformAccount(prisma, "PLATFORM_FEE_REVENUE", payout.currencyCode);
    await postTransaction(prisma, {
      type: "FEE",
      status: "POSTED",
      idempotencyKey: `fee:payout:${payout.id}`,
      externalSource: opts.externalSource,
      description: `Payout fee for ${payout.id}`,
      lines: [
        { accountId: walletAccount.id, direction: "DEBIT", amountMinor: opts.feeMinor, currencyCode: payout.currencyCode },
        { accountId: feeRevenue.id, direction: "CREDIT", amountMinor: opts.feeMinor, currencyCode: payout.currencyCode },
      ],
    });
  }

  return tx;
}

export async function createPortalPayout(prisma: PrismaClient, customerId: string, input: CreatePayoutInput) {
  const beneficiary = await prisma.beneficiary.findFirst({ where: { id: input.beneficiaryId, customerId, archivedAt: null } });
  if (!beneficiary) throw new NotFoundError("Beneficiary");
  if (!beneficiary.yativoBeneficiaryId) {
    throw new AppError("This beneficiary was never linked to Yativo — remove it and add it again.", 409, "BENEFICIARY_NOT_LINKED");
  }
  // Throws if this beneficiary is missing its Yativo gateway details. Note the payout method
  // used below is always derived from *this* beneficiary — the same way /portal/quotes derives
  // its method_id — so as long as the client quotes and pays out against the same beneficiaryId,
  // Yativo's "payout method must match quote_id's method" requirement is satisfied by construction.
  getBeneficiaryGatewayInfo(beneficiary);

  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
  await requireKycApprovedForService(prisma, "PAYOUT", customer);
  const currency = await prisma.currency.findUniqueOrThrow({ where: { code: input.currencyCode } });

  const walletAccount = await prisma.account.findFirst({ where: { type: "CUSTOMER_WALLET", customerId, currencyCode: input.currencyCode } });
  if (!walletAccount) throw new NotFoundError("Wallet");

  const amountMinor = BigInt(input.amountMinor);

  // Fast, non-authoritative fail-fast for the common uncontested case — skips
  // creating a payout id/hold when it's obviously insufficient. Not a
  // correctness guarantee by itself (see enforceNonNegativeOn below).
  const available = await getAvailableBalance(prisma, walletAccount.id, "CUSTOMER_WALLET");
  if (available < amountMinor) throw new InsufficientFundsError(walletAccount.id);

  const suspense = await ensurePlatformAccount(prisma, "SUSPENSE_PENDING", input.currencyCode);

  const payoutId = randomUUID();
  const pendingTx = await postTransaction(prisma, {
    type: "PAYOUT",
    status: "PENDING",
    idempotencyKey: `payout:${payoutId}`,
    externalSource: "MANUAL",
    description: `Payout to beneficiary ${beneficiary.name}`,
    lines: [
      { accountId: walletAccount.id, direction: "DEBIT", amountMinor, currencyCode: input.currencyCode },
      { accountId: suspense.id, direction: "CREDIT", amountMinor, currencyCode: input.currencyCode },
    ],
    // The authoritative check: enforced inside the same locked transaction
    // as the insert above, so concurrent payouts on this wallet serialize on
    // the account row lock and can't both pass — see the doc comment on
    // this field in ledger/types.ts.
    enforceNonNegativeOn: [walletAccount.id],
  });

  let payout = await prisma.payout.create({
    data: {
      id: payoutId,
      customerId,
      beneficiaryId: beneficiary.id,
      currencyCode: input.currencyCode,
      amountMinor,
      transactionId: pendingTx.id,
    },
    include: { transaction: true },
  });

  const yativoCustomerId = await ensureYativoCustomer(prisma, customer);
  const yativoResult = await yativoClient.fiat.payouts.create({
    idempotencyKey: pendingTx.id,
    // Sent unconditionally — only avenia/tazapays gateways require it, but it's harmless for
    // every other gateway and we already have it in hand for every payout regardless.
    yativoCustomerId,
    debitWallet: input.currencyCode,
    amount: Number(amountMinor) / 10 ** currency.decimals,
    // payment_method_id and beneficiary_details_id must be the *same* id — see the doc comment
    // on CreateFiatPayoutInput.beneficiaryPaymentMethodId for why sending mismatched values here
    // is the most common source of Yativo payout bugs.
    beneficiaryPaymentMethodId: beneficiary.yativoBeneficiaryId,
    quoteId: input.quoteId,
  });

  await prisma.payout.update({ where: { id: payout.id }, data: { yativoPayoutId: yativoResult.yativoPayoutId } });

  if (env.YATIVO_MODE === "mock") {
    // Dev-only escape hatch: in mock mode there is no real Yativo webhook callback, so we
    // simulate the `payout.completed` webhook synchronously right here. This keeps the
    // scaffold testable end-to-end locally without standing up a webhook receiver. In
    // sandbox/live mode this block never runs — settlement happens via the real webhook.
    await settlePayoutCompleted(prisma, { ...payout, amountMinor }, { externalSource: "SYSTEM" });
  }

  payout = await prisma.payout.findUniqueOrThrow({ where: { id: payout.id }, include: { transaction: true } });
  return toSinglePayoutDto(prisma, payout);
}

/** Live status straight from Yativo (GET /payout/fetch/{payout_id}) — step 9, for the "track this payout" poll after submit. */
export async function getLivePayoutStatus(prisma: PrismaClient, customerId: string, payoutId: string) {
  const payout = await prisma.payout.findFirst({ where: { id: payoutId, customerId } });
  if (!payout) throw new NotFoundError("Payout");
  if (!payout.yativoPayoutId) {
    throw new AppError("This payout was never submitted to Yativo.", 409, "PAYOUT_NOT_SUBMITTED");
  }
  return yativoClient.fiat.payouts.getStatus(payout.yativoPayoutId);
}

export async function listPortalPayouts(prisma: PrismaClient, customerId: string, page: number, pageSize: number) {
  const [total, payouts] = await Promise.all([
    prisma.payout.count({ where: { customerId } }),
    prisma.payout.findMany({
      where: { customerId },
      include: { transaction: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  const statuses = await derivePayoutStatuses(prisma, payouts);
  return { items: payouts.map((p) => payoutToDto(p, statuses.get(p.id)!)), total, page, pageSize };
}

export async function listAdminPayouts(
  prisma: PrismaClient,
  filters: { customerId?: string; currencyCode?: string },
  page: number,
  pageSize: number,
) {
  const where = {
    ...(filters.customerId ? { customerId: filters.customerId } : {}),
    ...(filters.currencyCode ? { currencyCode: filters.currencyCode } : {}),
  };
  const [total, payouts] = await Promise.all([
    prisma.payout.count({ where }),
    prisma.payout.findMany({
      where,
      include: { transaction: true, customer: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  const statuses = await derivePayoutStatuses(prisma, payouts);
  const items = payouts.map((p) => ({
    ...payoutToDto(p, statuses.get(p.id)!),
    customerName: p.customer.fullName ?? p.customer.businessName ?? null,
  }));
  return { items, total, page, pageSize };
}
