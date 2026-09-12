import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { WalletBalance } from "@white-label/shared-types";
import { staffRealtime, portalRealtime, type WalletUpdateMessage } from "@/lib/realtime";

function toWalletBalance(msg: WalletUpdateMessage): WalletBalance {
  return {
    walletId: msg.walletId,
    customerId: msg.customerId,
    currencyCode: msg.currencyCode,
    decimals: msg.decimals,
    symbol: msg.symbol,
    availableMinor: msg.availableMinor,
    pendingMinor: msg.pendingMinor,
    updatedAt: msg.updatedAt,
  };
}

/**
 * Mounted once at the app root (see App.tsx). Patches react-query's cache directly from live
 * wallet-update messages — no extra round trip — so every page reading the `["portal","wallets"]`
 * list (dashboard, wallets page, wallet detail) or an admin customer detail page updates the
 * instant a transaction posts, with zero per-page wiring beyond this one hook.
 */
export function useRealtimeWalletBridge() {
  const queryClient = useQueryClient();

  useEffect(() => {
    staffRealtime.start();
    portalRealtime.start();
    return () => {
      staffRealtime.stop();
      portalRealtime.stop();
    };
  }, []);

  useEffect(() => {
    const applyToPortalWallets = (msg: WalletUpdateMessage) => {
      queryClient.setQueryData<WalletBalance[]>(["portal", "wallets"], (prev) => {
        if (!prev) return prev;
        const next = toWalletBalance(msg);
        const idx = prev.findIndex((w) => w.walletId === msg.walletId);
        if (idx === -1) return [...prev, next];
        const copy = [...prev];
        copy[idx] = next;
        return copy;
      });
    };

    const applyToAdminCustomer = (msg: WalletUpdateMessage) => {
      queryClient.setQueryData<{ wallets?: WalletBalance[] } | undefined>(["admin", "customers", msg.customerId], (prev) => {
        if (!prev?.wallets) return prev;
        const existing = prev.wallets.find((w) => w.walletId === msg.walletId);
        if (!existing) return prev;
        const updated: WalletBalance = { ...existing, availableMinor: msg.availableMinor, pendingMinor: msg.pendingMinor, updatedAt: msg.updatedAt };
        const wallets = prev.wallets.map((w) => (w.walletId === msg.walletId ? updated : w));
        return { ...prev, wallets };
      });
    };

    const unsubPortal = portalRealtime.subscribe((msg) => msg.type === "wallet.updated" && applyToPortalWallets(msg));
    const unsubStaff = staffRealtime.subscribe((msg) => msg.type === "wallet.updated" && applyToAdminCustomer(msg));
    return () => {
      unsubPortal();
      unsubStaff();
    };
  }, [queryClient]);
}

/** Call from a page showing one specific customer's live balance (currently: the admin customer detail page) — watches only while mounted. No-op for the portal audience, which always watches its own wallet automatically. */
export function useWatchCustomerWallet(customerId: string | undefined) {
  useEffect(() => {
    if (!customerId) return;
    staffRealtime.watchCustomer(customerId);
    return () => staffRealtime.unwatchCustomer(customerId);
  }, [customerId]);
}
