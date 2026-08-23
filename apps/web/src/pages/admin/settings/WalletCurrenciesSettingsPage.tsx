import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { WalletCurrencySettings, WalletCurrencyMode, AdminCurrency } from "@white-label/shared-types";
import { RefreshCw, Coins } from "lucide-react";
import { staffApi, ApiError } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const MODE_LABELS: Record<WalletCurrencyMode, string> = {
  DEFAULT_ONLY: "Default only — customers hold a single wallet currency",
  SELF_SERVICE: "Self-service — customers can add other enabled currencies themselves",
  ALL_AUTOMATIC: "All automatic — every enabled currency is provisioned at signup",
};

export default function WalletCurrenciesSettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [pendingCode, setPendingCode] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "settings", "wallet-currencies"],
    queryFn: () => staffApi.get<WalletCurrencySettings>("/admin/settings/wallet-currencies"),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin", "settings", "wallet-currencies"] });

  const syncMutation = useMutation({
    mutationFn: () => staffApi.post<WalletCurrencySettings>("/admin/settings/wallet-currencies/sync"),
    onSuccess: (result) => {
      queryClient.setQueryData(["admin", "settings", "wallet-currencies"], result);
      toast({ title: "Currencies synced from Yativo" });
    },
    onError: (e) => toast({ variant: "destructive", title: "Sync failed", description: e instanceof ApiError ? e.message : undefined }),
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (body: { walletCurrencyMode?: WalletCurrencyMode; defaultCurrencyCode?: string }) =>
      staffApi.patch("/admin/settings/wallet-currencies", body),
    onSuccess: () => {
      invalidate();
      toast({ title: "Settings updated" });
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't update settings", description: e instanceof ApiError ? e.message : undefined }),
  });

  const toggleCurrencyMutation = useMutation({
    mutationFn: ({ code, isEnabledForCustomers }: { code: string; isEnabledForCustomers: boolean }) =>
      staffApi.patch(`/admin/settings/wallet-currencies/${code}`, { isEnabledForCustomers }),
    onMutate: ({ code }) => setPendingCode(code),
    onSuccess: () => invalidate(),
    onError: (e) => toast({ variant: "destructive", title: "Couldn't update currency", description: e instanceof ApiError ? e.message : undefined }),
    onSettled: () => setPendingCode(null),
  });

  const settings = data?.settings;
  const currencies = data?.currencies ?? [];
  const enabledCurrencies = currencies.filter((c) => c.isEnabledForCustomers);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Wallet currencies</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Control which currencies customers can hold, and how they get them.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
          <RefreshCw className={syncMutation.isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Sync from Yativo
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Policy</CardTitle>
          <CardDescription>How new and existing customers get additional wallet currencies.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading || !settings ? (
            <div className="space-y-3">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Mode</label>
                <Select
                  value={settings.walletCurrencyMode}
                  onValueChange={(v) => updateSettingsMutation.mutate({ walletCurrencyMode: v as WalletCurrencyMode })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(MODE_LABELS) as WalletCurrencyMode[]).map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {MODE_LABELS[mode]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Default currency</label>
                <Select
                  value={settings.defaultCurrencyCode}
                  onValueChange={(v) => updateSettingsMutation.mutate({ defaultCurrencyCode: v })}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {enabledCurrencies.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.code} — {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Every customer gets a wallet in this currency automatically at signup.</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Currencies</CardTitle>
          </div>
          <CardDescription>Toggle which currencies are available to customers.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : currencies.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-10 text-center">
              <p className="text-sm text-muted-foreground">No currencies yet — sync from Yativo to populate this list.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Currency</TableHead>
                  <TableHead>Decimals</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Enabled for customers</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currencies.map((c: AdminCurrency) => (
                  <TableRow key={c.code}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {c.logoUrl && <img src={c.logoUrl} alt="" className="h-4 w-4 rounded-full" />}
                        {c.code} <span className="font-normal text-muted-foreground">{c.name}</span>
                        {c.code === settings?.defaultCurrencyCode && <Badge variant="outline">Default</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.decimals}</TableCell>
                    <TableCell>
                      <Badge variant={c.isActive ? "success" : "outline"}>{c.isActive ? "Active" : "Inactive"}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Switch
                        checked={c.isEnabledForCustomers}
                        disabled={pendingCode === c.code}
                        onCheckedChange={(checked) => toggleCurrencyMutation.mutate({ code: c.code, isEnabledForCustomers: checked })}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
