import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Download, Share, CheckCircle2, SquarePlus } from "lucide-react";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { fetchBranding } from "@/theme/branding";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function InstallAppCard() {
  const { t } = useTranslation();
  const { canInstall, install, installed, isIOS } = usePwaInstall();
  const { data: branding } = useQuery({ queryKey: ["branding"], queryFn: fetchBranding, staleTime: Infinity });
  const name = branding?.pwaShortName || branding?.productName || t("common.app", "the app");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("settings.pwa.title", "Install app")}</CardTitle>
        <CardDescription>{t("settings.pwa.description", "Add {{name}} to your home screen for one-tap access, like a native app.", { name })}</CardDescription>
      </CardHeader>
      <CardContent>
        {installed ? (
          <div className="flex items-center gap-2 rounded-lg border border-border p-4 text-sm text-success">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {t("settings.pwa.installed", "Already installed on this device.")}
          </div>
        ) : canInstall ? (
          <Button onClick={install}>
            <Download className="h-4 w-4" /> {t("settings.pwa.install", "Install app")}
          </Button>
        ) : isIOS ? (
          <div className="space-y-2 rounded-lg border border-border p-4 text-sm text-muted-foreground">
            <p>{t("settings.pwa.iosIntro", "On iPhone/iPad, add it from Safari's share menu:")}</p>
            <ol className="ml-4 list-decimal space-y-1">
              <li className="flex items-center gap-1.5">
                {t("settings.pwa.iosStep1", "Tap the Share icon")} <Share className="inline h-3.5 w-3.5" />
              </li>
              <li className="flex items-center gap-1.5">
                {t("settings.pwa.iosStep2", "Tap \"Add to Home Screen\"")} <SquarePlus className="inline h-3.5 w-3.5" />
              </li>
            </ol>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("settings.pwa.unavailable", "Your browser hasn't offered an install prompt yet — try reloading the page, or check your browser's menu for an \"Install app\" option.")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
