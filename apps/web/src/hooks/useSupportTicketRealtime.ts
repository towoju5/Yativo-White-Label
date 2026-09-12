import { useEffect, useRef } from "react";
import { staffRealtime, portalRealtime, type SupportTicketRealtimeMessage } from "@/lib/realtime";

/**
 * Watches one support ticket's realtime channel while `ticketId` is set (e.g. its thread dialog/
 * sheet is open) — both the portal and admin queue use this, just with a different `audience`.
 * `onMessage` fires for every new message on this ticket, including ones this exact browser tab
 * just sent (the caller decides whether to beep/re-fetch based on `authorType`).
 */
export function useSupportTicketRealtime(ticketId: string | null | undefined, audience: "staff" | "portal", onMessage: (msg: SupportTicketRealtimeMessage) => void) {
  const conn = audience === "staff" ? staffRealtime : portalRealtime;
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!ticketId) return;
    conn.watchTicket(ticketId);
    const unsubscribe = conn.subscribe((msg) => {
      if (msg.type === "support-ticket.message" && msg.ticketId === ticketId) onMessageRef.current(msg);
    });
    return () => {
      unsubscribe();
      conn.unwatchTicket(ticketId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId, conn]);
}
