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

export type SupportTicketRealtimeMessage = {
  type: "support-ticket.message";
  ticketId: string;
  message: {
    id: string;
    authorType: "CUSTOMER" | "STAFF";
    authorName: string;
    body: string;
    createdAt: string;
  };
  status: string;
};

function ticketChannel(ticketId: string): string {
  return `support-ticket:${ticketId}`;
}

/** Which "side" of a ticket a WS connection represents — a ticket has exactly one customer but potentially several staff, so presence is tracked per side, not per individual user. */
export type TicketSide = "customer" | "staff";

function presenceKey(ticketId: string, side: TicketSide): string {
  return `support-presence:${ticketId}:${side}`;
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

/** Publishes a new support-ticket message to anyone (customer or staff) currently watching that ticket. Never throws — same rationale as publishWalletUpdatesForAccounts. */
export async function publishSupportTicketMessage(message: SupportTicketRealtimeMessage): Promise<void> {
  try {
    await getPublisher().publish(ticketChannel(message.ticketId), JSON.stringify(message));
  } catch (err) {
    logger.error({ err, ticketId: message.ticketId }, "Failed to publish support ticket message");
  }
}

/** Same reference-counted watch pattern as watchWalletChannel — see its doc comment. */
export function watchSupportTicketChannel(ticketId: string, onMessage: (msg: SupportTicketRealtimeMessage) => void): () => void {
  const channel = ticketChannel(ticketId);
  const sub = getSubscriber();
  const listener = (raw: string) => {
    try {
      onMessage(JSON.parse(raw) as SupportTicketRealtimeMessage);
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

// ── Presence: "is anyone from this side currently watching this ticket right now" ──
// Backed by a Redis counter (not the local `emitter`, which only knows about connections on THIS
// process) so it's correct across multiple API instances — a customer's watch could be handled by
// a different instance than the one processing a staff reply. TTL'd generously as a safety net in
// case a connection dies without its `close` handler firing (process crash, etc.) so a stuck
// counter can never permanently suppress notifications for a ticket.
const PRESENCE_TTL_SECONDS = 12 * 60 * 60;

export async function markTicketPresence(ticketId: string, side: TicketSide, delta: 1 | -1): Promise<void> {
  try {
    const pub = getPublisher();
    const key = presenceKey(ticketId, side);
    if (delta === 1) {
      await pub.incr(key);
      await pub.expire(key, PRESENCE_TTL_SECONDS);
    } else {
      const remaining = await pub.decr(key);
      if (remaining <= 0) await pub.del(key);
    }
  } catch (err) {
    logger.error({ err, ticketId, side, delta }, "Failed to update ticket presence");
  }
}

/** Best-effort — on a Redis error this fails "open" (reports present) so a transient blip never falsely triggers an unwanted notification storm; the worst case is one missed notification, not a spurious one. */
export async function isTicketSidePresent(ticketId: string, side: TicketSide): Promise<boolean> {
  try {
    const val = await getPublisher().get(presenceKey(ticketId, side));
    return !!val && Number(val) > 0;
  } catch (err) {
    logger.error({ err, ticketId, side }, "Failed to read ticket presence");
    return true;
  }
}
