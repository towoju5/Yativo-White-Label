import type { FastifyInstance } from "fastify";
import { verifyStaffAccessToken, verifyPortalAccessToken } from "../../lib/jwt.js";
import { resolveEffectiveCustomerId } from "../../lib/portalPrincipal.js";
import { watchWalletChannel, watchSupportTicketChannel, markTicketPresence } from "../../lib/realtime.js";
import logger from "../../lib/logger.js";

type ClientMessage =
  | { type: "watch" | "unwatch"; customerId: string }
  | { type: "watch-ticket" | "unwatch-ticket"; ticketId: string };

/**
 * One WS connection per browser tab, opened once at app root (see the web app's realtime hook) —
 * not one per page. `token`/`aud` arrive as query params because the browser's native WebSocket
 * API can't set an Authorization header on the upgrade request. Auth is a synchronous JWT verify
 * (no network call), so it's safe to do before attaching the message/close handlers below —
 * @fastify/websocket's own docs warn that attaching them after any async work risks silently
 * dropping messages that arrive in between.
 *
 * A portal connection auto-watches its own customer's wallet channel and can't watch any other
 * (enforced server-side, not just left to the client to behave). A staff connection starts
 * watching nothing and sends explicit watch/unwatch messages as the admin navigates between
 * customer detail pages — any authenticated staff member may watch any customerId, matching the
 * existing admin API's own access model (no per-customer permission gate on viewing a customer).
 */
export async function realtimeRoutes(app: FastifyInstance) {
  app.get("/ws", { websocket: true }, (socket, request) => {
    const query = request.query as { token?: string; aud?: string };
    const token = query.token;
    if (!token) {
      socket.close(4401, "Missing token");
      return;
    }

    let ownCustomerId: string | null = null;
    let isStaff = false;
    try {
      if (query.aud === "staff") {
        verifyStaffAccessToken(token);
        isStaff = true;
      } else {
        ownCustomerId = resolveEffectiveCustomerId(verifyPortalAccessToken(token));
      }
    } catch {
      socket.close(4401, "Invalid token");
      return;
    }

    const unsubscribers = new Map<string, () => void>();
    const ticketUnsubscribers = new Map<string, () => void>();
    const send = (data: unknown) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(data));
    };

    const watch = (customerId: string) => {
      if (!isStaff && customerId !== ownCustomerId) return; // portal may only ever watch itself
      if (unsubscribers.has(customerId)) return;
      unsubscribers.set(
        customerId,
        watchWalletChannel(customerId, (msg) => send(msg)),
      );
    };
    const unwatch = (customerId: string) => {
      unsubscribers.get(customerId)?.();
      unsubscribers.delete(customerId);
    };

    // A customer may only watch their own ticket (verified against the DB, not just their own
    // claimed customerId — resolveEffectiveCustomerId already covers the business-team-member
    // case). Staff may watch any ticket, same access model as watching any customer's wallet
    // above. Presence is marked per "side" (see realtime.ts's TicketSide) so support.service.ts
    // can tell whether to fall back to an ops alert / push notification when it publishes a reply.
    const watchTicket = async (ticketId: string) => {
      if (ticketUnsubscribers.has(ticketId)) return;
      const side = isStaff ? "staff" : "customer";
      if (!isStaff) {
        const owns = await app.prisma.supportTicket.findFirst({ where: { id: ticketId, customerId: ownCustomerId! }, select: { id: true } });
        if (!owns) return;
      }
      // Re-check after the async ownership lookup — the socket (or a racing unwatch) may have
      // already gone away while that query was in flight.
      if (ticketUnsubscribers.has(ticketId) || socket.readyState !== socket.OPEN) return;
      const unsubChannel = watchSupportTicketChannel(ticketId, (msg) => send(msg));
      ticketUnsubscribers.set(ticketId, () => {
        unsubChannel();
        void markTicketPresence(ticketId, side, -1);
      });
      void markTicketPresence(ticketId, side, 1);
    };
    const unwatchTicket = (ticketId: string) => {
      ticketUnsubscribers.get(ticketId)?.();
      ticketUnsubscribers.delete(ticketId);
    };

    socket.on("message", (raw: Buffer) => {
      let parsed: ClientMessage;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (parsed.type === "watch" && typeof parsed.customerId === "string") watch(parsed.customerId);
      else if (parsed.type === "unwatch" && typeof parsed.customerId === "string") unwatch(parsed.customerId);
      else if (parsed.type === "watch-ticket" && typeof parsed.ticketId === "string") void watchTicket(parsed.ticketId);
      else if (parsed.type === "unwatch-ticket" && typeof parsed.ticketId === "string") unwatchTicket(parsed.ticketId);
    });

    socket.on("close", () => {
      for (const unsub of unsubscribers.values()) unsub();
      unsubscribers.clear();
      for (const unsub of ticketUnsubscribers.values()) unsub();
      ticketUnsubscribers.clear();
    });

    socket.on("error", (err: Error) => logger.warn({ err }, "Realtime WS connection error"));

    if (ownCustomerId) watch(ownCustomerId);
  });
}
