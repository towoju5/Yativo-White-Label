import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { WalletCurrencySettings, KycRequiredService } from "@white-label/shared-types";
import { KYC_REQUIRED_SERVICES } from "@white-label/shared-types";
import { ShieldCheck } from "lucide-react";
import { staffApi, ApiError } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

const SERVICE_LABELS: Record<KycRequiredService, { title: string; description: string }> = {
  DEPOSIT: { title: "Deposits", description: "Initiating a native gateway deposit (CODI, SPEI, bank transfer, etc.)" },
  VIRTUAL_ACCOUNT: { title: "Virtual accounts", description: "Viewing or provisioning a dedicated receiving account" },
  PAYOUT: { title: "Payouts", description: "Sending money to a beneficiary" },
  CARD: { title: "Cards", description: "Issuing a new virtual card" },
  BENEFICIARY: { title: "Beneficiaries", description: "Adding a new payout recipient" },
  CRYPTO_WALLET: { title: "Crypto wallets", description: "Generating a crypto deposit address" },
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
    </div>
  );
}
