import type { PrismaClient } from "@prisma/client";
import type { VirtualAccountDepositPayload } from "@white-label/yativo-sdk";
import { postTransaction } from "../../modules/ledger/postTransaction.js";
import { ensurePlatformAccount, ensureCustomerWalletAccount } from "../../modules/ledger/accounts.js";
import { getEffectiveFee } from "../../modules/pricing/pricing.service.js";
import { sendNotificationEmail } from "../../modules/notifications/notifications.service.js";
import { formatMinorAmount } from "../../lib/formatMoney.js";
import { majorToMinor } from "../../lib/money.js";
import type { WebhookHandlerResult } from "./result.js";

/**
 * `virtual_account.deposit` — funds landing in a customer's long-lived virtual account (see
 * modules/virtualAccounts). Genuinely a separate event from deposit.created/updated, so unlike the
 * old integration this app no longer has to guess the rail — the event type says so directly.
 */
export async function handleVirtualAccountDeposit(prisma: PrismaClient, payload: VirtualAccountDepositPayload, externalEventId: string): Promise<WebhookHandlerResult> {
  if (payload.status !== "success") {
    return { status: "IGNORED", errorMessage: `Virtual account deposit status is ${payload.status}, not success — no ledger entry posted` };
  }
  // Resolved via the local VirtualAccount record first, not Yativo's customer_id — that lookup is
  // ambiguous once yativoCustomerMode = POOLED makes customer_id the same for every platform
  // customer. `identifiers` is searched as text rather than matched on one known key because the
  // field actually naming the account number in Yativo's own API varies by country/rail.
  let customer = null as Awaited<ReturnType<typeof prisma.customer.findFirst>>;
  if (payload.accountNumber) {
    const matches = await prisma.$queryRaw<{ customerId: string }[]>`
      SELECT "customerId" FROM virtual_accounts WHERE identifiers::text ILIKE ${"%" + payload.accountNumber + "%"} LIMIT 1
    `;
    if (matches[0]) customer = await prisma.customer.findUnique({ where: { id: matches[0].customerId } });
  }
  if (!customer && payload.yativoCustomerId) {
    customer = await prisma.customer.findFirst({ where: { yativoCustomerId: payload.yativoCustomerId } });
  }
  if (!customer) {
    return { status: "FAILED", errorMessage: `No customer found for virtual account deposit (account ${payload.accountNumber ?? "unknown"})` };
  }

  const currency = await prisma.currency.findUnique({ where: { code: payload.currencyCode } });
  if (!currency) {
    return { status: "FAILED", errorMessage: `Unknown currency ${payload.currencyCode}` };
  }
  // `amount` is already the net figure (post-fee) per Yativo's guide — `amount_recevied` (sic) is
  // the gross figure before fees, kept only for display/audit, never credited directly.
  const amountMinor = majorToMinor(payload.amount, currency.decimals);

  const settlement = await ensurePlatformAccount(prisma, "YATIVO_SETTLEMENT", payload.currencyCode);
  const wallet = await ensureCustomerWalletAccount(prisma, customer.id, payload.currencyCode);

  await postTransaction(prisma, {
    type: "DEPOSIT",
    status: "POSTED",
    idempotencyKey: `webhook:${externalEventId}`,
    externalSource: "YATIVO_WEBHOOK",
    externalRef: payload.transactionId,
    description: `Virtual account deposit confirmed via Yativo (${payload.transactionId})`,
    lines: [
      { accountId: settlement.id, direction: "DEBIT", amountMinor, currencyCode: payload.currencyCode },
      { accountId: wallet.id, direction: "CREDIT", amountMinor, currencyCode: payload.currencyCode },
    ],
  });

  // No upstream fee figure is available for this rail (see pricing.service.ts) — markup mode
  // behaves the same as standalone here until Yativo exposes one.
  const feeMinor = await getEffectiveFee(prisma, "VIRTUAL_ACCOUNT_DEPOSIT", customer.id, amountMinor);
  if (feeMinor > 0n) {
    const feeRevenue = await ensurePlatformAccount(prisma, "PLATFORM_FEE_REVENUE", payload.currencyCode);
    await postTransaction(prisma, {
      type: "FEE",
      status: "POSTED",
      idempotencyKey: `fee:virtual-account-deposit:${externalEventId}`,
      externalSource: "YATIVO_WEBHOOK",
      description: `Virtual account deposit fee for ${payload.transactionId}`,
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
