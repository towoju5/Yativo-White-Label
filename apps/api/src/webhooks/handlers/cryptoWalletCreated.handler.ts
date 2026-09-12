import type { PrismaClient } from "@prisma/client";
import type { CryptoWalletCreatedPayload } from "@white-label/yativo-sdk";
import type { WebhookHandlerResult } from "./result.js";

/**
 * `crypto.wallet.created` — a safety net alongside getOrCreateMyCryptoWallet's own local upsert
 * (see cryptoWallets.service.ts): catches a wallet this app's own flow failed to record locally
 * (e.g. the Yativo call succeeded but the follow-up local write didn't) and any wallet created
 * some other way against Yativo directly. `customer_id` here is the same free-form label used
 * elsewhere — when it isn't one of this platform's own customer ids (e.g. a wallet an admin
 * created by hand in Yativo's own dashboard, labeled with a name rather than our id), there's
 * nothing to attribute it to locally, so this is a no-op rather than a failure.
 */
export async function handleCryptoWalletCreated(prisma: PrismaClient, payload: CryptoWalletCreatedPayload): Promise<WebhookHandlerResult> {
  if (!payload.customerId) {
    return { status: "IGNORED", errorMessage: "Wallet has no customer_id label to attribute it to" };
  }
  const customer = await prisma.customer.findUnique({ where: { id: payload.customerId } });
  if (!customer) {
    return { status: "IGNORED", errorMessage: `customer_id "${payload.customerId}" doesn't match any local customer — likely created outside this app` };
  }

  await prisma.cryptoWallet.upsert({
    where: { id: payload.id },
    update: { address: payload.address, network: payload.network },
    create: { id: payload.id, customerId: customer.id, currency: payload.currency, network: payload.network, address: payload.address },
  });

  return { status: "PROCESSED" };
}
