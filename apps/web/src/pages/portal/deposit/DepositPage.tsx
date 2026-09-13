import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { DepositCountry, DepositMethod, DepositFormField, DepositResult, DepositQuote, WalletBalance, CustomerTransactionListItem } from "@white-label/shared-types";
import { ArrowLeft, ArrowRight, Banknote, Check, Clock, Coins, Copy, ExternalLink, Landmark, Loader2, RefreshCw, Wallet as WalletIcon } from "lucide-react";
import { portalApi, ApiError } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Paginated } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchableSelect, Stepper } from "@/pages/portal/kyc/kycShared";
import { KycRequiredNotice } from "@/components/kyc/KycRequiredNotice";
import { TransactionCardRow } from "@/components/wallet/TransactionCardRow";

export default function DepositPage() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{t("deposit.title", "Deposit")}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {t("deposit.subtitle", "Fund your wallet with a one-time payment via a local rail, or crypto.")}
        </p>
      </div>

      <KycRequiredNotice service="DEPOSIT" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <NativeDepositCard />

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">{t("deposit.cryptoCard.title", "Or deposit crypto")}</CardTitle>
            </div>
            <CardDescription>
              {t("deposit.cryptoCard.description", "Deposit addresses and on-chain deposit history now live on their own page.")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link to="/portal/crypto">
                {t("deposit.cryptoCard.goToWallets", "Go to crypto wallets")} <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <RecentDepositsCard />
    </div>
  );
}

function RecentDepositsCard() {
  const { t } = useTranslation();
  const historyQuery = useQuery({
    queryKey: ["portal", "transactions", "recent-deposits"],
    queryFn: () => portalApi.get<Paginated<CustomerTransactionListItem>>("/portal/transactions", { type: "DEPOSIT", page: 1, pageSize: 5 }),
  });
  const items = historyQuery.data?.items ?? [];

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">{t("deposit.recent.title", "Recent deposits")}</CardTitle>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/portal/transactions">{t("deposit.recent.viewAll", "View all")}</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="max-w-full overflow-hidden p-0">
        {historyQuery.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">{t("deposit.recent.empty", "No deposits yet.")}</p>
        ) : (
          <div className="divide-y divide-border">
            {items.map((tx) => (
              <TransactionCardRow
                key={tx.id}
                date={tx.createdAt}
                description={tx.description ?? tx.type}
                type={tx.type}
                status={tx.status}
                direction={tx.direction}
                amountMinor={tx.amountMinor}
                currencyCode={tx.currencyCode ?? ""}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NativeDepositCard() {
  const { t } = useTranslation();
  const DEPOSIT_STEPS = [
    t("deposit.steps.country", "Country"),
    t("deposit.steps.method", "Method"),
    t("deposit.steps.amountDetails", "Amount & details"),
  ];
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
  // Rate-locked via POST /portal/deposit/quote (Yativo's /exchange-rate, method_type "payin") —
  // holds the payment link back from the customer until they've reviewed the locked rate/fee and
  // explicitly confirmed within the ~5 minute window, rather than surfacing it immediately.
  const [quote, setQuote] = useState<DepositQuote | null>(null);
  const [now, setNow] = useState(() => Date.now());

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
    setQuote(null);
  };

  // Ticks once a second only while a quote is actually being shown, so its countdown stays live.
  useEffect(() => {
    if (!quote || result) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [quote, result]);

  const quoteExpired = quote ? now >= new Date(quote.expiresAt).getTime() : false;
  const msRemaining = quote ? Math.max(0, new Date(quote.expiresAt).getTime() - now) : 0;

  const quoteMutation = useMutation({
    mutationFn: () =>
      portalApi.post<DepositQuote>("/portal/deposit/quote", {
        gatewayId,
        walletCurrencyCode,
        localCurrency: selectedMethod!.currency,
        amount,
      }),
    onSuccess: (q) => setQuote(q),
    onError: (e) =>
      toast({
        variant: "destructive",
        title: t("deposit.toast.quoteFailed", "Couldn't get a quote"),
        description: e instanceof ApiError ? e.message : undefined,
      }),
  });

  const initiateMutation = useMutation({
    mutationFn: () =>
      portalApi.post<DepositResult>("/portal/deposit/initiate", {
        gatewayId,
        walletCurrencyCode,
        quoteId: quote!.quoteId,
        extraData: Object.keys(extraData).length > 0 ? extraData : undefined,
      }),
    onSuccess: (r) => setResult(r),
    onError: (e) =>
      toast({
        variant: "destructive",
        title: t("deposit.toast.startFailed", "Couldn't start deposit"),
        description: e instanceof ApiError ? e.message : undefined,
      }),
  });

  const goNext = () => {
    if (step === 0) {
      if (!countryIso3) {
        toast({ variant: "destructive", title: t("deposit.toast.pickCountry", "Pick a country to continue") });
        return;
      }
      setStep(1);
      return;
    }
    if (step === 1) {
      if (!selectedMethod) {
        toast({ variant: "destructive", title: t("deposit.toast.pickMethod", "Pick a payment method to continue") });
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
    if (!walletCurrencyCode) errors._wallet = t("deposit.errors.pickWallet", "Pick which wallet to credit");
    const amountNum = Number(amount);
    if (!amount || Number.isNaN(amountNum) || amountNum <= 0) {
      errors._amount = t("deposit.errors.enterAmount", "Enter an amount");
    }
    for (const f of formFields) {
      const value = extraData[f.key]?.trim() ?? "";
      if (isFieldRequired(f) && !value) errors[f.key] = t("deposit.errors.fieldRequired", "{{field}} is required", { field: f.name });
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    quoteMutation.mutate();
  };

  const confirmDeposit = () => initiateMutation.mutate();
  const reQuote = () => quoteMutation.mutate();

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: t("deposit.toast.copied", "Copied to clipboard") });
    } catch {
      toast({ variant: "destructive", title: t("deposit.toast.copyFailed", "Couldn't copy") });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Banknote className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">{t("deposit.localCard.title", "Or deposit with a local payment method")}</CardTitle>
        </div>
        <CardDescription>
          {t("deposit.localCard.description", "Pick your country and pay via the local rail — bank transfer, CODI, DEBIN and more.")}
        </CardDescription>
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
            <WalletIcon className="h-4 w-4" /> {t("deposit.localCard.depositButton", "Deposit")}
          </Button>

          <DialogContent className="max-w-lg overflow-hidden p-0 sm:max-w-2xl">
            <DialogHeader className="border-b border-border px-6 py-5">
              <DialogTitle className="font-heading text-xl">{t("deposit.dialog.title", "Deposit funds")}</DialogTitle>
              {!result && !quote && (
                <div className="pt-2">
                  <Stepper steps={DEPOSIT_STEPS} current={step} />
                </div>
              )}
            </DialogHeader>

            <div className="max-h-[60vh] overflow-y-auto px-6 py-6">
              {result ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-success">
                    <Check className="h-4 w-4" />
                    {t("deposit.dialog.initiated", "Deposit initiated")}
                  </div>
                  <dl className="divide-y divide-border rounded-lg border border-border">
                    {result.localAmount && result.localCurrency && (
                      <Row label={t("deposit.dialog.amountToPay", "Amount to pay")} value={`${result.localAmount} ${result.localCurrency}`} />
                    )}
                    {(result.netReceiveAmount ?? result.receiveAmount) && result.walletCurrencyCode && (
                      <Row
                        label={t("deposit.dialog.youllReceive", "You'll receive")}
                        value={`${result.netReceiveAmount ?? result.receiveAmount} ${result.walletCurrencyCode}`}
                        warn={result.netReceiveAmount != null && Number(result.netReceiveAmount) < 0}
                      />
                    )}
                    {result.exchangeRate && <Row label={t("deposit.dialog.exchangeRate", "Exchange rate")} value={result.exchangeRate} />}
                    {(result.platformFee ?? result.transactionFee) && (
                      <Row
                        label={t("deposit.dialog.fee", "Fee")}
                        value={
                          result.platformFee
                            ? `${result.platformFee} ${result.walletCurrencyCode ?? ""}`.trim() +
                              (result.platformFeeLocal && result.localCurrency
                                ? ` (≈ ${result.platformFeeLocal} ${result.localCurrency})`
                                : "")
                            : `${result.transactionFee}`
                        }
                      />
                    )}
                    {result.estimatedDelivery && (
                      <Row label={t("deposit.dialog.estimatedDelivery", "Estimated delivery")} value={result.estimatedDelivery} />
                    )}
                  </dl>
                  {result.depositUrl && (
                    <div className="space-y-2">
                      <Button asChild className="w-full">
                        <a href={result.depositUrl} target="_blank" rel="noreferrer">
                          {t("deposit.dialog.goToCheckout", "Go to checkout")}
                        </a>
                      </Button>
                      <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                        <span className="truncate font-mono">{result.depositUrl}</span>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => copy(result.depositUrl!)}
                            aria-label={t("deposit.dialog.copyLinkAriaLabel", "Copy link")}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" asChild>
                            <a href={result.depositUrl} target="_blank" rel="noreferrer" aria-label={t("deposit.dialog.openLinkAriaLabel", "Open link")}>
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : quote ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Clock className="h-4 w-4" /> {t("deposit.dialog.reviewQuote", "Review your quote")}
                  </div>
                  <dl className="divide-y divide-border rounded-lg border border-border">
                    <Row label={t("deposit.dialog.amountToPay", "Amount to pay")} value={`${quote.localAmount} ${quote.localCurrency}`} />
                    <Row label={t("deposit.dialog.exchangeRate", "Exchange rate")} value={quote.rate} />
                    <Row
                      label={t("deposit.dialog.fee", "Fee")}
                      value={
                        quote.platformFee
                          ? `${quote.platformFee} ${quote.walletCurrencyCode}` + (quote.platformFeeLocal ? ` (≈ ${quote.platformFeeLocal} ${quote.localCurrency})` : "")
                          : `${quote.yativoFee} ${quote.walletCurrencyCode}`
                      }
                    />
                    {(quote.netReceiveAmount ?? quote.creditedAmount) && (
                      <Row
                        label={t("deposit.dialog.youllReceive", "You'll receive")}
                        value={`${quote.netReceiveAmount ?? quote.creditedAmount} ${quote.walletCurrencyCode}`}
                        warn={Number(quote.netReceiveAmount ?? quote.creditedAmount) < 0}
                      />
                    )}
                  </dl>
                  {Number(quote.netReceiveAmount ?? quote.creditedAmount) < 0 && (
                    <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-center text-xs font-medium text-destructive">
                      {t(
                        "deposit.dialog.negativeCredit",
                        "Fees exceed this deposit amount — you would receive less than nothing. Try a larger amount.",
                      )}
                    </p>
                  )}
                  <p className={cn("text-center text-xs", quoteExpired ? "font-medium text-destructive" : "text-muted-foreground")}>
                    {quoteExpired
                      ? t("deposit.dialog.quoteExpired", "This quote has expired — get a fresh rate to continue.")
                      : t("deposit.dialog.quoteExpiresIn", "Rate locked for {{seconds}}s.", { seconds: Math.ceil(msRemaining / 1000) })}
                  </p>
                </div>
              ) : (
                <>
                  {step === 0 && (
                    <div className="space-y-5">
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Landmark className="h-4 w-4" /> {t("deposit.step0.prompt", "Which country are you paying from?")}
                      </div>
                      <div className="space-y-1.5">
                        <Label>{t("deposit.step0.countryLabel", "Country")}</Label>
                        <SearchableSelect
                          value={countryIso3}
                          onChange={(v) => {
                            setCountryIso3(v);
                            setGatewayId("");
                            setExtraData({});
                          }}
                          options={(countriesQuery.data ?? []).map((c) => ({ value: c.iso3, label: c.name }))}
                          placeholder={t("deposit.step0.countryPlaceholder", "Select a country")}
                          isLoading={countriesQuery.isLoading}
                        />
                      </div>
                    </div>
                  )}

                  {step === 1 && (
                    <div className="space-y-5">
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Banknote className="h-4 w-4" />{" "}
                        {t("deposit.step1.prompt", "How do you want to pay from {{country}}?", {
                          country: selectedCountry?.name ?? t("deposit.step1.thisCountryFallback", "this country"),
                        })}
                      </div>

                      {methodsQuery.isLoading ? (
                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                          {Array.from({ length: 4 }).map((_, i) => (
                            <Skeleton key={i} className="h-24" />
                          ))}
                        </div>
                      ) : (methodsQuery.data ?? []).length === 0 ? (
                        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                          {t("deposit.step1.noMethods", "No active deposit methods for this country yet.")}
                        </p>
                      ) : (
                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
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
                                    {t("deposit.step1.methodRange", "{{min}}–{{max}} {{currency}} per deposit", {
                                      min: m.minimumDeposit ?? "0",
                                      max: m.maximumDeposit ?? "∞",
                                      currency: m.currency,
                                    })}
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
                        <WalletIcon className="h-4 w-4" />{" "}
                        {t("deposit.step2.prompt", "{{method}} — amount & details", { method: selectedMethod?.methodName ?? "" })}
                      </div>

                      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label>{t("deposit.step2.walletLabel", "Wallet to credit")}</Label>
                          <Select value={walletCurrencyCode} onValueChange={setWalletCurrencyCode}>
                            <SelectTrigger className={fieldErrors._wallet ? "border-destructive" : undefined}>
                              <SelectValue
                                placeholder={
                                  walletsQuery.isLoading
                                    ? t("deposit.step2.walletLoading", "Loading…")
                                    : t("deposit.step2.walletPlaceholder", "Select a wallet")
                                }
                              />
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
                          <Label htmlFor="depositAmount">
                            {t("deposit.step2.amountLabel", "Amount ({{currency}})", { currency: selectedMethod?.currency })}
                          </Label>
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
                        <div className="grid grid-cols-1 gap-x-4 gap-y-4 border-t border-border pt-4 lg:grid-cols-2">
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
                                    <SelectValue
                                      placeholder={t("deposit.step2.selectFieldPlaceholder", "Select {{field}}", { field: f.name.toLowerCase() })}
                                    />
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

            {!result && !quote && (
              <div className="flex items-center justify-between border-t border-border bg-muted/20 px-6 py-4">
                <Button type="button" variant="ghost" onClick={goBack} disabled={step === 0 || quoteMutation.isPending}>
                  <ArrowLeft className="h-4 w-4" /> {t("deposit.buttons.back", "Back")}
                </Button>
                <Button type="button" onClick={goNext} disabled={quoteMutation.isPending}>
                  {quoteMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : step === 2 ? (
                    t("deposit.buttons.getQuote", "Get quote")
                  ) : (
                    <>
                      {t("deposit.buttons.continue", "Continue")} <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            )}

            {quote && !result && (
              <div className="flex items-center justify-between border-t border-border bg-muted/20 px-6 py-4">
                <Button type="button" variant="ghost" onClick={resetWizard}>
                  {t("deposit.buttons.startOver", "Start over")}
                </Button>
                {quoteExpired ? (
                  <Button type="button" onClick={reQuote} disabled={quoteMutation.isPending}>
                    {quoteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><RefreshCw className="h-4 w-4" /> {t("deposit.buttons.requote", "Re-quote")}</>}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={confirmDeposit}
                    disabled={initiateMutation.isPending || (!!quote && Number(quote.netReceiveAmount ?? quote.creditedAmount) < 0)}
                  >
                    {initiateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("deposit.buttons.confirmQuote", "Confirm & get payment link")}
                  </Button>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5 px-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("font-mono", warn && "font-semibold text-destructive")}>{value}</dd>
    </div>
  );
}
