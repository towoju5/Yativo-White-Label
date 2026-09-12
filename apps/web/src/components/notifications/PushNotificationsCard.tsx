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

  if (!supported) return null;

  const onToggle = async (checked: boolean) => {
    if (checked) {
      const ok = await subscribe();
      if (!ok) {
        toast({ variant: "destructive", title: t("settings.push.permissionDenied", "Notifications permission wasn't granted") });
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
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{subscribed ? t("settings.push.enabled", "Enabled on this device") : t("settings.push.disabled", "Off")}</span>
          <Switch checked={subscribed} disabled={loading} onCheckedChange={onToggle} />
        </div>
      </CardContent>
    </Card>
  );
}
