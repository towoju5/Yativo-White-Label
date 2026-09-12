import { useCallback, useEffect, useState } from "react";
import { portalApi } from "@/lib/api-client";

function isPushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
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
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((sub) => setSubscribed(!!sub))
      .finally(() => setLoading(false));
  }, [supported]);

  const subscribe = useCallback(async () => {
    if (!supported) return false;
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return false;

    const { publicKey } = await portalApi.get<{ publicKey: string | null }>("/portal/notifications/push/vapid-public-key");
    if (!publicKey) return false;

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });
    const json = subscription.toJSON();
    await portalApi.post("/portal/notifications/push-subscriptions", { endpoint: json.endpoint, keys: json.keys });
    setSubscribed(true);
    return true;
  }, [supported]);

  const unsubscribe = useCallback(async () => {
    if (!supported) return;
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await portalApi.post("/portal/notifications/push-subscriptions/unsubscribe", { endpoint: subscription.endpoint });
      await subscription.unsubscribe();
    }
    setSubscribed(false);
  }, [supported]);

  return { supported, subscribed, loading, subscribe, unsubscribe };
}
