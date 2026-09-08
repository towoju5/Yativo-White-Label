import type { PrismaClient } from "@prisma/client";
import type { DepositEventPayload } from "@white-label/yativo-sdk";
import { postTransaction } from "../../modules/ledger/postTransaction.js";
import { settlePendingTransaction } from "../../modules/ledger/settlePendingTransaction.js";
import { ensurePlatformAccount, ensureCustomerWalletAccount } from "../../modules/ledger/accounts.js";
import { getEffectiveFee } from "../../modules/pricing/pricing.service.js";
import { sendNotificationEmail } from "../../modules/notifications/notifications.service.js";
import { formatMinorAmount } from "../../lib/formatMoney.js";
import { majorToMinor } from "../../lib/money.js";
import type { WebhookHandlerResult } from "./result.js";

/**
 * `deposit.created` / `deposit.updated` — a native gateway pay-in (see modules/deposits). Only
 * `status === "success"` credits the wallet; other statuses (pending/processing/failed/cancelled/
 * expired) are recorded (see yativo.routes.ts) but don't move money — a later `deposit.updated`
 * delivery for the same deposit id will fire this again once it does resolve to success.
 */
export async function handleDepositEvent(prisma: PrismaClient, payload: DepositEventPayload, externalEventId: string): Promise<WebhookHandlerResult> {
  if (payload.status !== "success") {
    return { status: "IGNORED", errorMessage: `Deposit status is ${payload.status}, not success — no ledger entry posted` };
  }

  // Resolved via the local Deposit row (recorded at /portal/deposit/initiate) first, not Yativo's
  // customer_id — that's the only attribution that still works once yativoCustomerMode = POOLED
  // makes customer_id the same for every platform customer. Falls back to the customer_id lookup
  // only for a deposit this app never initiated a local record for (shouldn't normally happen for
  // deposit.created/updated specifically, since every payin goes through that route first).
  const payinRecord = await prisma.deposit.findUnique({ where: { yativoDepositId: payload.yativoDepositId } });
  const customer = payinRecord
    ? await prisma.customer.findUnique({ where: { id: payinRecord.customerId } })
    : await prisma.customer.findFirst({ where: { yativoCustomerId: payload.yativoCustomerId } });
  if (!customer) {
    return { status: "FAILED", errorMessage: `No customer found for deposit ${payload.yativoDepositId}` };
  }

  const currency = await prisma.currency.findUnique({ where: { code: payload.currencyCode } });
  if (!currency) {
    return { status: "FAILED", errorMessage: `Unknown currency ${payload.currencyCode}` };
  }
  const amountMinor = majorToMinor(payload.amount, currency.decimals);

  const settlement = await ensurePlatformAccount(prisma, "YATIVO_SETTLEMENT", payload.currencyCode);
  const wallet = await ensureCustomerWalletAccount(prisma, customer.id, payload.currencyCode);

  const finalLines = [
    { accountId: settlement.id, direction: "DEBIT" as const, amountMinor, currencyCode: payload.currencyCode },
    { accountId: wallet.id, direction: "CREDIT" as const, amountMinor, currencyCode: payload.currencyCode },
  ];
  if (payinRecord?.transactionId) {
    // Releases the PENDING placeholder posted at /portal/deposit/initiate (see deposits.routes.ts)
    // and posts this as the real settlement in one atomic step — idempotent on its own terms
    // (keyed by the pending transaction's id, not externalEventId), so a webhook replay after
    // this has already settled is a no-op regardless of whether externalEventId matches.
    await settlePendingTransaction(prisma, payinRecord.transactionId, finalLines, {
      type: "DEPOSIT",
      externalSource: "YATIVO_WEBHOOK",
      externalRef: payload.yativoDepositId,
      description: `Deposit confirmed via Yativo (${payload.yativoDepositId})`,
    });
  } else {
    // No local PENDING transaction to settle — either this deposit predates that column, or it
    // never went through /portal/deposit/initiate (e.g. no `payinRecord` at all). Post it fresh,
    // same as before.
    await postTransaction(prisma, {
      type: "DEPOSIT",
      status: "POSTED",  const settlement = await ensurePlatformAccount(prisma, "YATIVO_SETTLEMENT", payload.currencyCode);
  const wallet = await ensureCustomerWalletAccount(prisma, customer.id, payload.currencyCode);

  const finalLines = [
    { accountId: settlement.id, direction: "DEBIT" as const, amountMinor, currencyCode: payload.currencyCode },
    { accountId: wallet.id, direction: "CREDIT" as const, amountMinor, currencyCode: payload.currencyCode },
  ];
  if (payinRecord?.transactionId) {
    // Releases the PENDING placeholder posted at /portal/deposit/initiate (see deposits.routes.ts)
    // and posts this as the real settlement in one atomic step — idempotent on its own terms
    // (keyed by the pending transaction's id, not externalEventId), so a webhook replay after
    // this has already settled is a no-op regardless of whether externalEventId matches.
    await settlePendingTransaction(prisma, payinRecord.transactionId, finalLines, {
      type: "DEPOSIT",
      externalSource: "YATIVO_WEBHOOK",
      externalRef: payload.yativoDepositId,
      description: `Deposit confirmed via Yativo (${payload.yativoDepositId})`,
    });
  } else {
    // No local PENDING transaction to settle — either this deposit predates that column, or it
    // never went through /portal/deposit/initiate (e.g. no `payinRecord` at all). Post it fresh,
    // same as before.
    await postTransaction(prisma, {
      type: "DEPOSIT",
      status: "POSTED",
      // Derived from the webhook's own externalEventId — replaying the same webhook
      // (e.g. after a retry) is a guaranteed no-op via postTransaction's idempotency check.
      idempotencyKey: `webhook:${externalEventId}`,
      externalSource: "YATIVO_WEBHOOK",
      externalRef: payload.yativoDepositId,
      description: `Deposit confirmed via Yativo (${payload.yativoDepositId})`,
      lines: finalLines,
    });
  }
      // Derived from the webhook's own externalEventId — replaying the same webhook
      // (e.g. after a retry) is a guaranteed no-op via postTransaction's idempotency check.
      idempotencyKey: `webhook:${externalEventId}`,
      externalSource: "YATIVO_WEBHOOK",
      externalRef: payload.yativoDepositId,
      description: `Deposit confirmed via Yativo (${payload.yativoDepositId})`,
      lines: finalLines,
    });
  }

  // payinRecord also carries Yativo's own quoted fee, captured at initiation time, for markup pricing.
  const upstreamFeeMinor = payinRecord?.yativoFeeMinor ?? 0n;

  const feeMinor = await getEffectiveFee(prisma, "PAYIN", customer.id, amountMinor, upstreamFeeMinor);
  if (feeMinor > 0n) {
    const feeRevenue = await ensurePlatformAccount(prisma, "PLATFORM_FEE_REVENUE", payload.currencyCode);
    await postTransaction(prisma, {
      type: "FEE",
      status: "POSTED",
      idempotencyKey: `fee:deposit:${externalEventId}`,
      externalSource: "YATIVO_WEBHOOK",
      description: `Deposit fee for ${payload.yativoDepositId}`,
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
