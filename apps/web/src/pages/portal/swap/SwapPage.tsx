import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCurrencyAmount, type Swap, type SwapOptions, type SwapQuote, type WalletBalance } from "@white-label/shared-types";
import { ArrowDownUp, ArrowLeft, CheckCircle2, Clock, Repeat, RefreshCw } from "lucide-react";
import { portalApi, ApiError } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { cn, majorToMinorString } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Step = "amount" | "review" | "done";
type Money = { decimals: number; symbol: string | null };

/** Display-only estimate before a real quote exists — the quote's exact BigInt figure is what's actually charged. */
function estimateMajor(amount: string, rate: number, decimals: number): string | null {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return null;
  return (Math.floor(n * rate * 10 ** decimals) / 10 ** decimals).toFixed(decimals);
}

function useSecondsLeft(expiresAt: string | undefined) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return expiresAt ? Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000)) : 0;
}

export default function SwapPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{t("swap.title", "Swap balance")}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{t("swap.subtitle", "Convert money between your wallets at the live exchange rate.")}</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <SwapForm />
        <RecentSwaps />
      </div>
    </div>
  );
}

function SwapForm() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("amount");
  const [fromCurrency, setFromCurrency] = useState("");
  const [toCurrency, setToCurrency] = useState("");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [result, setResult] = useState<Swap | null>(null);

  const walletsQuery = useQuery({ queryKey: ["portal", "wallets"], queryFn: () => portalApi.get<WalletBalance[]>("/portal/wallets") });
  const optionsQuery = useQuery({
    queryKey: ["portal", "swaps", "options"],
    queryFn: () => portalApi.get<SwapOptions>("/portal/swaps/options"),
    // Rates refresh about once a minute upstream.
    refetchInterval: 60_000,
  });
  const wallets = walletsQuery.data ?? [];
  const options = optionsQuery.data;

  const hasRate = (code: string) => !!options && (code === options.rates.base || options.rates.rates[code] != null);
  const fromWallets = wallets.filter((w) => hasRate(w.currencyCode));
  const toCurrencies = (options?.currencies ?? []).filter((c) => c.code !== fromCurrency);
  const fromWallet = wallets.find((w) => w.currencyCode === fromCurrency) ?? null;

  const moneyOf = (code: string): Money | null => {
    const w = wallets.find((x) => x.currencyCode === code);
    if (w) return w;
    return options?.currencies.find((c) => c.code === code) ?? null;
  };
  const fmt = (minor: string, code: string) => {
    const m = moneyOf(code);
    return m ? formatCurrencyAmount(minor, m.decimals, m.symbol, code) : `${minor} ${code}`;
  };

  // Default to the largest-balance wallet, and the first other currency on offer.
  useEffect(() => {
    if (!fromCurrency && fromWallets.length > 0) {
      setFromCurrency([...fromWallets].sort((a, b) => Number(BigInt(b.availableMinor) - BigInt(a.availableMinor)))[0]!.currencyCode);
    }
  }, [fromWallets, fromCurrency]);
  useEffect(() => {
    if (fromCurrency && (!toCurrency || toCurrency === fromCurrency) && toCurrencies.length > 0) setToCurrency(toCurrencies[0]!.code);
  }, [fromCurrency, toCurrency, toCurrencies]);

  const indicativeRate = useMemo(() => {
    if (!options || !fromCurrency || !toCurrency) return null;
    const r = options.rates;
    const from = fromCurrency === r.base ? 1 : r.rates[fromCurrency];
    const to = toCurrency === r.base ? 1 : r.rates[toCurrency];
    return from && to ? to / from : null;
  }, [options, fromCurrency, toCurrency]);

  const amountMinor = fromWallet ? majorToMinorString(amount, fromWallet.decimals) : null;
  const insufficient = !!(fromWallet && amountMinor && BigInt(amountMinor) > BigInt(fromWallet.availableMinor));
  const toMoney = moneyOf(toCurrency);
  const estimate = indicativeRate && toMoney ? estimateMajor(amount, indicativeRate, toMoney.decimals) : null;
  const canFlip = !!toCurrency && fromWallets.some((w) => w.currencyCode === toCurrency);

  const quoteMutation = useMutation({
    mutationFn: () => portalApi.post<SwapQuote>("/portal/swaps/quote", { fromCurrency, toCurrency, amountMinor }),
    onSuccess: (q) => {
      setQuote(q);
      setStep("review");
    },
    onError: (e) => toast({ variant: "destructive", title: t("swap.toast.quoteFailed", "Couldn't get a quote"), description: e instanceof ApiError ? e.message : undefined }),
  });

  const swapMutation = useMutation({
    mutationFn: () => portalApi.post<Swap>("/portal/swaps", { quoteId: quote!.quoteId }),
    onSuccess: (s) => {
      setResult(s);
      setStep("done");
      queryClient.invalidateQueries({ queryKey: ["portal", "wallets"] });
      queryClient.invalidateQueries({ queryKey: ["portal", "swaps"] });
      queryClient.invalidateQueries({ queryKey: ["portal", "transactions"] });
    },
    onError: (e) => {
      const code = e instanceof ApiError && e.body && typeof e.body === "object" ? (e.body as { code?: string }).code : undefined;
      if (code === "QUOTE_EXPIRED") setQuote((q) => (q ? { ...q, expiresAt: new Date(0).toISOString() } : q));
      toast({ variant: "destructive", title: t("swap.toast.swapFailed", "Swap failed"), description: e instanceof ApiError ? e.message : undefined });
    },
  });

  const secondsLeft = useSecondsLeft(step === "review" ? quote?.expiresAt : undefined);
  const expired = step === "review" && secondsLeft === 0;
  const quoteExceeds = !!(fromWallet && quote && BigInt(quote.totalDebitMinor) > BigInt(fromWallet.availableMinor));

  const reset = () => {
    setStep("amount");
    setAmount("");
    setQuote(null);
    setResult(null);
  };

  if (step === "done" && result) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/15 text-success">
            <CheckCircle2 className="h-9 w-9" />
          </div>
          <div>
            <p className="font-heading text-3xl font-semibold tracking-tight">{fmt(result.toAmountMinor, result.toCurrency)}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("swap.done.from", "converted from {{amount}}", { amount: fmt(result.fromAmountMinor, result.fromCurrency) })}
            </p>
          </div>
          {result.feeMinor !== "0" && <p className="text-xs text-muted-foreground">{t("swap.done.fee", "Fee {{fee}}", { fee: fmt(result.feeMinor, result.fromCurrency) })}</p>}
          <p className="font-mono text-xs text-muted-foreground">{t("swap.done.reference", "Ref {{id}}", { id: result.transactionId })}</p>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/portal/wallets">{t("swap.done.viewWallets", "View wallets")}</Link>
            </Button>
            <Button onClick={reset}>{t("swap.done.again", "Swap again")}</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (walletsQuery.isLoading || optionsQuery.isLoading) {
    return <Skeleton className="h-80" />;
  }

  if (optionsQuery.isError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {optionsQuery.error instanceof ApiError ? optionsQuery.error.message : t("swap.ratesUnavailable", "Exchange rates are temporarily unavailable.")}
          </p>
          <Button variant="outline" onClick={() => optionsQuery.refetch()}>
            <RefreshCw className="h-4 w-4" /> {t("swap.retry", "Try again")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (fromWallets.length === 0 || (options?.currencies.length ?? 0) < 2) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          {t("swap.nothingToSwap", "There's nothing to swap yet — you need a funded wallet and at least one other currency on offer.")}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-5 sm:p-6">
        {step === "amount" ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (amountMinor && !insufficient && toCurrency) quoteMutation.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="swap-amount">{t("swap.youConvert", "You convert")}</Label>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem]">
                <Input
                  id="swap-amount"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                  className="font-mono text-lg"
                  autoFocus
                />
                <Select value={fromCurrency} onValueChange={setFromCurrency}>
                  <SelectTrigger aria-label={t("swap.fromWallet", "From wallet")}>
                    <SelectValue placeholder={t("swap.select", "Select")} />
                  </SelectTrigger>
                  <SelectContent>
                    {fromWallets.map((w) => (
                      <SelectItem key={w.currencyCode} value={w.currencyCode}>
                        {w.currencyCode}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {fromWallet && (
                <div className="flex items-center justify-between text-xs">
                  <span className={cn(insufficient ? "text-destructive" : "text-muted-foreground")}>
                    {t("swap.available", "Available: {{amount}}", { amount: fmt(fromWallet.availableMinor, fromWallet.currencyCode) })}
                    {insufficient && ` · ${t("swap.insufficient", "Insufficient balance")}`}
                  </span>
                  <button
                    type="button"
                    className="font-medium text-primary hover:underline"
                    onClick={() => setAmount(formatCurrencyAmount(fromWallet.availableMinor, fromWallet.decimals, null, "").replace(/[^\d.]/g, ""))}
                  >
                    {t("swap.max", "Max")}
                  </button>
                </div>
              )}
            </div>

            <div className="flex justify-center">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="rounded-full"
                disabled={!canFlip}
                title={canFlip ? t("swap.flip", "Swap direction") : t("swap.flipUnavailable", "You don't hold a balance in this currency yet")}
                aria-label={t("swap.flip", "Swap direction")}
                onClick={() => {
                  setFromCurrency(toCurrency);
                  setToCurrency(fromCurrency);
                }}
              >
                <ArrowDownUp className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-1.5">
              <Label>{t("swap.youReceive", "You receive (estimate)")}</Label>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem]">
                <div className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 font-mono text-lg text-muted-foreground">{estimate ?? "0.00"}</div>
                <Select value={toCurrency} onValueChange={setToCurrency}>
                  <SelectTrigger aria-label={t("swap.toCurrency", "To currency")}>
                    <SelectValue placeholder={t("swap.select", "Select")} />
                  </SelectTrigger>
                  <SelectContent>
                    {toCurrencies.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {indicativeRate && options && (
              <p className="text-xs text-muted-foreground">
                {t("swap.indicativeRate", "1 {{from}} ≈ {{rate}} {{to}}", { from: fromCurrency, rate: Number(indicativeRate.toPrecision(6)), to: toCurrency })}
                {" · "}
                {t("swap.ratesUpdated", "updated {{time}}", { time: new Date(options.rates.updatedAt).toLocaleTimeString() })}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={!amountMinor || insufficient || !toCurrency || !indicativeRate} loading={quoteMutation.isPending}>
              {t("swap.getQuote", "Review swap")}
            </Button>
          </form>
        ) : (
          quote && (
            <div className="space-y-4">
              <div className="space-y-2 rounded-xl border border-border p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("swap.convert", "Convert")}</span>
                  <span className="font-mono">{fmt(quote.amountMinor, quote.fromCurrency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("swap.fee", "Fee")}</span>
                  <span className="font-mono">{quote.feeMinor === "0" ? t("swap.free", "Free") : fmt(quote.feeMinor, quote.fromCurrency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("swap.totalDebit", "Total debited")}</span>
                  <span className="font-mono">{fmt(quote.totalDebitMinor, quote.fromCurrency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("swap.rate", "Rate")}</span>
                  <span className="font-mono">
                    1 {quote.fromCurrency} = {quote.rate} {quote.toCurrency}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between text-base font-semibold">
                  <span>{t("swap.receive", "You receive")}</span>
                  <span className="font-mono">{fmt(quote.toAmountMinor, quote.toCurrency)}</span>
                </div>
              </div>

              <p className={cn("flex items-center gap-1.5 text-xs", expired ? "text-destructive" : "text-muted-foreground")}>
                <Clock className="h-3.5 w-3.5" />
                {expired ? t("swap.quoteExpired", "This rate has expired — refresh to get the current rate.") : t("swap.quoteValid", "Rate held for {{seconds}}s", { seconds: secondsLeft })}
              </p>
              {quoteExceeds && <p className="text-xs text-destructive">{t("swap.insufficientWithFee", "Your balance doesn't cover the amount plus the fee.")}</p>}

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("amount")} disabled={swapMutation.isPending} aria-label={t("swap.back", "Back")}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                {expired ? (
                  <Button className="flex-1" onClick={() => quoteMutation.mutate()} loading={quoteMutation.isPending}>
                    {!quoteMutation.isPending && <RefreshCw className="h-4 w-4" />}
                    {t("swap.refreshQuote", "Refresh rate")}
                  </Button>
                ) : (
                  <Button className="flex-1" onClick={() => swapMutation.mutate()} loading={swapMutation.isPending} disabled={quoteExceeds}>
                    {!swapMutation.isPending && <Repeat className="h-4 w-4" />}
                    {t("swap.confirm", "Confirm swap")}
                  </Button>
                )}
              </div>
            </div>
          )
        )}
      </CardContent>
    </Card>
  );
}

function RecentSwaps() {
  const { t } = useTranslation();
  const walletsQuery = useQuery({ queryKey: ["portal", "wallets"], queryFn: () => portalApi.get<WalletBalance[]>("/portal/wallets") });
  const swapsQuery = useQuery({ queryKey: ["portal", "swaps", "list"], queryFn: () => portalApi.get<Swap[]>("/portal/swaps?limit=10") });
  const fmt = (minor: string, code: string) => {
    const w = walletsQuery.data?.find((x) => x.currencyCode === code);
    return formatCurrencyAmount(minor, w?.decimals ?? 2, w?.symbol, code);
  };

  return (
    <Card className="h-fit">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Repeat className="h-4 w-4 text-primary" /> {t("swap.recent.title", "Recent swaps")}
        </CardTitle>
        <CardDescription>{t("swap.recent.subtitle", "Conversions between your wallets")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {swapsQuery.isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)
        ) : !swapsQuery.data?.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("swap.recent.empty", "No swaps yet.")}</p>
        ) : (
          swapsQuery.data.map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/50">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Repeat className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {s.fromCurrency} → {s.toCurrency}
                </p>
                <p className="truncate text-xs text-muted-foreground">{new Date(s.createdAt).toLocaleString()}</p>
              </div>
              <div className="shrink-0 text-right font-mono text-xs">
                <p className="text-muted-foreground">-{fmt(s.fromAmountMinor, s.fromCurrency)}</p>
                <p className="font-medium text-success">+{fmt(s.toAmountMinor, s.toCurrency)}</p>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
