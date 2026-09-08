import type { FastifyInstance } from "fastify";
import { verifyStaffAccessToken, verifyPortalAccessToken } from "../../lib/jwt.js";
import { resolveEffectiveCustomerId } from "../../lib/portalPrincipal.js";
import { watchWalletChannel } from "../../lib/realtime.js";
import logger from "../../lib/logger.js";

type ClientMessage = { type: "watch" | "unwatch"; customerId: string };

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

    socket.on("message", (raw: Buffer) => {
      let parsed: ClientMessage;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (typeof parsed.customerId !== "string") return;
      if (parsed.type === "watch") watch(parsed.customerId);
      else if (parsed.type === "unwatch") unwatch(parsed.customerId);
    });

    socket.on("close", () => {
      for (const unsub of unsubscribers.values()) unsub();
      unsubscribers.clear();
    });

    socket.on("error", (err: Error) => logger.warn({ err }, "Realtime WS connection error"));

    if (ownCustomerId) watch(ownCustomerId);
  });
}
