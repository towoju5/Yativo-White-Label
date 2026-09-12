import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Download, X } from "lucide-react";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { fetchBranding } from "@/theme/branding";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "pwa-install-banner-dismissed";

/** Only ever renders once the browser has actually offered an install prompt (see usePwaInstall) —
 * never nags a visitor whose browser isn't ready to install, or who's already installed. Dismissal
 * is permanent (localStorage, not sessionStorage): unlike the KYC/email banners this isn't a
 * recurring account requirement, just a one-time convenience offer. */
export function InstallAppBanner() {
  const { t } = useTranslation();
  const { canInstall, install } = usePwaInstall();
  const { data: branding } = useQuery({ queryKey: ["branding"], queryFn: fetchBranding, staleTime: Infinity });
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  if (!canInstall || dismissed) return null;
  const name = branding?.pwaShortName || branding?.productName || t("common.app", "the app");

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Private browsing / storage disabled — the banner just reappears next visit, harmless.
    }
    setDismissed(true);
  };

  return (
    <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-4 py-2.5 text-sm">
      <Download className="h-4 w-4 shrink-0 text-primary" />
      <p className="flex-1">{t("pwa.banner.message", "Install {{name}} on this device for one-tap access.", { name })}</p>
      <Button size="sm" variant="outline" className="shrink-0" onClick={install}>
        {t("pwa.banner.cta", "Install")}
      </Button>
      <button type="button" onClick={dismiss} aria-label={t("pwa.banner.dismiss", "Dismiss")} className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
