import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { VirtualAccount, VirtualAccountCurrency } from "@white-label/shared-types";
import { CheckCircle2, Clock, Copy, ExternalLink, Landmark, ShieldCheck } from "lucide-react";
import { portalApi, ApiError } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const FIELD_LABELS: Record<string, string> = {
  accountId: "Account ID",
  accountNumber: "Account number",
  routingNumber: "Routing number",
  bankName: "Bank name",
  beneficiaryName: "Beneficiary name",
  reference: "Payment reference",
  iban: "IBAN",
  swiftBic: "SWIFT / BIC",
  currencyCode: "Currency",
};

function formatEndorsement(endorsement: string) {
  return endorsement.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function VirtualAccountsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [creatingCurrency, setCreatingCurrency] = useState<string | null>(null);

  const accountsQuery = useQuery({
    queryKey: ["portal", "virtual-accounts"],
    queryFn: () => portalApi.get<VirtualAccount[]>("/portal/virtual-accounts"),
  });

  const currenciesQuery = useQuery({
    queryKey: ["portal", "virtual-accounts", "currencies"],
    queryFn: () => portalApi.get<VirtualAccountCurrency[]>("/portal/virtual-accounts/currencies"),
  });

  const createMutation = useMutation({
    mutationFn: (currency: string) => portalApi.post<VirtualAccount>("/portal/virtual-accounts", { currency }),
    onSuccess: () => {
      toast({ title: "Virtual account ready" });
      queryClient.invalidateQueries({ queryKey: ["portal", "virtual-accounts"] });
      setCreatingCurrency(null);
    },
    onError: (e) => {
      toast({ variant: "destructive", title: "Couldn't create account", description: e instanceof ApiError ? e.message : undefined });
      setCreatingCurrency(null);
    },
  });

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: "Copied to clipboard" });
    } catch {
      toast({ variant: "destructive", title: "Couldn't copy" });
    }
  };

  const accounts = accountsQuery.data ?? [];
  const provisionedCurrencies = new Set(accounts.map((a) => a.currencyCode));
  const availableCurrencies = (currenciesQuery.data ?? []).filter((c) => !provisionedCurrencies.has(c.currency));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Virtual accounts</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Dedicated bank details you can reuse for every incoming transfer, once per currency.</p>
      </div>
        <div class="flex col-span-2 gap-4 sm:col-span-1 sm:flex-col">
          <Card>
              <CardHeader>
                  <div className="flex items-center gap-2">
                      <Landmark className="h-4 w-4 text-primary" />
                      <CardTitle className="text-base">Your accounts</CardTitle>
                  </div>
                  <CardDescription>Share these details with whoever is sending you funds.</CardDescription>
              </CardHeader>
              <CardContent>
                  {accountsQuery.isLoading ? (
                  <div className="space-y-3">
                      {Array.from({ length: 2 }).map((_, i) => (
                      <Skeleton key={i} className="h-32" />
                      ))}
                  </div>
                  ) : accounts.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                      No virtual accounts yet — provision one for a currency below.
                  </p>
                  ) : (
                  <div className="space-y-4">
                      {accounts.map((a) => (
                      <div key={a.accountId} className="rounded-lg border border-border p-4">
                          <div className="mb-2 flex items-center justify-between">
                              <Badge variant="outline">{a.currencyCode}</Badge>
                          </div>
                          <dl className="divide-y divide-border">
                              {Object.entries(a)
                              .filter(([key]) => key !== "currencyCode")
                              .map(([key, value]) => (
                              <div key={key} className="flex items-center justify-between py-2 text-sm">
                                  <dt className="text-muted-foreground">{FIELD_LABELS[key] ?? key}</dt>
                                  <dd className="flex items-center gap-2 font-mono">
                                      {value}
                                      <button onClick={()=> copy(value)} className="text-muted-foreground
                                          hover:text-foreground" aria-label={`Copy ${key}`}>
                                          <Copy className="h-3.5 w-3.5" />
                                      </button>
                                  </dd>
                              </div>
                              ))}
                          </dl>
                      </div>
                      ))}
                  </div>
                  )}
              </CardContent>
          </Card>

          <Card>
              <CardHeader>
                  <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-primary" />
                      <CardTitle className="text-base">Add a currency</CardTitle>
                  </div>
                  <CardDescription>Some rails need a one-time verification before an account can be issued.</CardDescription>
              </CardHeader>
              <CardContent>
                  {currenciesQuery.isLoading ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                      {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-20" />
                      ))}
                  </div>
                  ) : availableCurrencies.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                      {accounts.length > 0 ? "You already have an account for every available currency." : "No virtual account
                      currencies are available yet."}
                  </p>
                  ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                      {availableCurrencies.map((c) => {
                      const pending = creatingCurrency === c.currency && createMutation.isPending;
                      return (
                      <div key={c.currency} className={cn("flex flex-col gap-2 rounded-xl border border-border p-4",
                          !c.eligible && "opacity-80" )}>
                          <div className="flex items-center justify-between">
                              <span className="text-sm font-semibold">{c.currency}</span>
                              {c.endorsement === null ? (
                              <Badge variant="outline" className="gap-1 text-[10px]">
                                  <CheckCircle2 className="h-3 w-3" /> No verification needed
                              </Badge>
                              ) : c.eligible ? (
                              <Badge variant="success" className="gap-1 text-[10px]">
                                  <CheckCircle2 className="h-3 w-3" /> Verified
                              </Badge>
                              ) : (
                              <Badge variant="outline" className="gap-1 text-[10px]">
                                  <Clock className="h-3 w-3" /> {formatEndorsement(c.endorsement)}
                              </Badge>
                              )}
                          </div>
                          {c.eligible ? (
                          <Button size="sm" disabled={pending} onClick={()=> { setCreatingCurrency(c.currency);
                              createMutation.mutate(c.currency); }}>
                              {pending ? "Creating…" : "Create account"}
                          </Button>
                          ) : c.hostedKycUrl ? (
                          <Button size="sm" variant="outline" asChild>
                              <a href={c.hostedKycUrl} target="_blank" rel="noreferrer">
                                  Start verification
                                  <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                          </Button>
                          ) : (
                          <p className="text-xs text-muted-foreground">
                              Requires {formatEndorsement(c.endorsement!)} verification — contact support to get started.
                          </p>
                          )}
                      </div>
                      );
                      })}
                  </div>
                  )}
              </CardContent>
          </Card>
      </div>
    </div>
  );
}