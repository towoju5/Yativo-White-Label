import { useCallback, useEffect, useState } from "react";
import { portalApi } from "@/lib/api-client";

function isPushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

/**
 * `navigator.serviceWorker.ready` never resolves at all if registration itself never completes
 * (e.g. `/sw.js` 404s, or a hosting/proxy config serves it with the wrong MIME type) — since
 * `registerServiceWorker()` swallows that failure silently, the symptom is the toggle staying
 * disabled forever with no error, because the `loading` state it's gated on never clears. A
 * timeout means a broken service worker degrades to "clicking shows a real error" instead of
 * "clicking does nothing at all."
 */
function serviceWorkerReady(timeoutMs = 8000): Promise<ServiceWorkerRegistration> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<ServiceWorkerRegistration>((_, reject) => setTimeout(() => reject(new Error("Service worker never became ready")), timeoutMs)),
  ]);
}

/** Standard VAPID-key base64url-to-Uint8Array conversion, required by PushManager.subscribe's applicationServerKey. */
function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/**
 * Manages the browser Web Push subscription lifecycle — permission request, subscribe (posts to
 * POST /portal/notifications/push-subscriptions), and unsubscribe. No third-party push provider:
 * this is the standard browser Push API against Yativo-white-label's own self-issued VAPID keys
 * (see apps/api/src/lib/notificationChannelConfig.ts).
 */
export function usePushSubscription() {
  const [supported] = useState(isPushSupported());
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supported) {
      setLoading(false);
      return;
    }
    serviceWorkerReady()
      .then((registration) => registration.pushManager.getSubscription())
      .then((sub) => setSubscribed(!!sub))
      .catch(() => setSubscribed(false))
      .finally(() => setLoading(false));
  }, [supported]);

  /**
   * Returns a reason on failure so the caller can show something more useful than a generic
   * error — every step here used to run with no try/catch at all, so a stale subscription left
   * over from before the server's VAPID key last changed (browsers throw when you subscribe with
   * a *different* applicationServerKey while one is already active), a network hiccup fetching
   * the key, or `Notification.requestPermission()` itself throwing (some browsers do, if it's
   * called outside a direct user-gesture handler) all surfaced as an unhandled promise rejection
   * with zero UI feedback — the toggle just silently did nothing.
   */
  const subscribe = useCallback(async (): Promise<{ ok: true } | { ok: false; reason: "unsupported" | "permission-denied" | "not-configured" | "error" }> => {
    if (!supported) return { ok: false, reason: "unsupported" };
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return { ok: false, reason: "permission-denied" };

      const { publicKey } = await portalApi.get<{ publicKey: string | null }>("/portal/notifications/push/vapid-public-key");
      if (!publicKey) return { ok: false, reason: "not-configured" };

      const registration = await serviceWorkerReady();
      // A subscription left over from a previous VAPID key would make pushManager.subscribe()
      // below throw ("a subscription with a different applicationServerKey already exists") —
      // clear it first so re-subscribing always works.
      const existing = await registration.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      const json = subscription.toJSON();
      await portalApi.post("/portal/notifications/push-subscriptions", { endpoint: json.endpoint, keys: json.keys });
      setSubscribed(true);
      return { ok: true };
    } catch {
      return { ok: false, reason: "error" };
    }
  }, [supported]);

  const unsubscribe = useCallback(async () => {
    if (!supported) return;
    try {
      const registration = await serviceWorkerReady();
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await portalApi.post("/portal/notifications/push-subscriptions/unsubscribe", { endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
    } finally {
      // Reflect "off" locally even if the unsubscribe call itself failed partway — leaving the
      // switch stuck in a stale "on" state after the user asked to turn it off is worse than a
      // subscription row lingering server-side for an endpoint that no longer delivers anything.
      setSubscribed(false);
    }
  }, [supported]);

  return { supported, subscribed, loading, subscribe, unsubscribe };
}
