import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
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
    cryptoBaseUrl: string;
    kycBaseUrl: string;
    apiKeyConfigured: boolean;
    apiKey?: string;
    apiSecretConfigured: boolean;
    apiSecret?: string;
    webhookSecretConfigured: boolean;
    webhookSecret?: string;
  };
  smtp: {
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
    cryptoBaseUrl: "",
    kycBaseUrl: "",
    apiKeyConfigured: false,
    apiSecretConfigured: false,
    webhookSecretConfigured: false,
  },
  smtp: {
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

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="fiatBaseUrl">Fiat base URL</Label>
              <Input id="fiatBaseUrl" value={config.yativo.fiatBaseUrl} onChange={(e) => updateYativo("fiatBaseUrl", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cryptoBaseUrl">Crypto base URL</Label>
              <Input id="cryptoBaseUrl" value={config.yativo.cryptoBaseUrl} onChange={(e) => updateYativo("cryptoBaseUrl", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kycBaseUrl">KYC base URL</Label>
              <Input id="kycBaseUrl" value={config.yativo.kycBaseUrl} onChange={(e) => updateYativo("kycBaseUrl", e.target.value)} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
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
          <CardTitle className="text-base">Email (SMTP)</CardTitle>
          <CardDescription>Where transactional emails are sent from.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="smtpHost">Host</Label>
              <Input id="smtpHost" value={config.smtp.host} onChange={(e) => updateSmtp("host", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smtpPort">Port</Label>
              <Input id="smtpPort" type="number" value={config.smtp.port} onChange={(e) => updateSmtp("port", Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smtpFrom">From address</Label>
              <Input id="smtpFrom" value={config.smtp.fromAddress} onChange={(e) => updateSmtp("fromAddress", e.target.value)} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
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
