import type { PrismaClient } from "@prisma/client";
import type { CryptoDepositEventPayload } from "@white-label/yativo-sdk";
import type { WebhookHandlerResult } from "./result.js";

/**
 * `crypto_deposit` — a crypto deposit landing in a customer's wallet. Display/history only, no
 * ledger entries are posted here (crypto currencies like USDC_SOL aren't rows in the fiat
 * Currency table that ledger posting requires) — see the CryptoDeposit model's doc comment.
 *
 * Attribution: resolved via the local CryptoWallet record first (matched on address+currency),
 * not Yativo's customer_id label alone — addresses are shared across customers for the same
 * currency (see cryptoWallets.service.ts), so the wallet record this app itself created on the
 * customer's behalf is the more reliable source. Falls back to the payload's own customer_id
 * label if no local wallet record matches (e.g. a wallet created before this table existed).
 */
export async function handleCryptoDeposit(prisma: PrismaClient, payload: CryptoDepositEventPayload): Promise<WebhookHandlerResult> {
  let customerId: string | null = null;

  const wallet = await prisma.cryptoWallet.findFirst({ where: { address: payload.address, currency: payload.currency } });
  if (wallet) customerId = wallet.customerId;

  if (!customerId && payload.customerId) {
    const customer = await prisma.customer.findUnique({ where: { id: payload.customerId } });
    if (customer) customerId = customer.id;
  }

  if (!customerId) {
    return { status: "FAILED", errorMessage: `No customer found for crypto deposit ${payload.id} (address ${payload.address})` };
  }

  await prisma.cryptoDeposit.upsert({
    where: { id: payload.id },
    update: { status: payload.status, transactionId: payload.transactionId },
    create: {
      id: payload.id,
      customerId,
      currency: payload.currency,
      amount: payload.amount,
      address: payload.address,
      transactionId: payload.transactionId,
      status: payload.status,
    },
  });

  return { status: "PROCESSED" };
}
