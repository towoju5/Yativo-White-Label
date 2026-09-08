import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { WalletCurrencySettings, KycRequiredService, YativoCustomerMode, UpdateYativoCustomerModeResult } from "@white-label/shared-types";
import { KYC_REQUIRED_SERVICES } from "@white-label/shared-types";
import { ShieldCheck, Users } from "lucide-react";
import { staffApi, ApiError } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const YATIVO_MODE_LABELS: Record<YativoCustomerMode, string> = {
  PER_CUSTOMER: "Per-customer — each customer gets their own Yativo identity and KYC",
  POOLED: "Pooled — every customer transacts under one Yativo customer ID, no per-customer KYC",
};

const SERVICE_LABELS: Record<KycRequiredService, { title: string; description: string }> = {
  DEPOSIT: { title: "Deposits", description: "Initiating a native gateway deposit (CODI, SPEI, bank transfer, etc.)" },
  VIRTUAL_ACCOUNT: { title: "Virtual accounts", description: "Viewing or provisioning a dedicated receiving account" },
  PAYOUT: { title: "Payouts", description: "Sending money to a beneficiary" },
  CARD: { title: "Cards", description: "Issuing a new virtual card" },
  BENEFICIARY: { title: "Beneficiaries", description: "Adding a new payout recipient" },
  CRYPTO_WALLET: { title: "Crypto wallets", description: "Generating a crypto deposit address" },
  BUSINESS_SPEND_CARD: { title: "Business Spend Cards", description: "Issuing a new Business Spend Card" },
};

export default function VerificationSettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "settings", "wallet-currencies"],
    queryFn: () => staffApi.get<WalletCurrencySettings>("/admin/settings/wallet-currencies"),
  });

  const updateMutation = useMutation({
    mutationFn: (kycRequiredServices: KycRequiredService[]) => staffApi.patch("/admin/settings/kyc-requirements", { kycRequiredServices }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "settings", "wallet-currencies"] }),
    onError: (e) => toast({ variant: "destructive", title: "Couldn't update", description: e instanceof ApiError ? e.message : undefined }),
  });

  const required = new Set(data?.settings.kycRequiredServices ?? []);

  const toggle = (service: KycRequiredService, checked: boolean) => {
    const next = new Set(required);
    if (checked) next.add(service);
    else next.delete(service);
    updateMutation.mutate([...next]);
  };

  const [yativoMode, setYativoMode] = useState<YativoCustomerMode>("PER_CUSTOMER");
  const [pooledId, setPooledId] = useState("");
  const [confirmingMigrate, setConfirmingMigrate] = useState(false);

  useEffect(() => {
    if (data?.settings) {
      setYativoMode(data.settings.yativoCustomerMode);
      setPooledId(data.settings.pooledYativoCustomerId ?? "");
    }
  }, [data?.settings]);

  const yativoModeMutation = useMutation({
    mutationFn: (migrateExisting: boolean) =>
      staffApi.patch<UpdateYativoCustomerModeResult>("/admin/settings/yativo-customer-mode", {
        mode: yativoMode,
        pooledYativoCustomerId: yativoMode === "POOLED" ? pooledId : undefined,
        migrateExisting,
      }),
    onSuccess: (result) => {
      toast({
        title: "Yativo customer mode updated",
        description: result.migratedCount > 0 ? `${result.migratedCount} existing customer(s) switched to the pooled ID.` : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["admin", "settings", "wallet-currencies"] });
      setConfirmingMigrate(false);
    },
    onError: (e) => {
      toast({ variant: "destructive", title: "Couldn't update Yativo customer mode", description: e instanceof ApiError ? e.message : undefined });
      setConfirmingMigrate(false);
    },
  });

  const yativoModeDirty = data?.settings && (data.settings.yativoCustomerMode !== yativoMode || (data.settings.pooledYativoCustomerId ?? "") !== pooledId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Verification requirements</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Choose which actions require an approved identity verification first.</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Services</CardTitle>
          </div>
          <CardDescription>Turning a service off lets customers use it before their KYC is approved.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {KYC_REQUIRED_SERVICES.map((service) => (
                <div key={service} className="flex items-center justify-between py-3.5">
                  <div>
                    <p className="text-sm font-medium">{SERVICE_LABELS[service].title}</p>
                    <p className="text-xs text-muted-foreground">{SERVICE_LABELS[service].description}</p>
                  </div>
                  <Switch
                    checked={required.has(service)}
                    disabled={updateMutation.isPending}
                    onCheckedChange={(checked) => toggle(service, checked)}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Yativo customer registration</CardTitle>
          </div>
          <CardDescription>Whether each customer gets their own Yativo identity, or everyone transacts under one you provide.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <Skeleton className="h-24" />
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>Mode</Label>
                <Select value={yativoMode} onValueChange={(v) => setYativoMode(v as YativoCustomerMode)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(YATIVO_MODE_LABELS) as YativoCustomerMode[]).map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {YATIVO_MODE_LABELS[mode]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {yativoMode === "POOLED" && (
                <div className="space-y-1.5">
                  <Label htmlFor="pooledYativoCustomerId">Pooled Yativo customer ID</Label>
                  <Input id="pooledYativoCustomerId" placeholder="e.g. cust_abc123" value={pooledId} onChange={(e) => setPooledId(e.target.value)} />
                  <p className="text-xs text-muted-foreground">
                    Every customer who doesn't already have their own Yativo customer ID will be assigned this one — no phone/country needed, and this
                    app's own KYC review is skipped for them too.
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2">
                {yativoMode === "POOLED" && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!pooledId || yativoModeMutation.isPending}
                    onClick={() => setConfirmingMigrate(true)}
                  >
                    Save &amp; migrate existing customers
                  </Button>
                )}
                <Button
                  onClick={() => yativoModeMutation.mutate(false)}
                  disabled={(yativoMode === "POOLED" && !pooledId) || !yativoModeDirty || yativoModeMutation.isPending}
                >
                  {yativoModeMutation.isPending ? "Saving…" : "Save"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmingMigrate} onOpenChange={setConfirmingMigrate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Migrate every customer to the pooled ID?</DialogTitle>
            <DialogDescription>
              This re-points <strong>every</strong> customer's Yativo customer ID to the one above — including customers who already have their own,
              individually-registered ID. Their prior Yativo-side history stays under the old ID, not the new one. This can't be undone from this app.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmingMigrate(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={yativoModeMutation.isPending} onClick={() => yativoModeMutation.mutate(true)}>
              {yativoModeMutation.isPending ? "Migrating…" : "Migrate everyone"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
