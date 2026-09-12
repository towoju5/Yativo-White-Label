import { useEffect, useState } from "react";

/** Chrome/Edge/Android fire this instead of letting the browser show its own install UI, so the
 * page can offer an explicit "Install" button — but only once the browser decides the site meets
 * its installability criteria (manifest + service worker + a few heuristics), which can take a
 * few seconds after first load. Not a standard DOM type. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (window.navigator as { standalone?: boolean }).standalone === true;
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * iOS Safari never fires `beforeinstallprompt` (Apple doesn't support the API at all) — "Add to
 * Home Screen" there is a manual Share-sheet action with no programmatic trigger, so `canInstall`
 * stays false on iOS and callers should show the manual instructions instead (see `isIOS`).
 */
export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone());

  useEffect(() => {
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setDeferredPrompt(null);
  };

  return {
    /** True once the browser has actually offered an install prompt to capture — false doesn't
     * mean "never installable," just "not right now" (already installed, or the browser hasn't
     * decided yet). */
    canInstall: !!deferredPrompt,
    install,
    installed,
    isIOS: isIOS(),
  };
}
