import type { PrismaClient } from "@prisma/client";
import { YativoApiError, type CryptoDepositCurrency } from "@white-label/yativo-sdk";
import { yativoClient } from "../../lib/yativoClient.js";
import logger from "../../lib/logger.js";

export async function listCryptoWallets(page: number, pageSize: number) {
  const result = await yativoClient.crypto.wallets.listWallets({ page, pageSize });
  return { items: result.items, page: result.page, pageSize: result.pageSize, total: result.total };
}

export async function createCryptoWallet(currency: CryptoDepositCurrency, customerId?: string) {
  return yativoClient.crypto.wallets.createWallet({ currency, customerId });
}

/**
 * If the account has no webhook URL configured, Yativo's delete-wallet call can come back as an
 * error even though the wallet was actually deleted — so a thrown error here isn't proof of
 * failure. Re-checks the wallet list afterward and only re-throws if the wallet is still present.
 */
export async function deleteCryptoWallet(walletId: string): Promise<void> {
  try {
    await yativoClient.crypto.wallets.deleteWallet(walletId);
  } catch (error) {
    if (!(error instanceof YativoApiError)) throw error;
    const stillExists = await walletStillExists(walletId);
    if (stillExists) throw error;
    logger.warn({ walletId, upstreamStatus: error.upstreamStatus }, "delete-wallet errored but the wallet is gone — treating as success (no webhook URL configured is a known cause)");
  }
}

async function walletStillExists(walletId: string): Promise<boolean> {
  // One page is enough for the small number of wallets a business realistically holds per
  // currency; if this ever needs to scale past ~100 wallets, page through instead.
  const { items } = await yativoClient.crypto.wallets.listWallets({ pageSize: 100 });
  return items.some((w) => w.id === walletId);
}

export async function listCryptoDeposits(page: number, pageSize: number) {
  const result = await yativoClient.crypto.wallets.listDeposits({ page, pageSize });
  return { items: result.items, page: result.page, pageSize: result.pageSize, total: result.total };
}

// ── Customer-scoped (portal) access ──────────────────────────────────────
//
// Yativo's `customer_id` on a wallet is a local label, not an isolation boundary — confirmed
// live, every wallet for the same currency shares the exact same on-chain address regardless of
// this value (see CRYPTO_DEPOSIT_CURRENCIES' doc comment and createWallet()'s). Labeling wallets
// with our own local customer id here lets us show a customer "their" wallet and filter deposit
// history to it, but it does NOT mean a deposit to that address is cryptographically provable as
// theirs — anyone who requests a wallet for the same currency sees the same address. This is
// display/bookkeeping only: nothing here credits the platform ledger automatically.

export async function listMyCryptoWallets(localCustomerId: string) {
  return yativoClient.crypto.wallets.listCustomerWallets(localCustomerId);
}

export async function getOrCreateMyCryptoWallet(prisma: PrismaClient, localCustomerId: string, currency: CryptoDepositCurrency) {
  // Reuse an existing wallet for this currency+customer label rather than creating a fresh one on
  // every call — Yativo's own create-wallet is idempotent per (currency, customer_id) too, but
  // checking first avoids a network round trip on every page load once a wallet already exists.
  const existing = (await listMyCryptoWallets(localCustomerId)).find((w) => w.currency === currency);
  const wallet = existing ?? (await yativoClient.crypto.wallets.createWallet({ currency, customerId: localCustomerId }));

  // Recorded locally so the crypto_deposit webhook can attribute an incoming deposit to this
  // customer via (address, currency) instead of trusting Yativo's shared customer_id label alone —
  // see the CryptoWallet model's doc comment.
  await prisma.cryptoWallet.upsert({
    where: { id: wallet.id },
    update: { address: wallet.address, network: wallet.network },
    create: { id: wallet.id, customerId: localCustomerId, currency: wallet.currency, network: wallet.network, address: wallet.address },
  });

  return wallet;
}

/**
 * Deposit history scoped to this customer's own wallet addresses. Yativo has no "deposits for
 * this customer_id" endpoint, so this fetches each of the customer's wallets' addresses and
 * queries deposit history per address — fine for the small number of wallets one customer
 * realistically holds. Because addresses can be shared (see module doc comment above), this list
 * is a display convenience, not proof every entry belongs solely to this customer.
 */
/**
 * Merges this app's own `CryptoDeposit` read-model (populated by the crypto_deposit webhook, see
 * webhooks/handlers/cryptoDeposit.handler.ts — the durable source of truth going forward) with a
 * live per-address scan filtered by the customer_id label Yativo attaches to each deposit. The
 * live scan exists only to backfill deposits that landed before the webhook was wired up for a
 * given wallet; anything already recorded locally is deduplicated by id.
 */
export async function listMyCryptoDeposits(prisma: PrismaClient, localCustomerId: string) {
  const [local, wallets] = await Promise.all([
    prisma.cryptoDeposit.findMany({ where: { customerId: localCustomerId } }),
    listMyCryptoWallets(localCustomerId),
  ]);
  const localIds = new Set(local.map((d) => d.id));

  const perWallet = await Promise.all(wallets.map((w) => yativoClient.crypto.wallets.listWalletDeposits(w.address)));
  // Each deposit already carries the customer_id label it was recorded under — since addresses
  // are shared across customers for the same currency (see module doc comment), filtering by
  // address alone would include every customer's deposits to that address. This label is the only
  // thing distinguishing them.
  const liveOnly = perWallet
    .flat()
    .filter((d) => d.customerId === localCustomerId && !localIds.has(d.id));

  return [
    ...local.map((d) => ({
      id: d.id,
      currency: d.currency,
      amount: d.amount,
      address: d.address,
      transactionId: d.transactionId,
      status: d.status,
      customerId: d.customerId,
      createdAt: d.createdAt.toISOString(),
    })),
    ...liveOnly,
  ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
