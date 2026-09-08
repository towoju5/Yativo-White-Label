import { staffTokenStore, portalTokenStore } from "./api-client";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

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

type Listener = (msg: WalletUpdateMessage) => void;
type TokenStore = typeof staffTokenStore;

/**
 * One WebSocket connection per audience (staff/portal) for the whole browser tab — not one per
 * page. Reconnects with exponential backoff (capped at 30s) on any drop, and re-establishes
 * whatever the page layer is currently watching once back open. A portal connection auto-watches
 * its own wallet server-side; a staff connection watches nothing until a page explicitly asks
 * (see watchCustomer) — e.g. the customer detail page, while it's mounted.
 */
class RealtimeConnection {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private watchedCustomerIds = new Set<string>();
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribeToken: (() => void) | null = null;
  private started = false;

  constructor(
    private readonly audience: "staff" | "portal",
    private readonly tokenStore: TokenStore,
  ) {}

  /** Idempotent — safe to call from multiple mounted components. */
  start() {
    if (this.started) return;
    this.started = true;
    this.unsubscribeToken = this.tokenStore.subscribe((token) => {
      if (token) this.connect();
      else this.teardown();
    });
    if (this.tokenStore.get()) this.connect();
  }

  stop() {
    this.started = false;
    this.unsubscribeToken?.();
    this.unsubscribeToken = null;
    this.teardown();
  }

  private connect() {
    const token = this.tokenStore.get();
    if (!token) return;
    this.teardown(); // clears any pending reconnect timer / stale socket first

    const wsUrl = API_BASE_URL.replace(/^http/, "ws");
    const ws = new WebSocket(`${wsUrl}/ws?token=${encodeURIComponent(token)}&aud=${this.audience}`);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempt = 0;
      for (const customerId of this.watchedCustomerIds) {
        ws.send(JSON.stringify({ type: "watch", customerId }));
      }
    };
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WalletUpdateMessage;
        for (const listener of this.listeners) listener(msg);
      } catch {
        // ignore malformed frames
      }
    };
    ws.onclose = () => {
      if (this.ws === ws) this.ws = null;
      this.scheduleReconnect();
    };
    ws.onerror = () => ws.close();
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || !this.tokenStore.get()) return;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempt, 30_000);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private teardown() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Staff only — a portal connection always watches its own customer and nothing else. */
  watchCustomer(customerId: string) {
    if (this.audience !== "staff" || this.watchedCustomerIds.has(customerId)) return;
    this.watchedCustomerIds.add(customerId);
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: "watch", customerId }));
  }

  unwatchCustomer(customerId: string) {
    if (this.audience !== "staff") return;
    this.watchedCustomerIds.delete(customerId);
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: "unwatch", customerId }));
  }
}

export const staffRealtime = new RealtimeConnection("staff", staffTokenStore);
export const portalRealtime = new RealtimeConnection("portal", portalTokenStore);
