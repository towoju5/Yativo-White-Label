import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Copy, RefreshCw } from "lucide-react";
import { staffApi, ApiError } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

type Config = {
  yativo: {
    mode: "mock" | "sandbox" | "live";
    fiatBaseUrl: string;
    kycBaseUrl: string;
    apiKeyConfigured: boolean;
    apiKey?: string;
    apiSecretConfigured: boolean;
    apiSecret?: string;
    webhookSecretConfigured: boolean;
    webhookSecret?: string;
    webhookUrl: string;
  };
  smtp: {
    mode: "sendmail" | "smtp";
    sendmailPath: string;
    host: string;
    port: number;
    secure: boolean;
    user: string;
    fromAddress: string;
    passwordConfigured: boolean;
    password?: string;
  };
};

const emptyConfig: Config = {
  yativo: {
    mode: "mock",
    fiatBaseUrl: "",
    kycBaseUrl: "",
    apiKeyConfigured: false,
    apiSecretConfigured: false,
    webhookSecretConfigured: false,
    webhookUrl: "",
  },
  smtp: {
    mode: "sendmail",
    sendmailPath: "",
    host: "",
    port: 587,
    secure: false,
    user: "",
    fromAddress: "",
    passwordConfigured: false,
  },
};

function secretHint(configured: boolean) {
  return configured ? "Currently set — leave blank to keep it" : "Not set";
}

export default function IntegrationsSettingsPage() {
  const { toast } = useToast();
  const [config, setConfig] = useState<Config>(emptyConfig);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "platform-integrations"],
    queryFn: () => staffApi.get<Config>("/admin/settings/integrations"),
  });

  useEffect(() => {
    if (data) setConfig(data);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => staffApi.put<Config>("/admin/settings/integrations", config),
    onSuccess: (saved) => {
      setConfig(saved);
      toast({ title: "Integration settings saved" });
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't save settings", description: e instanceof ApiError ? e.message : undefined }),
  });

  const updateYativo = (field: keyof Config["yativo"], value: string) => {
    setConfig((c) => ({ ...c, yativo: { ...c.yativo, [field]: value } }));
  };

  const updateSmtp = (field: keyof Config["smtp"], value: string | number | boolean) => {
    setConfig((c) => ({ ...c, smtp: { ...c.smtp, [field]: value } }));
  };

  const copyWebhookUrl = () => {
    navigator.clipboard?.writeText(config.yativo.webhookUrl);
    toast({ title: "Copied to clipboard" });
  };

  const syncSecretMutation = useMutation({
    mutationFn: () => staffApi.post<{ rotated: boolean }>("/admin/settings/integrations/sync-webhook-secret"),
    onSuccess: ({ rotated }) => {
      toast({
        title: rotated ? "Webhook secret updated" : "Already up to date",
        description: rotated
          ? "Pulled the current secret from Yativo — signature verification should work again."
          : "Yativo reports the same secret this app already has configured.",
      });
      if (rotated) setConfig((c) => ({ ...c, yativo: { ...c.yativo, webhookSecretConfigured: true } }));
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't sync webhook secret", description: e instanceof ApiError ? e.message : undefined }),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Integrations</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Credentials this platform uses to talk to Yativo and to send email. Secret values are encrypted at rest and never shown again after saving.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Yativo</CardTitle>
          <CardDescription>Mode, base URLs, and API credentials for the upstream Yativo integration.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="webhookUrl">Webhook URL</Label>
            <div className="flex gap-2">
              <Input id="webhookUrl" readOnly value={config.yativo.webhookUrl} className="font-mono text-sm" />
              <Button type="button" variant="outline" size="icon" aria-label="Copy webhook URL" onClick={copyWebhookUrl}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Register this URL on the Yativo dashboard so it can deliver events to this platform.</p>
          </div>

          <div className="space-y-1.5">
            <Label>Webhook signature</Label>
            <div>
              <Button type="button" variant="outline" size="sm" onClick={() => syncSecretMutation.mutate()} disabled={syncSecretMutation.isPending}>
                <RefreshCw className={syncSecretMutation.isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Sync secret from Yativo
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              If deliveries are failing signature verification (e.g. after rotating the secret on Yativo's dashboard), this pulls the current one
              directly from Yativo's API and saves it here — no need to copy/paste it manually.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Mode</Label>
            <Select value={config.yativo.mode} onValueChange={(v) => updateYativo("mode", v)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mock">Mock</SelectItem>
                <SelectItem value="sandbox">Sandbox</SelectItem>
                <SelectItem value="live">Live</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fiatBaseUrl">Fiat base URL</Label>
              <Input id="fiatBaseUrl" value={config.yativo.fiatBaseUrl} onChange={(e) => updateYativo("fiatBaseUrl", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kycBaseUrl">KYC base URL</Label>
              <Input id="kycBaseUrl" value={config.yativo.kycBaseUrl} onChange={(e) => updateYativo("kycBaseUrl", e.target.value)} />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="apiKey">API key</Label>
              <Input
                id="apiKey"
                type="password"
                placeholder={secretHint(config.yativo.apiKeyConfigured)}
                value={config.yativo.apiKey ?? ""}
                onChange={(e) => updateYativo("apiKey", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="apiSecret">API secret</Label>
              <Input
                id="apiSecret"
                type="password"
                placeholder={secretHint(config.yativo.apiSecretConfigured)}
                value={config.yativo.apiSecret ?? ""}
                onChange={(e) => updateYativo("apiSecret", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="webhookSecret">Webhook secret</Label>
              <Input
                id="webhookSecret"
                type="password"
                placeholder={secretHint(config.yativo.webhookSecretConfigured)}
                value={config.yativo.webhookSecret ?? ""}
                onChange={(e) => updateYativo("webhookSecret", e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Email</CardTitle>
          <CardDescription>Where and how transactional emails are sent.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="emailMode">Transport</Label>
            <Select value={config.smtp.mode} onValueChange={(v) => updateSmtp("mode", v)}>
              <SelectTrigger className="w-64" id="emailMode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sendmail">Sendmail (local binary)</SelectItem>
                <SelectItem value="smtp">SMTP</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="smtpFrom">From address</Label>
              <Input id="smtpFrom" value={config.smtp.fromAddress} onChange={(e) => updateSmtp("fromAddress", e.target.value)} />
            </div>
            {config.smtp.mode === "sendmail" && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="sendmailPath">Sendmail binary path (optional)</Label>
                <Input
                  id="sendmailPath"
                  placeholder="sendmail"
                  value={config.smtp.sendmailPath}
                  onChange={(e) => updateSmtp("sendmailPath", e.target.value)}
                />
              </div>
            )}
          </div>

          {config.smtp.mode === "smtp" && (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="smtpHost">Host</Label>
                  <Input id="smtpHost" value={config.smtp.host} onChange={(e) => updateSmtp("host", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="smtpPort">Port</Label>
                  <Input id="smtpPort" type="number" value={config.smtp.port} onChange={(e) => updateSmtp("port", Number(e.target.value))} />
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="smtpUser">Username</Label>
                  <Input id="smtpUser" value={config.smtp.user} onChange={(e) => updateSmtp("user", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="smtpPassword">Password</Label>
                  <Input
                    id="smtpPassword"
                    type="password"
                    placeholder={secretHint(config.smtp.passwordConfigured)}
                    value={config.smtp.password ?? ""}
                    onChange={(e) => updateSmtp("password", e.target.value)}
                  />
                </div>
                <div className="flex items-end gap-2 pb-2">
                  <input
                    id="smtpSecure"
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300"
                    checked={config.smtp.secure}
                    onChange={(e) => updateSmtp("secure", e.target.checked)}
                  />
                  <Label htmlFor="smtpSecure">Use TLS (secure)</Label>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? "Saving…" : "Save integration settings"}
        </Button>
      </div>
    </div>
  );
}
