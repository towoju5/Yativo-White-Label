import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { NotificationChannelSettingsDto, UpdateNotificationChannelSettingsInput, WhatsAppProviderKind } from "@white-label/shared-types";
import { staffApi, ApiError } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

type FormState = NotificationChannelSettingsDto & {
  smsAuthTokenInput: string;
  whatsappMetaAccessTokenInput: string;
  whatsappCustomWebhookAuthHeaderInput: string;
  slackWebhookUrlInput: string;
  telegramBotTokenInput: string;
};

const EMPTY: NotificationChannelSettingsDto = {
  webPush: { vapidPublicKey: "", vapidSubject: "" },
  sms: { enabled: false, twilioAccountSid: "", twilioAuthTokenConfigured: false, twilioFromNumber: "" },
  whatsapp: {
    enabled: false,
    provider: "meta",
    metaPhoneNumberId: "",
    metaAccessTokenConfigured: false,
    twilioFromNumber: "",
    customWebhookUrl: "",
    customWebhookAuthHeaderConfigured: false,
  },
  slack: { enabled: false, webhookUrlConfigured: false },
  telegram: { enabled: false, botTokenConfigured: false, chatId: "" },
};

function secretHint(configured: boolean) {
  return configured ? "Currently set — leave blank to keep it" : "Not set";
}

export default function NotificationChannelsSettingsPage() {
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>({
    ...EMPTY,
    smsAuthTokenInput: "",
    whatsappMetaAccessTokenInput: "",
    whatsappCustomWebhookAuthHeaderInput: "",
    slackWebhookUrlInput: "",
    telegramBotTokenInput: "",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "notification-channels"],
    queryFn: () => staffApi.get<NotificationChannelSettingsDto>("/admin/settings/notification-channels"),
  });

  useEffect(() => {
    if (data) {
      setForm((f) => ({
        ...f,
        ...data,
        smsAuthTokenInput: "",
        whatsappMetaAccessTokenInput: "",
        whatsappCustomWebhookAuthHeaderInput: "",
        slackWebhookUrlInput: "",
        telegramBotTokenInput: "",
      }));
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const body: UpdateNotificationChannelSettingsInput = {
        webPush: { vapidSubject: form.webPush.vapidSubject },
        sms: {
          enabled: form.sms.enabled,
          twilioAccountSid: form.sms.twilioAccountSid,
          twilioAuthToken: form.smsAuthTokenInput || undefined,
          twilioFromNumber: form.sms.twilioFromNumber,
        },
        whatsapp: {
          enabled: form.whatsapp.enabled,
          provider: form.whatsapp.provider,
          metaPhoneNumberId: form.whatsapp.metaPhoneNumberId,
          metaAccessToken: form.whatsappMetaAccessTokenInput || undefined,
          twilioFromNumber: form.whatsapp.twilioFromNumber,
          customWebhookUrl: form.whatsapp.customWebhookUrl,
          customWebhookAuthHeader: form.whatsappCustomWebhookAuthHeaderInput || undefined,
        },
        slack: { enabled: form.slack.enabled, webhookUrl: form.slackWebhookUrlInput || undefined },
        telegram: { enabled: form.telegram.enabled, botToken: form.telegramBotTokenInput || undefined, chatId: form.telegram.chatId },
      };
      return staffApi.put<NotificationChannelSettingsDto>("/admin/settings/notification-channels", body);
    },
    onSuccess: (saved) => {
      setForm((f) => ({ ...f, ...saved, smsAuthTokenInput: "", whatsappMetaAccessTokenInput: "", whatsappCustomWebhookAuthHeaderInput: "", slackWebhookUrlInput: "", telegramBotTokenInput: "" }));
      toast({ title: "Notification channel settings saved" });
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't save settings", description: e instanceof ApiError ? e.message : undefined }),
  });

  const copyPublicKey = () => {
    navigator.clipboard?.writeText(form.webPush.vapidPublicKey);
    toast({ title: "Copied to clipboard" });
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Notification channels</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Configure how customers are reached (push, SMS, WhatsApp) and where the team is alerted on ops events (Slack, Telegram).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Web push</CardTitle>
          <CardDescription>Self-issued — no external account needed. Customers opt in from Settings on the portal.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>VAPID public key</Label>
            <div className="flex gap-2">
              <Input readOnly value={form.webPush.vapidPublicKey} className="font-mono text-xs" />
              <Button type="button" variant="outline" onClick={copyPublicKey}>Copy</Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vapidSubject">Contact (mailto: or https:)</Label>
            <Input
              id="vapidSubject"
              value={form.webPush.vapidSubject}
              onChange={(e) => setForm((f) => ({ ...f, webPush: { ...f.webPush, vapidSubject: e.target.value } }))}
              placeholder="mailto:support@example.com"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">SMS (Twilio)</CardTitle>
            <Switch checked={form.sms.enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, sms: { ...f.sms, enabled: v } }))} />
          </div>
          <CardDescription>Requires a Twilio account. Off until an Account SID, Auth Token, and from-number are set.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="twilioAccountSid">Account SID</Label>
            <Input id="twilioAccountSid" value={form.sms.twilioAccountSid} onChange={(e) => setForm((f) => ({ ...f, sms: { ...f.sms, twilioAccountSid: e.target.value } }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="twilioAuthToken">Auth token</Label>
            <Input
              id="twilioAuthToken"
              type="password"
              value={form.smsAuthTokenInput}
              onChange={(e) => setForm((f) => ({ ...f, smsAuthTokenInput: e.target.value }))}
              placeholder={secretHint(form.sms.twilioAuthTokenConfigured)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="twilioFromNumber">From number</Label>
            <Input id="twilioFromNumber" value={form.sms.twilioFromNumber} onChange={(e) => setForm((f) => ({ ...f, sms: { ...f.sms, twilioFromNumber: e.target.value } }))} placeholder="+15551234567" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">WhatsApp</CardTitle>
            <Switch checked={form.whatsapp.enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, whatsapp: { ...f.whatsapp, enabled: v } }))} />
          </div>
          <CardDescription>Pick a provider and supply that provider's own credentials — switching providers later is just a settings change.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Provider</Label>
            <Select
              value={form.whatsapp.provider}
              onValueChange={(v) => setForm((f) => ({ ...f, whatsapp: { ...f.whatsapp, provider: v as WhatsAppProviderKind } }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="meta">Meta Cloud API (direct)</SelectItem>
                <SelectItem value="twilio">Twilio</SelectItem>
                <SelectItem value="custom_webhook">Custom webhook (other provider)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.whatsapp.provider === "meta" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="metaPhoneNumberId">Phone number ID</Label>
                <Input id="metaPhoneNumberId" value={form.whatsapp.metaPhoneNumberId} onChange={(e) => setForm((f) => ({ ...f, whatsapp: { ...f.whatsapp, metaPhoneNumberId: e.target.value } }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="metaAccessToken">Access token</Label>
                <Input
                  id="metaAccessToken"
                  type="password"
                  value={form.whatsappMetaAccessTokenInput}
                  onChange={(e) => setForm((f) => ({ ...f, whatsappMetaAccessTokenInput: e.target.value }))}
                  placeholder={secretHint(form.whatsapp.metaAccessTokenConfigured)}
                />
              </div>
            </>
          )}

          {form.whatsapp.provider === "twilio" && (
            <p className="text-xs text-muted-foreground">Reuses the Twilio Account SID/Auth Token configured above under SMS — just add a WhatsApp-enabled sender number below.</p>
          )}
          {(form.whatsapp.provider === "twilio") && (
            <div className="space-y-1.5">
              <Label htmlFor="whatsappTwilioFrom">WhatsApp-enabled from number</Label>
              <Input
                id="whatsappTwilioFrom"
                value={form.whatsapp.twilioFromNumber}
                onChange={(e) => setForm((f) => ({ ...f, whatsapp: { ...f.whatsapp, twilioFromNumber: e.target.value } }))}
                placeholder="+15551234567"
              />
            </div>
          )}

          {form.whatsapp.provider === "custom_webhook" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="customWebhookUrl">Webhook URL</Label>
                <Input
                  id="customWebhookUrl"
                  value={form.whatsapp.customWebhookUrl}
                  onChange={(e) => setForm((f) => ({ ...f, whatsapp: { ...f.whatsapp, customWebhookUrl: e.target.value } }))}
                  placeholder="https://..."
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="customWebhookAuthHeader">Authorization header</Label>
                <Input
                  id="customWebhookAuthHeader"
                  type="password"
                  value={form.whatsappCustomWebhookAuthHeaderInput}
                  onChange={(e) => setForm((f) => ({ ...f, whatsappCustomWebhookAuthHeaderInput: e.target.value }))}
                  placeholder={secretHint(form.whatsapp.customWebhookAuthHeaderConfigured)}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Slack (ops alerts)</CardTitle>
            <Switch checked={form.slack.enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, slack: { ...f.slack, enabled: v } }))} />
          </div>
          <CardDescription>Internal alerts only — webhook failures, failed payouts, KYC submissions. Not sent to customers.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="slackWebhookUrl">Incoming webhook URL</Label>
            <Input
              id="slackWebhookUrl"
              type="password"
              value={form.slackWebhookUrlInput}
              onChange={(e) => setForm((f) => ({ ...f, slackWebhookUrlInput: e.target.value }))}
              placeholder={secretHint(form.slack.webhookUrlConfigured)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Telegram (ops alerts)</CardTitle>
            <Switch checked={form.telegram.enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, telegram: { ...f.telegram, enabled: v } }))} />
          </div>
          <CardDescription>Internal alerts only, via a bot created with @BotFather.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="telegramBotToken">Bot token</Label>
            <Input
              id="telegramBotToken"
              type="password"
              value={form.telegramBotTokenInput}
              onChange={(e) => setForm((f) => ({ ...f, telegramBotTokenInput: e.target.value }))}
              placeholder={secretHint(form.telegram.botTokenConfigured)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="telegramChatId">Chat ID</Label>
            <Input id="telegramChatId" value={form.telegram.chatId} onChange={(e) => setForm((f) => ({ ...f, telegram: { ...f.telegram, chatId: e.target.value } }))} />
          </div>
        </CardContent>
      </Card>

      <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
        {saveMutation.isPending ? "Saving…" : "Save changes"}
      </Button>
    </div>
  );
}
