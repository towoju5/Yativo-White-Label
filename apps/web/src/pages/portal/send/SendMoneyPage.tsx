import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  formatMinorAmount,
  type Beneficiary,
  type BeneficiaryFormField,
  type CreateBeneficiaryInput,
  type CreatePayoutInput,
  type Payout,
  type PayoutCountry,
  type PayoutMethod,
  type PayoutStatus,
  type Quote,
  type WalletBalance,
} from "@white-label/shared-types";
import { ArrowLeft, ArrowRight, Banknote, Check, CheckCircle2, Landmark, Loader2, RefreshCw, User, Users } from "lucide-react";
import { portalApi, ApiError } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect, Stepper } from "@/pages/portal/kyc/kycShared";

const QUOTE_LIFETIME_MS = 5 * 60_000;

export default function SendMoneyPage() {
  const { t } = useTranslation();
  const NEW_STEPS = [
    t("send.steps.recipient", "Recipient"),
    t("send.steps.method", "Method"),
    t("send.steps.details", "Details"),
    t("send.steps.amount", "Amount"),
    t("send.steps.review", "Review"),
  ];
  const SAVED_STEPS = [t("send.steps.beneficiary", "Beneficiary"), t("send.steps.amount", "Amount"), t("send.steps.review", "Review")];
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [useExisting, setUseExisting] = useState(false);
  const [step, setStep] = useState(0);

  // "New recipient" sub-wizard state
  const [name, setName] = useState("");
  const [countryIso3, setCountryIso3] = useState("");
  const [gatewayId, setGatewayId] = useState("");
  const [paymentData, setPaymentData] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // "Saved beneficiary" sub-wizard state
  const [selectedBeneficiaryId, setSelectedBeneficiaryId] = useState("");

  // Shared amount/quote/payout state
  const [activeBeneficiary, setActiveBeneficiary] = useState<{ id: string; name: string; currency?: string } | null>(null);
  const [debitCurrency, setDebitCurrency] = useState("USD");
  const [sendAmount, setSendAmount] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [submittedPayout, setSubmittedPayout] = useState<Payout | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const beneficiariesQuery = useQuery({
    queryKey: ["portal", "beneficiaries"],
    queryFn: () => portalApi.get<Beneficiary[]>("/portal/beneficiaries"),
  });
  const walletsQuery = useQuery({
    queryKey: ["portal", "wallets"],
    queryFn: () => portalApi.get<WalletBalance[]>("/portal/wallets"),
  });

  const countriesQuery = useQuery({
    queryKey: ["portal", "beneficiaries", "countries"],
    queryFn: () => portalApi.get<PayoutCountry[]>("/portal/beneficiaries/countries"),
    enabled: !useExisting,
  });
  const payoutMethodsQuery = useQuery({
    queryKey: ["portal", "beneficiaries", "payout-methods", countryIso3],
    queryFn: () => portalApi.get<PayoutMethod[]>("/portal/beneficiaries/payout-methods", { country: countryIso3 }),
    enabled: !useExisting && !!countryIso3,
  });
  const formQuery = useQuery({
    queryKey: ["portal", "beneficiaries", "form", gatewayId],
    queryFn: () => portalApi.get<BeneficiaryFormField[]>(`/portal/beneficiaries/form/${gatewayId}`),
    enabled: !useExisting && !!gatewayId,
  });

  const selectedCountry = countriesQuery.data?.find((c) => c.iso3 === countryIso3);
  const selectedMethod = payoutMethodsQuery.data?.find((m) => m.gatewayId === gatewayId);
  const isFieldVisible = (f: BeneficiaryFormField) => !f.when || paymentData[f.when.key] === f.when.value;
  const visibleFields = (formQuery.data ?? []).filter(isFieldVisible);
  const renderableFields = visibleFields.filter((f) => f.type !== "hidden");
  const isFieldRequired = (f: BeneficiaryFormField) => f.required || (f.min ?? 0) > 0;

  useEffect(() => {
    const defaults = Object.fromEntries(
      (formQuery.data ?? []).filter((f) => f.type === "hidden" && f.defaultValue !== undefined).map((f) => [f.key, f.defaultValue!]),
    );
    if (Object.keys(defaults).length > 0) setPaymentData((d) => ({ ...defaults, ...d }));
  }, [formQuery.data]);

  useEffect(() => {
    if (step !== steps.length - 1 || !quote) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, quote]);

  const createBeneficiaryMutation = useMutation({
    mutationFn: (input: CreateBeneficiaryInput) => portalApi.post<Beneficiary>("/portal/beneficiaries", input),
    onSuccess: (b) => {
      queryClient.invalidateQueries({ queryKey: ["portal", "beneficiaries"] });
      const currency = typeof b.details.currency === "string" ? b.details.currency : undefined;
      setActiveBeneficiary({ id: b.id, name: b.name, currency });
      setStep((s) => s + 1);
    },
    onError: (e) =>
      toast({
        variant: "destructive",
        title: t("send.toast.saveRecipientFailed", "Couldn't save recipient"),
        description: e instanceof ApiError ? e.message : undefined,
      }),
  });

  const quoteMutation = useMutation({
    mutationFn: () =>
      portalApi.post<Quote>("/portal/quotes", { beneficiaryId: activeBeneficiary!.id, debitCurrency, sendAmount }),
    onSuccess: (q) => {
      setQuote(q);
      setStep((s) => s + 1);
    },
    onError: (e) =>
      toast({
        variant: "destructive",
        title: t("send.toast.quoteFailed", "Could not get a quote"),
        description: e instanceof ApiError ? e.message : t("send.toast.tryAgain", "Try again."),
      }),
  });

  const payoutMutation = useMutation({
    mutationFn: (input: CreatePayoutInput) => portalApi.post<Payout>("/portal/payouts", input),
    onSuccess: (payout) => {
      toast({ title: t("send.toast.payoutSubmitted", "Payout submitted"), description: t("send.toast.payoutSubmittedDescription", "We'll notify you once it settles.") });
      queryClient.invalidateQueries({ queryKey: ["portal", "wallets"] });
      setSubmittedPayout(payout);
    },
    onError: (e) =>
      toast({
        variant: "destructive",
        title: t("send.toast.payoutFailed", "Payout failed"),
        description: e instanceof ApiError ? e.message : t("send.toast.tryAgain", "Try again."),
      }),
  });

  const statusQuery = useQuery({
    queryKey: ["portal", "payouts", submittedPayout?.id, "status"],
    queryFn: () => portalApi.get<PayoutStatus>(`/portal/payouts/${submittedPayout!.id}/status`),
    enabled: !!submittedPayout,
    refetchInterval: (q) => (q.state.data?.status === "pending" ? 5000 : false),
  });

  const steps = useExisting ? SAVED_STEPS : NEW_STEPS;
  const amountStepIndex = steps.length - 2;
  const reviewStepIndex = steps.length - 1;

  const resetAll = () => {
    setStep(0);
    setName("");
    setCountryIso3("");
    setGatewayId("");
    setPaymentData({});
    setFieldErrors({});
    setSelectedBeneficiaryId("");
    setActiveBeneficiary(null);
    setDebitCurrency("USD");
    setSendAmount("");
    setAmountError(null);
    setQuote(null);
    setSubmittedPayout(null);
  };

  const quoteExpired = quote ? now >= new Date(quote.expiresAt).getTime() : false;
  const msRemaining = quote ? Math.max(0, new Date(quote.expiresAt).getTime() - now) : 0;

  const goBack = () => setStep((s) => Math.max(0, s - 1));

  const submitRecipientDetails = () => {
    if (!selectedMethod) return;
    const errors: Record<string, string> = {};
    for (const f of visibleFields) {
      const value = paymentData[f.key]?.trim() ?? "";
      if (isFieldRequired(f) && !value) errors[f.key] = t("send.errors.fieldRequired", "{{field}} is required", { field: f.name });
      else if (value && f.min !== undefined && value.length < f.min)
        errors[f.key] = t("send.errors.minLength", "At least {{min}} characters", { min: f.min });
      else if (value && f.max !== undefined && value.length > f.max)
        errors[f.key] = t("send.errors.maxLength", "At most {{max}} characters", { max: f.max });
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const submittedPaymentData = Object.fromEntries(visibleFields.map((f) => [f.key, paymentData[f.key] ?? ""]));
    createBeneficiaryMutation.mutate({
      name,
      type: "BANK_ACCOUNT",
      details: { gatewayId: Number(gatewayId), currency: selectedMethod.currency, paymentData: submittedPaymentData },
    });
  };

  const submitAmount = () => {
    setAmountError(null);
    const n = Number(sendAmount);
    if (!sendAmount || Number.isNaN(n) || n <= 0) {
      setAmountError(t("send.errors.enterAmount", "Enter an amount"));
      return;
    }
    quoteMutation.mutate();
  };

  const goNext = () => {
    if (!useExisting) {
      if (step === 0) {
        if (!name.trim() || !countryIso3) {
          toast({ variant: "destructive", title: t("send.toast.enterNameAndCountry", "Enter a name and pick a country to continue") });
          return;
        }
        setStep(1);
        return;
      }
      if (step === 1) {
        if (!selectedMethod) {
          toast({ variant: "destructive", title: t("send.toast.pickMethod", "Pick a payout method to continue") });
          return;
        }
        setStep(2);
        return;
      }
      if (step === 2) {
        submitRecipientDetails();
        return;
      }
    } else {
      if (step === 0) {
        if (!selectedBeneficiaryId) {
          toast({ variant: "destructive", title: t("send.toast.pickBeneficiary", "Pick a beneficiary to continue") });
          return;
        }
        const b = beneficiariesQuery.data?.find((x) => x.id === selectedBeneficiaryId);
        if (b) {
          const currency = typeof b.details.currency === "string" ? b.details.currency : undefined;
          setActiveBeneficiary({ id: b.id, name: b.name, currency });
        }
        setStep(1);
        return;
      }
    }
    if (step === amountStepIndex) {
      submitAmount();
      return;
    }
  };

  const reQuote = () => quoteMutation.mutate();

  const confirmPayout = () => {
    if (!quote || quoteExpired || !activeBeneficiary) return;
    payoutMutation.mutate({
      beneficiaryId: activeBeneficiary.id,
      currencyCode: quote.debitCurrency,
      // debitAmountMinor is the quote's fee-inclusive debit-side figure (what actually gets
      // charged) — that's what the payout submission needs, not the sendAmount the customer
      // originally typed (which was pre-fee).
      amountMinor: quote.debitAmountMinor,
      quoteId: quote.quoteId,
    });
  };

  const isPending = createBeneficiaryMutation.isPending || quoteMutation.isPending;
  const busy = beneficiariesQuery.isLoading;

  if (submittedPayout) {
    return (
      <div className="mx-auto max-w-lg">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <CheckCircle2 className="h-10 w-10 text-success" />
            <p className="font-heading text-lg font-semibold">{t("send.result.payoutSubmitted", "Payout submitted")}</p>
            <p className="text-sm text-muted-foreground">
              {t("send.result.statusLabel", "Status:")} <span className="font-medium">{statusQuery.data?.status ?? "pending"}</span>
              {statusQuery.isFetching && ` ${t("send.result.refreshing", "(refreshing…)")}`}
            </p>
            {submittedPayout.yativoPayoutId && (
              <p className="text-xs text-muted-foreground">
                {t("send.result.payoutId", "Payout ID: {{id}}", { id: submittedPayout.yativoPayoutId })}
              </p>
            )}
            <div className="mt-2 flex gap-2">
              <Button variant="outline" onClick={() => navigate("/portal/wallets")}>
                {t("send.result.viewWallets", "View wallets")}
              </Button>
              <Button onClick={resetAll}>{t("send.result.sendAnother", "Send another")}</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{t("send.title", "Send money")}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {t("send.subtitle", "Pick a country and how they get paid, then confirm the amount.")}
        </p>
      </div>

      {step === 0 && (
        <div className="flex gap-2 rounded-lg border border-border bg-muted/30 p-1">
          <button
            type="button"
            onClick={() => {
              setUseExisting(false);
              setStep(0);
            }}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              !useExisting ? "bg-background shadow-soft" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t("send.toggle.newRecipient", "New recipient")}
          </button>
          <button
            type="button"
            onClick={() => {
              setUseExisting(true);
              setStep(0);
            }}
            disabled={!beneficiariesQuery.data || beneficiariesQuery.data.length === 0}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50",
              useExisting ? "bg-background shadow-soft" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t("send.toggle.savedBeneficiary", "Saved beneficiary")}
          </button>
        </div>
      )}

      <Card>
        <CardHeader>
          <Stepper steps={steps} current={step} />
        </CardHeader>
        <CardContent className="space-y-5">
          {!useExisting && step === 0 && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <User className="h-4 w-4" /> {t("send.step0.prompt", "Who are you sending to?")}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="recipientName">{t("send.step0.recipientNameLabel", "Recipient name")}</Label>
                <Input
                  id="recipientName"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("send.step0.recipientNamePlaceholder", "Jane Doe")}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("send.step0.countryLabel", "Country")}</Label>
                <SearchableSelect
                  value={countryIso3}
                  onChange={(v) => {
                    setCountryIso3(v);
                    setGatewayId("");
                    setPaymentData({});
                  }}
                  options={(countriesQuery.data ?? []).map((c) => ({ value: c.iso3, label: c.name }))}
                  placeholder={t("send.step0.countryPlaceholder", "Select a country")}
                  isLoading={countriesQuery.isLoading}
                />
              </div>
            </div>
          )}

          {!useExisting && step === 1 && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Landmark className="h-4 w-4" />{" "}
                {t("send.step1.prompt", "How should {{recipient}} in {{country}} get paid?", {
                  recipient: name || t("send.step1.recipientFallback", "this recipient"),
                  country: selectedCountry?.name ?? t("send.step1.countryFallback", "this country"),
                })}
              </div>
              {payoutMethodsQuery.isLoading ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-24" />
                  ))}
                </div>
              ) : (payoutMethodsQuery.data ?? []).length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  {t("send.step1.noMethods", "No active payout methods for this country yet.")}
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {(payoutMethodsQuery.data ?? []).map((m) => {
                    const selected = m.gatewayId === gatewayId;
                    return (
                      <button
                        key={m.gatewayId}
                        type="button"
                        onClick={() => {
                          setGatewayId(m.gatewayId);
                          setPaymentData({});
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
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline">{m.currency}</Badge>
                          {m.estimatedDelivery && <span className="text-xs text-muted-foreground">{m.estimatedDelivery}</span>}
                        </div>
                        {(m.minimumWithdrawal || m.maximumWithdrawal) && (
                          <p className="text-xs text-muted-foreground">
                            {t("send.step1.methodRange", "{{min}}–{{max}} {{currency}} per transfer", {
                              min: m.minimumWithdrawal ?? "0",
                              max: m.maximumWithdrawal ?? "∞",
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

          {!useExisting && step === 2 && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Landmark className="h-4 w-4" />{" "}
                {t("send.step2.prompt", "{{method}} details", { method: selectedMethod?.methodName ?? "" })}
              </div>
              {formQuery.isLoading ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-16" />
                  ))}
                </div>
              ) : renderableFields.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  {t("send.step2.noDetailsNeeded", "This payout method doesn't need any extra details.")}
                </p>
              ) : (
                <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
                  {renderableFields.map((f) => (
                    <div key={f.key} className="space-y-1.5">
                      <Label>
                        {f.name}
                        {isFieldRequired(f) && <span className="text-destructive"> *</span>}
                      </Label>
                      {f.type === "select" ? (
                        <Select
                          value={paymentData[f.key] ?? ""}
                          onValueChange={(v) => {
                            setPaymentData((d) => ({ ...d, [f.key]: v }));
                            setFieldErrors((e) => ({ ...e, [f.key]: "" }));
                          }}
                        >
                          <SelectTrigger className={fieldErrors[f.key] ? "border-destructive" : undefined}>
                            <SelectValue
                              placeholder={t("send.step2.selectFieldPlaceholder", "Select {{field}}", { field: f.name.toLowerCase() })}
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
                          value={paymentData[f.key] ?? ""}
                          maxLength={f.max}
                          className={fieldErrors[f.key] ? "border-destructive" : undefined}
                          onChange={(e) => {
                            setPaymentData((d) => ({ ...d, [f.key]: e.target.value }));
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

          {useExisting && step === 0 && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Users className="h-4 w-4" /> {t("send.savedStep0.prompt", "Who are you sending to?")}
              </div>
              {busy ? (
                <Skeleton className="h-10" />
              ) : (
                <Select value={selectedBeneficiaryId} onValueChange={setSelectedBeneficiaryId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("send.savedStep0.beneficiaryPlaceholder", "Select a beneficiary")} />
                  </SelectTrigger>
                  <SelectContent>
                    {(beneficiariesQuery.data ?? []).map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {step === amountStepIndex && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Banknote className="h-4 w-4" />{" "}
                {activeBeneficiary?.name
                  ? t("send.amountStep.promptTo", "Amount to send to {{name}}", { name: activeBeneficiary.name })
                  : t("send.amountStep.prompt", "Amount to send")}
              </div>
              <div className="space-y-1.5">
                <Label>{t("send.amountStep.debitWalletLabel", "Debit from wallet")}</Label>
                <Select value={debitCurrency} onValueChange={setDebitCurrency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(walletsQuery.data ?? [{ currencyCode: "USD" }]).map((w) => (
                      <SelectItem key={w.currencyCode} value={w.currencyCode}>
                        {w.currencyCode}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sendAmount">
                  {t("send.amountStep.amountLabel", "Amount to send ({{currency}})", { currency: debitCurrency })}
                </Label>
                <Input
                  id="sendAmount"
                  placeholder={t("send.amountStep.amountPlaceholder", "100.00")}
                  value={sendAmount}
                  className={amountError ? "border-destructive" : undefined}
                  onChange={(e) => {
                    setSendAmount(e.target.value);
                    setAmountError(null);
                  }}
                />
                {amountError && <p className="text-xs text-destructive">{amountError}</p>}
                <p className="text-xs text-muted-foreground">
                  {activeBeneficiary?.currency
                    ? t("send.amountStep.willReceiveWithCurrency", "We'll show exactly how much {{recipient}} receives in {{currency}} before you confirm.", {
                        recipient: activeBeneficiary?.name ?? t("send.amountStep.recipientFallback", "the recipient"),
                        currency: activeBeneficiary.currency,
                      })
                    : t("send.amountStep.willReceive", "We'll show exactly how much {{recipient}} receives before you confirm.", {
                        recipient: activeBeneficiary?.name ?? t("send.amountStep.recipientFallback", "the recipient"),
                      })}
                </p>
              </div>
            </div>
          )}

          {step === reviewStepIndex && quote && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                {quoteExpired
                  ? t("send.review.expired", "This quote has expired — get a fresh one to continue.")
                  : t("send.review.expiresIn", "Quote expires in {{seconds}}s.", { seconds: Math.ceil(msRemaining / 1000) })}
              </div>
              <dl className="space-y-2.5 rounded-lg border border-border bg-muted/40 p-4 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t("send.review.toLabel", "To")}</dt>
                  <dd className="font-medium">{activeBeneficiary?.name}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t("send.review.rateLabel", "Rate")}</dt>
                  <dd className="font-mono">
                    1 {quote.debitCurrency} = {quote.rate} {quote.payoutCurrency}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t("send.review.totalChargedLabel", "Total charged")}</dt>
                  <dd className="font-mono font-medium">
                    {formatMinorAmount(quote.debitAmountMinor, quote.debitDecimals)} {quote.debitCurrency}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t("send.review.recipientGetsLabel", "Recipient gets")}</dt>
                  <dd className="font-mono font-medium">
                    {formatMinorAmount(quote.receiveAmountMinor, quote.payoutDecimals)} {quote.payoutCurrency}
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </CardContent>

        <div className="flex items-center justify-between border-t border-border bg-muted/20 px-6 py-4">
          <Button type="button" variant="ghost" onClick={goBack} disabled={step === 0 || isPending || payoutMutation.isPending}>
            <ArrowLeft className="h-4 w-4" /> {t("send.buttons.back", "Back")}
          </Button>
          {step === reviewStepIndex ? (
            quoteExpired ? (
              <Button onClick={reQuote} disabled={quoteMutation.isPending}>
                {quoteMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" /> {t("send.buttons.requote", "Re-quote")}
                  </>
                )}
              </Button>
            ) : (
              <Button onClick={confirmPayout} disabled={payoutMutation.isPending}>
                {payoutMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("send.buttons.confirmAndSend", "Confirm & send")}
              </Button>
            )
          ) : (
            <Button onClick={goNext} disabled={isPending}>
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : step === amountStepIndex ? (
                t("send.buttons.getQuote", "Get quote")
              ) : (
                <>
                  {t("send.buttons.continue", "Continue")} <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
