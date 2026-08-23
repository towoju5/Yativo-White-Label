import type { AccountType, PrismaClient, Account, Prisma } from "@prisma/client";

type Client = PrismaClient | Prisma.TransactionClient;

/** Gets or creates a singleton platform account (customerId = null), e.g. YATIVO_SETTLEMENT[USD]. */
export async function ensurePlatformAccount(db: Client, type: Exclude<AccountType, "CUSTOMER_WALLET">, currencyCode: string): Promise<Account> {
  const existing = await db.account.findFirst({ where: { type, currencyCode, customerId: null } });
  if (existing) return existing;
  return db.account.create({
    data: { type, currencyCode, customerId: null, name: `${type} [${currencyCode}]` },
  });
}

/** Gets or creates a customer's wallet account + Wallet row for a currency. */
export async function ensureCustomerWalletAccount(db: Client, customerId: string, currencyCode: string): Promise<Account & { wallet: { id: string } | null }> {
  const existing = await db.account.findFirst({
    where: { type: "CUSTOMER_WALLET", currencyCode, customerId },
    include: { wallet: true },
  });
  if (existing) {
    // The Account survives a customer removing an empty wallet (see wallets.service.ts's
    // deleteCustomerWallet — ledger entries can't be orphaned), but its Wallet row doesn't. If the
    // customer re-adds the same currency later, repair that here rather than treating the
    // still-existing Account as if it were never provisioned.
    if (existing.wallet) return existing;
    const wallet = await db.wallet.create({ data: { customerId, currencyCode, accountId: existing.id } });
    return { ...existing, wallet: { id: wallet.id } };
  }

  const account = await db.account.create({
    data: { type: "CUSTOMER_WALLET", currencyCode, customerId, name: `Customer Wallet [${currencyCode}]` },
  });
  const wallet = await db.wallet.create({
    data: { customerId, currencyCode, accountId: account.id },
  });
  return { ...account, wallet: { id: wallet.id } };
}
