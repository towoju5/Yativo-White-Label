import { EventEmitter } from "node:events";
import { Redis } from "ioredis";
import type { PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";
import logger from "./logger.js";

export type WalletUpdateMessage = {
  type: "wallet.updated";
  walletId: string;
  customerId: string;
  currencyCode: string;
  decimals: number;
  symbol: string | null;
  availableMinor: string;
  pendingMinor: string;
  updatedAt: string;
};

function walletChannel(customerId: string): string {
  return `wallet-updates:${customerId}`;
}

// One shared publisher and one shared subscriber connection for the whole process — not one per
// WS client — with a local EventEmitter fanning Redis messages out to however many WS
// connections are currently watching each channel. This is what makes it correct across multiple
// API instances too: whichever instance actually processed the transaction publishes, and every
// instance with a WS client watching that customer (each running its own subscriber connection,
// all subscribed to the same Redis channel) receives and forwards it.
let publisher: Redis | undefined;
let subscriber: Redis | undefined;
const emitter = new EventEmitter();
emitter.setMaxListeners(0);

function getPublisher(): Redis {
  if (!publisher) publisher = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  return publisher;
}

function getSubscriber(): Redis {
  if (!subscriber) {
    subscriber = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    subscriber.on("message", (channel: string, raw: string) => emitter.emit(channel, raw));
    subscriber.on("error", (err) => logger.error({ err }, "Realtime Redis subscriber error"));
  }
  return subscriber;
}

/**
 * Publishes the current (already-committed) balance for every CUSTOMER_WALLET account touched by
 * a ledger transaction. Called by postTransaction/settlePendingTransaction/reverseTransaction
 * AFTER their `$transaction` resolves — never from inside one, since a publish can't be rolled
 * back the way a DB write can. Never throws: real-time is a nice-to-have layer on top of a ledger
 * that's already correct without it, so a Redis hiccup here must not fail the operation that
 * triggered it.
 */
export async function publishWalletUpdatesForAccounts(prisma: PrismaClient, accountIds: string[]): Promise<void> {
  const ids = [...new Set(accountIds)];
  if (ids.length === 0) return;
  try {
    const accounts = await prisma.account.findMany({
      where: { id: { in: ids }, type: "CUSTOMER_WALLET" },
      include: { wallet: true, currency: true },
    });
    const pub = getPublisher();
    await Promise.all(
      accounts
        .filter((a): a is typeof a & { wallet: NonNullable<typeof a.wallet>; customerId: string } => !!a.wallet && !!a.customerId)
        .map((account) => {
          const message: WalletUpdateMessage = {
            type: "wallet.updated",
            walletId: account.wallet.id,
            customerId: account.customerId,
            currencyCode: account.currencyCode,
            decimals: account.currency.decimals,
            symbol: account.currency.symbol,
            availableMinor: account.wallet.cachedAvailableMinor.toString(),
            pendingMinor: account.wallet.cachedPendingMinor.toString(),
            updatedAt: account.wallet.cacheUpdatedAt.toISOString(),
          };
          return pub.publish(walletChannel(account.customerId), JSON.stringify(message));
        }),
    );
  } catch (err) {
    logger.error({ err, accountIds: ids }, "Failed to publish wallet update(s)");
  }
}

/** Starts forwarding wallet-update messages for one customer to `onMessage`. Returns an unsubscribe function — always call it when the caller (a WS connection) closes or stops watching this customer. Reference-counted: the underlying Redis SUBSCRIBE only happens once per channel regardless of how many WS clients are watching it, and UNSUBSCRIBEs once the last one stops. */
export function watchWalletChannel(customerId: string, onMessage: (msg: WalletUpdateMessage) => void): () => void {
  const channel = walletChannel(customerId);
  const sub = getSubscriber();
  const listener = (raw: string) => {
    try {
      onMessage(JSON.parse(raw) as WalletUpdateMessage);
    } catch (err) {
      logger.warn({ err }, "Dropped malformed realtime message");
    }
  };
  emitter.on(channel, listener);
  if (emitter.listenerCount(channel) === 1) {
    sub.subscribe(channel).catch((err) => logger.error({ err, channel }, "Redis SUBSCRIBE failed"));
  }
  return () => {
    emitter.off(channel, listener);
    if (emitter.listenerCount(channel) === 0) {
      sub.unsubscribe(channel).catch((err) => logger.error({ err, channel }, "Redis UNSUBSCRIBE failed"));
    }
  };
}
