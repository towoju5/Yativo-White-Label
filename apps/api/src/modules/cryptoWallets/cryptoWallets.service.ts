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

export async function getOrCreateMyCryptoWallet(localCustomerId: string, currency: CryptoDepositCurrency) {
  // Reuse an existing wallet for this currency+customer label rather than creating a fresh one on
  // every call — Yativo's own create-wallet is idempotent per (currency, customer_id) too, but
  // checking first avoids a network round trip on every page load once a wallet already exists.
  const existing = (await listMyCryptoWallets(localCustomerId)).find((w) => w.currency === currency);
  if (existing) return existing;
  return yativoClient.crypto.wallets.createWallet({ currency, customerId: localCustomerId });
}

/**
 * Deposit history scoped to this customer's own wallet addresses. Yativo has no "deposits for
 * this customer_id" endpoint, so this fetches each of the customer's wallets' addresses and
 * queries deposit history per address — fine for the small number of wallets one customer
 * realistically holds. Because addresses can be shared (see module doc comment above), this list
 * is a display convenience, not proof every entry belongs solely to this customer.
 */
export async function listMyCryptoDeposits(localCustomerId: string) {
  const wallets = await listMyCryptoWallets(localCustomerId);
  const perWallet = await Promise.all(wallets.map((w) => yativoClient.crypto.wallets.listWalletDeposits(w.address)));
  return perWallet.flat().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
