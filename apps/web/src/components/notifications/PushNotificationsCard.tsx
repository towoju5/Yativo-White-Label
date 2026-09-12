import { useTranslation } from "react-i18next";
import { Bell, BellOff } from "lucide-react";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

/** Settings-page opt-in for browser push notifications — see usePushSubscription for the subscribe/unsubscribe flow. */
export function PushNotificationsCard() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { supported, subscribed, loading, subscribe, unsubscribe } = usePushSubscription();
  // iOS only exposes the Push API to a PWA installed to the home screen (Settings icon → Add to
  // Home Screen) — inside a regular Safari tab, `supported` is false with no way to fix it from
  // here, so say so explicitly instead of just not rendering the card and leaving the customer to
  // wonder why the option isn't there at all.
  const isIos = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches;

  const onToggle = async (checked: boolean) => {
    if (checked) {
      const result = await subscribe();
      if (!result.ok) {
        const messages: Record<typeof result.reason, string> = {
          unsupported: t("settings.push.unsupported", "This browser doesn't support push notifications."),
          "permission-denied": t("settings.push.permissionDenied", "Notifications permission wasn't granted — check your browser's site settings."),
          "not-configured": t("settings.push.notConfigured", "Push notifications aren't set up on this platform yet."),
          error: t("settings.push.genericError", "Couldn't turn on notifications — please try again."),
        };
        toast({ variant: "destructive", title: messages[result.reason] });
      }
    } else {
      await unsubscribe();
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          {subscribed ? <Bell className="h-4 w-4 text-primary" /> : <BellOff className="h-4 w-4 text-muted-foreground" />}
          <CardTitle className="text-base">{t("settings.push.title", "Push notifications")}</CardTitle>
        </div>
        <CardDescription>{t("settings.push.description", "Get an alert on this device for deposits, payouts, and security events.")}</CardDescription>
      </CardHeader>
      <CardContent>
        {!supported ? (
          <p className="text-sm text-muted-foreground">
            {isIos && !isStandalone
              ? t(
                  "settings.push.iosInstallRequired",
                  "On iPhone/iPad, Safari only allows push notifications for an installed app — use the Share button and \"Add to Home Screen\", then open it from there to turn this on.",
                )
              : t("settings.push.unsupportedBrowser", "This browser doesn't support push notifications.")}
          </p>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{subscribed ? t("settings.push.enabled", "Enabled on this device") : t("settings.push.disabled", "Off")}</span>
            <Switch checked={subscribed} disabled={loading} onCheckedChange={onToggle} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
