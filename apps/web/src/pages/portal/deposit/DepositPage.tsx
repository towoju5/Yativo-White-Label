import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { DepositCountry, DepositMethod, DepositFormField, DepositResult, WalletBalance } from "@white-label/shared-types";
import { ArrowLeft, ArrowRight, Banknote, Check, Coins, Copy, ExternalLink, Landmark, Loader2, Wallet as WalletIcon } from "lucide-react";
import { portalApi, ApiError } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchableSelect, Stepper } from "@/pages/portal/kyc/kycShared";

export default function DepositPage() {
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Deposit</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Fund your wallet with a one-time payment via a local rail, or crypto.</p>
      </div>

      <NativeDepositCard />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Or deposit crypto</CardTitle>
          </div>
          <CardDescription>Deposit addresses and on-chain deposit history now live on their own page.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link to="/portal/crypto">
              Go to crypto wallets <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

const DEPOSIT_STEPS = ["Country", "Method", "Amount & details"];

function NativeDepositCard() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [countryIso3, setCountryIso3] = useState("");
  const [gatewayId, setGatewayId] = useState("");
  const [walletCurrencyCode, setWalletCurrencyCode] = useState("");
  const [amount, setAmount] = useState("");
  const [extraData, setExtraData] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<DepositResult | null>(null);

  const countriesQuery = useQuery({
    queryKey: ["portal", "deposit", "countries"],
    queryFn: () => portalApi.get<DepositCountry[]>("/portal/deposit/countries"),
  });

  const methodsQuery = useQuery({
    queryKey: ["portal", "deposit", "methods", countryIso3],
    queryFn: () => portalApi.get<DepositMethod[]>("/portal/deposit/methods", { country: countryIso3 }),
    enabled: !!countryIso3,
  });

  const walletsQuery = useQuery({
    queryKey: ["portal", "wallets"],
    queryFn: () => portalApi.get<WalletBalance[]>("/portal/wallets"),
    enabled: open,
  });

  const selectedCountry = countriesQuery.data?.find((c) => c.iso3 === countryIso3);
  const selectedMethod = methodsQuery.data?.find((m) => m.gatewayId === gatewayId);
  const formFields = selectedMethod?.formFields ?? [];
  const wallets = walletsQuery.data ?? [];

  const isFieldRequired = (f: DepositFormField) => f.required;

  const resetWizard = () => {
    setStep(0);
    setCountryIso3("");
    setGatewayId("");
    setWalletCurrencyCode("");
    setAmount("");
    setExtraData({});
    setFieldErrors({});
    setResult(null);
  };

  const initiateMutation = useMutation({
    mutationFn: () =>
      portalApi.post<DepositResult>("/portal/deposit/initiate", {
        gatewayId,
        walletCurrencyCode,
        amount,
        extraData: Object.keys(extraData).length > 0 ? extraData : undefined,
      }),
    onSuccess: (r) => setResult(r),
    onError: (e) => toast({ variant: "destructive", title: "Couldn't start deposit", description: e instanceof ApiError ? e.message : undefined }),
  });

  const goNext = () => {
    if (step === 0) {
      if (!countryIso3) {
        toast({ variant: "destructive", title: "Pick a country to continue" });
        return;
      }
      setStep(1);
      return;
    }
    if (step === 1) {
      if (!selectedMethod) {
        toast({ variant: "destructive", title: "Pick a payment method to continue" });
        return;
      }
      setStep(2);
      return;
    }
    submitDeposit();
  };

  const goBack = () => setStep((s) => Math.max(0, s - 1));

  const submitDeposit = () => {
    if (!selectedMethod) return;

    const errors: Record<string, string> = {};
    if (!walletCurrencyCode) errors._wallet = "Pick which wallet to credit";
    const amountNum = Number(amount);
    if (!amount || Number.isNaN(amountNum) || amountNum <= 0) {
      errors._amount = "Enter an amount";
    }
    for (const f of formFields) {
      const value = extraData[f.key]?.trim() ?? "";
      if (isFieldRequired(f) && !value) errors[f.key] = `${f.name} is required`;
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    initiateMutation.mutate();
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: "Copied to clipboard" });
    } catch {
      toast({ variant: "destructive", title: "Couldn't copy" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Banknote className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">Or deposit with a local payment method</CardTitle>
        </div>
        <CardDescription>Pick your country and pay via the local rail — bank transfer, CODI, DEBIN and more.</CardDescription>
      </CardHeader>
      <CardContent>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) resetWizard();
          }}
        >
          <Button size="sm" onClick={() => setOpen(true)}>
            <WalletIcon className="h-4 w-4" /> Deposit
          </Button>

          <DialogContent className="max-w-lg overflow-hidden p-0 sm:max-w-2xl">
            <DialogHeader className="border-b border-border px-6 py-5">
              <DialogTitle className="font-heading text-xl">Deposit funds</DialogTitle>
              {!result && (
                <div className="pt-2">
                  <Stepper steps={DEPOSIT_STEPS} current={step} />
                </div>
              )}
            </DialogHeader>

            <div className="max-h-[60vh] overflow-y-auto px-6 py-6">
              {result ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-success">
                    <Check className="h-4 w-4" /> Deposit initiated
                  </div>
                  <dl className="divide-y divide-border rounded-lg border border-border">
                    {result.localAmount && result.localCurrency && (
                      <Row label="Amount to pay" value={`${result.localAmount} ${result.localCurrency}`} />
                    )}
                    {result.receiveAmount && result.walletCurrencyCode && (
                      <Row label="You'll receive" value={`${result.receiveAmount} ${result.walletCurrencyCode}`} />
                    )}
                    {result.exchangeRate && <Row label="Exchange rate" value={result.exchangeRate} />}
                    {result.transactionFee && <Row label="Fee" value={result.transactionFee} />}
                    {result.estimatedDelivery && <Row label="Estimated delivery" value={result.estimatedDelivery} />}
                  </dl>
                  {result.depositUrl && (
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                      <span className="truncate font-mono">{result.depositUrl}</span>
                      <div className="flex shrink-0 gap-1">
                        <Button variant="ghost" size="icon" onClick={() => copy(result.depositUrl!)} aria-label="Copy link">
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" asChild>
                          <a href={result.depositUrl} target="_blank" rel="noreferrer" aria-label="Open link">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {step === 0 && (
                    <div className="space-y-5">
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Landmark className="h-4 w-4" /> Which country are you paying from?
                      </div>
                      <div className="space-y-1.5">
                        <Label>Country</Label>
                        <SearchableSelect
                          value={countryIso3}
                          onChange={(v) => {
                            setCountryIso3(v);
                            setGatewayId("");
                            setExtraData({});
                          }}
                          options={(countriesQuery.data ?? []).map((c) => ({ value: c.iso3, label: c.name }))}
                          placeholder="Select a country"
                          isLoading={countriesQuery.isLoading}
                        />
                      </div>
                    </div>
                  )}

                  {step === 1 && (
                    <div className="space-y-5">
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Banknote className="h-4 w-4" /> How do you want to pay from {selectedCountry?.name ?? "this country"}?
                      </div>

                      {methodsQuery.isLoading ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          {Array.from({ length: 4 }).map((_, i) => (
                            <Skeleton key={i} className="h-24" />
                          ))}
                        </div>
                      ) : (methodsQuery.data ?? []).length === 0 ? (
                        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                          No active deposit methods for this country yet.
                        </p>
                      ) : (
                        <div className="grid gap-3 sm:grid-cols-2">
                          {(methodsQuery.data ?? []).map((m) => {
                            const selected = m.gatewayId === gatewayId;
                            return (
                              <button
                                key={m.gatewayId}
                                type="button"
                                onClick={() => {
                                  setGatewayId(m.gatewayId);
                                  setExtraData({});
                                }}
                                className={cn(
                                  "relative flex flex-col gap-2 rounded-xl border p-4 text-left transition-colors",
                                  selected ? "border-primary bg-primary/5 shadow-soft" : "border-border hover:bg-muted/50",
                                )}
                              >
                                {selected && (
                                  <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                    <Check className="h-3 w-3" />
                                  </span>
                                )}
                                <div className="flex items-center gap-2">
                                  <Banknote className="h-4 w-4 shrink-0 text-muted-foreground" />
                                  <span className="pr-6 text-sm font-semibold leading-tight">{m.methodName}</span>
                                </div>
                                <Badge variant="outline" className="w-fit">
                                  {m.currency}
                                </Badge>
                                {(m.minimumDeposit || m.maximumDeposit) && (
                                  <p className="text-xs text-muted-foreground">
                                    {m.minimumDeposit ?? "0"}–{m.maximumDeposit ?? "∞"} {m.currency} per deposit
                                  </p>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {step === 2 && (
                    <div className="space-y-5">
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <WalletIcon className="h-4 w-4" /> {selectedMethod?.methodName} — amount & details
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label>Wallet to credit</Label>
                          <Select value={walletCurrencyCode} onValueChange={setWalletCurrencyCode}>
                            <SelectTrigger className={fieldErrors._wallet ? "border-destructive" : undefined}>
                              <SelectValue placeholder={walletsQuery.isLoading ? "Loading…" : "Select a wallet"} />
                            </SelectTrigger>
                            <SelectContent>
                              {wallets.map((w) => (
                                <SelectItem key={w.walletId} value={w.currencyCode}>
                                  {w.currencyCode}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {fieldErrors._wallet && <p className="text-xs text-destructive">{fieldErrors._wallet}</p>}
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="depositAmount">Amount ({selectedMethod?.currency})</Label>
                          <Input
                            id="depositAmount"
                            type="number"
                            min="0"
                            step="0.01"
                            value={amount}
                            className={fieldErrors._amount ? "border-destructive" : undefined}
                            onChange={(e) => setAmount(e.target.value)}
                          />
                          {fieldErrors._amount && <p className="text-xs text-destructive">{fieldErrors._amount}</p>}
                        </div>
                      </div>

                      {formFields.length > 0 && (
                        <div className="grid gap-x-4 gap-y-4 border-t border-border pt-4 sm:grid-cols-2">
                          {formFields.map((f) => (
                            <div key={f.key} className="space-y-1.5">
                              <Label>
                                {f.name}
                                {isFieldRequired(f) && <span className="text-destructive"> *</span>}
                              </Label>
                              {f.type === "select" ? (
                                <Select
                                  value={extraData[f.key] ?? ""}
                                  onValueChange={(v) => {
                                    setExtraData((d) => ({ ...d, [f.key]: v }));
                                    setFieldErrors((e) => ({ ...e, [f.key]: "" }));
                                  }}
                                >
                                  <SelectTrigger className={fieldErrors[f.key] ? "border-destructive" : undefined}>
                                    <SelectValue placeholder={`Select ${f.name.toLowerCase()}`} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {(f.options ?? []).map((o) => (
                                      <SelectItem key={o.value} value={o.value}>
                                        {o.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Input
                                  type={f.type === "email" ? "email" : "text"}
                                  value={extraData[f.key] ?? ""}
                                  className={fieldErrors[f.key] ? "border-destructive" : undefined}
                                  onChange={(e) => {
                                    setExtraData((d) => ({ ...d, [f.key]: e.target.value }));
                                    setFieldErrors((err) => ({ ...err, [f.key]: "" }));
                                  }}
                                />
                              )}
                              {fieldErrors[f.key] && <p className="text-xs text-destructive">{fieldErrors[f.key]}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {!result && (
              <div className="flex items-center justify-between border-t border-border bg-muted/20 px-6 py-4">
                <Button type="button" variant="ghost" onClick={goBack} disabled={step === 0 || initiateMutation.isPending}>
                  <ArrowLeft className="h-4 w-4" /> Back
                </Button>
                <Button type="button" onClick={goNext} disabled={initiateMutation.isPending}>
                  {initiateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : step === 2 ? (
                    "Start deposit"
                  ) : (
                    <>
                      Continue <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 px-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  );
}
