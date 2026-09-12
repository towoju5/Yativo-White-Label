import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { VirtualAccount, VirtualAccountCurrency, CustomerTransactionListItem } from "@white-label/shared-types";
import { CheckCircle2, ChevronDown, Clock, Copy, ExternalLink, Landmark, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { portalApi, ApiError } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Paginated } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { KycRequiredNotice } from "@/components/kyc/KycRequiredNotice";
import { TransactionCardRow } from "@/components/wallet/TransactionCardRow";

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
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [creatingCurrency, setCreatingCurrency] = useState<string | null>(null);
  const [expandedAccountId, setExpandedAccountId] = useState<string | null>(null);

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
      toast({ title: t("virtualAccounts.accountReady", "Virtual account ready") });
      queryClient.invalidateQueries({ queryKey: ["portal", "virtual-accounts"] });
      setCreatingCurrency(null);
    },
    onError: (e) => {
      toast({ variant: "destructive", title: t("virtualAccounts.createAccountError", "Couldn't create account"), description: e instanceof ApiError ? e.message : undefined });
      setCreatingCurrency(null);
    },
  });

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: t("virtualAccounts.copiedToClipboard", "Copied to clipboard") });
    } catch {
      toast({ variant: "destructive", title: t("virtualAccounts.copyError", "Couldn't copy") });
    }
  };

  const accounts = accountsQuery.data ?? [];
  const provisionedCurrencies = new Set(accounts.map((a) => a.currencyCode));
  const availableCurrencies = (currenciesQuery.data ?? []).filter((c) => !provisionedCurrencies.has(c.currency));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{t("virtualAccounts.title", "Virtual accounts")}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{t("virtualAccounts.subtitle", "Dedicated bank details you can reuse for every incoming transfer, once per currency.")}</p>
      </div>

      <KycRequiredNotice service="VIRTUAL_ACCOUNT" />
        <div className="flex col-span-2 gap-4 sm:col-span-1 sm:flex-col">
          <Card>
              <CardHeader>
                  <div className="flex items-center gap-2">
                      <Landmark className="h-4 w-4 text-primary" />
                      <CardTitle className="text-base">{t("virtualAccounts.yourAccounts", "Your accounts")}</CardTitle>
                  </div>
                  <CardDescription>{t("virtualAccounts.shareDetails", "Share these details with whoever is sending you funds.")}</CardDescription>
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
                      {t("virtualAccounts.noAccountsYet", "No virtual accounts yet — provision one for a currency below.")}
                  </p>
                  ) : (
                  <div className="space-y-4">
                      {accounts.map((a) => {
                      const isExpanded = expandedAccountId === a.accountId;
                      return (
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
                                          hover:text-foreground" aria-label={t("virtualAccounts.copyField", "Copy {{field}}", { field: key })}>
                                          <Copy className="h-3.5 w-3.5" />
                                      </button>
                                  </dd>
                              </div>
                              ))}
                          </dl>
                          <button
                              type="button"
                              onClick={() => setExpandedAccountId(isExpanded ? null : a.accountId ?? null)}
                              className="mt-3 flex w-full items-center justify-between border-t border-border pt-3 text-sm font-medium text-muted-foreground hover:text-foreground"
                          >
                              {t("virtualAccounts.recentActivity", "Recent activity")}
                              <ChevronDown className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-180")} />
                          </button>
                          {isExpanded && a.currencyCode && <AccountActivity currencyCode={a.currencyCode} />}
                      </div>
                      );
                      })}
                  </div>
                  )}
              </CardContent>
          </Card>

          <Card>
              <CardHeader>
                  <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-primary" />
                      <CardTitle className="text-base">{t("virtualAccounts.addCurrency", "Add a currency")}</CardTitle>
                  </div>
                  <CardDescription>{t("virtualAccounts.verificationNote", "Some rails need a one-time verification before an account can be issued.")}</CardDescription>
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
                      {accounts.length > 0 ? t('virtualAccounts.allCurrenciesAdded', 'You already have an account for every available currency.') : t('virtualAccounts.noCurrenciesAvailable', 'No virtual account currencies are available yet.')}
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
                                  <CheckCircle2 className="h-3 w-3" /> {t("virtualAccounts.noVerificationNeeded", "No verification needed")}
                              </Badge>
                              ) : c.eligible ? (
                              <Badge variant="success" className="gap-1 text-[10px]">
                                  <CheckCircle2 className="h-3 w-3" /> {t("virtualAccounts.verified", "Verified")}
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
                              {pending ? t("virtualAccounts.creating", "Creating…") : t("virtualAccounts.createAccount", "Create account")}
                          </Button>
                          ) : c.hostedKycUrl ? (
                          <Button size="sm" variant="outline" asChild>
                              <a href={c.hostedKycUrl} target="_blank" rel="noreferrer">
                                  {t("virtualAccounts.startVerification", "Start verification")}
                                  <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                          </Button>
                          ) : (
                          <p className="text-xs text-muted-foreground">
                              {t("virtualAccounts.requiresVerification", "Requires {{endorsement}} verification — contact support to get started.", { endorsement: formatEndorsement(c.endorsement!) })}
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

function AccountActivity({ currencyCode }: { currencyCode: string }) {
  const { t } = useTranslation();
  // Virtual accounts are provisioned one-per-currency (get-or-create — see virtualAccounts.routes.ts),
  // and incoming transfers land as DEPOSIT ledger entries in that same currency, so this filter
  // reliably scopes to just this account without needing a dedicated per-account history endpoint.
  const activityQuery = useQuery({
    queryKey: ["portal", "transactions", "virtual-account", currencyCode],
    queryFn: () => portalApi.get<Paginated<CustomerTransactionListItem>>("/portal/transactions", { type: "DEPOSIT", currencyCode, page: 1, pageSize: 5 }),
  });
  const items = activityQuery.data?.items ?? [];

  return (
    <div className="mt-2 rounded-lg border border-border">
      {activityQuery.isLoading ? (
        <div className="space-y-2 p-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="p-4 text-center text-xs text-muted-foreground">{t("virtualAccounts.noActivity", "No incoming transfers yet.")}</p>
      ) : (
        <>
          <div className="divide-y divide-border">
            {items.map((tx) => (
              <TransactionCardRow
                key={tx.id}
                date={tx.createdAt}
                description={tx.description ?? tx.type}
                status={tx.status}
                direction={tx.direction}
                amountMinor={tx.amountMinor}
                currencyCode={tx.currencyCode ?? ""}
              />
            ))}
          </div>
          <Link to="/portal/transactions" className="block border-t border-border p-2 text-center text-xs font-medium text-primary hover:underline">
            {t("virtualAccounts.viewAllActivity", "View all in Transactions")}
          </Link>
        </>
      )}
    </div>
  );
}