import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import {
  formatCurrencyAmount,
  type Transfer,
  type TransferLookupMethod,
  type TransferProfile,
  type TransferQuote,
  type TransferRecipient,
  type WalletBalance,
} from "@white-label/shared-types";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowRightLeft,
  ArrowUpRight,
  AtSign,
  CheckCircle2,
  Copy,
  Hash,
  Loader2,
  Phone,
  QrCode,
  ScanLine,
  Send,
  Share2,
} from "lucide-react";
import { portalApi, ApiError } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QrScanner } from "@/components/transfer/QrScanner";

type Step = "find" | "amount" | "review" | "done";

/** "12.5" + 2 decimals → "1250" without float rounding; null when not a valid positive amount. */
function majorToMinorString(value: string, decimals: number): string | null {
  const m = value.trim().match(/^(\d+)(?:\.(\d*))?$/);
  if (!m) return null;
  const frac = (m[2] ?? "").slice(0, decimals).padEnd(decimals, "0");
  const minor = (m[1] + frac).replace(/^0+(?=\d)/, "");
  return minor === "0" || /^0+$/.test(minor) ? null : minor;
}

/** "AB12CD34EF" → "AB12 CD34 EF" for readability. */
function groupId(id: string) {
  return id.replace(/(.{4})(?=.)/g, "$1 ");
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

function newIdempotencyKey() {
  return crypto.randomUUID();
}

function RecipientCard({ recipient, action }: { recipient: TransferRecipient; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">{initials(recipient.displayName)}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{recipient.displayName}</p>
        <p className="font-mono text-xs text-muted-foreground">{groupId(recipient.publicId)}</p>
      </div>
      {action}
    </div>
  );
}

export default function TransferPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const deepLinkId = params.get("to");
  const [tab, setTab] = useState(params.get("tab") === "receive" ? "receive" : "send");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{t("transfer.title", "Transfer")}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{t("transfer.subtitle", "Send money instantly to another customer, or share your code to get paid.")}</p>
      </div>


      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v);
            setParams((p) => {
              p.set("tab", v);
              return p;
            }, { replace: true });
          }}
        >
          <TabsList className="grid w-full grid-cols-2 sm:w-80">
            <TabsTrigger value="send" className="gap-1.5">
              <Send className="h-3.5 w-3.5" /> {t("transfer.tabs.send", "Send")}
            </TabsTrigger>
            <TabsTrigger value="receive" className="gap-1.5">
              <QrCode className="h-3.5 w-3.5" /> {t("transfer.tabs.receive", "Receive")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="send" className="mt-4">
            <SendFlow deepLinkId={deepLinkId} />
          </TabsContent>
          <TabsContent value="receive" className="mt-4">
            <ReceivePanel />
          </TabsContent>
        </Tabs>

        <RecentTransfers />
      </div>
    </div>
  );
}

function SendFlow({ deepLinkId }: { deepLinkId: string | null }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const METHODS: { key: TransferLookupMethod; label: string; icon: typeof AtSign; placeholder: string; help: string }[] = [
    { key: "EMAIL", label: t("transfer.method.email", "Email"), icon: AtSign, placeholder: "name@example.com", help: t("transfer.method.emailHelp", "The email address they signed up with.") },
    { key: "PHONE", label: t("transfer.method.phone", "Phone"), icon: Phone, placeholder: "8012 3456", help: t("transfer.method.phoneHelp", "At least the last 8 digits of their phone number.") },
    { key: "ID", label: t("transfer.method.id", "Customer ID"), icon: Hash, placeholder: "AB12 CD34 EF", help: t("transfer.method.idHelp", "The ID shown on their Receive tab.") },
    { key: "QR", label: t("transfer.method.qr", "Scan QR"), icon: ScanLine, placeholder: "", help: "" },
  ];

  const [step, setStep] = useState<Step>("find");
  const [method, setMethod] = useState<TransferLookupMethod>(deepLinkId ? "QR" : "EMAIL");
  const [query, setQuery] = useState("");
  const [recipient, setRecipient] = useState<TransferRecipient | null>(null);
  const [currencyCode, setCurrencyCode] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [result, setResult] = useState<Transfer | null>(null);
  // Bumped after a failed QR lookup so the scanner remounts and can scan again.
  const [scanAttempt, setScanAttempt] = useState(0);

  const walletsQuery = useQuery({ queryKey: ["portal", "wallets"], queryFn: () => portalApi.get<WalletBalance[]>("/portal/wallets") });
  const recentQuery = useQuery({
    queryKey: ["portal", "transfers", "recent-recipients"],
    queryFn: () => portalApi.get<TransferRecipient[]>("/portal/transfers/recent-recipients"),
  });
  const wallets = walletsQuery.data ?? [];
  const wallet = wallets.find((w) => w.currencyCode === currencyCode) ?? null;

  useEffect(() => {
    if (!currencyCode && wallets.length > 0) setCurrencyCode([...wallets].sort((a, b) => Number(BigInt(b.availableMinor) - BigInt(a.availableMinor)))[0]!.currencyCode);
  }, [wallets, currencyCode]);

  const lookupMutation = useMutation({
    mutationFn: (input: { method: TransferLookupMethod; value: string }) => portalApi.post<TransferRecipient>("/portal/transfers/lookup", input),
    onSuccess: (r) => {
      setRecipient(r);
      setStep("amount");
    },
    onError: (e) => {
      setScanAttempt((n) => n + 1);
      toast({
        variant: "destructive",
        title: e instanceof ApiError && e.status === 404 ? t("transfer.toast.notFound", "No customer found") : t("transfer.toast.lookupFailed", "Couldn't find recipient"),
        description: e instanceof ApiError && e.status !== 404 ? e.message : t("transfer.toast.notFoundHelp", "Check the details and try again."),
      });
    },
  });

  // A shared receive link (/portal/transfer?to=ID) — look the recipient up straight away.
  useEffect(() => {
    if (deepLinkId) lookupMutation.mutate({ method: "QR", value: deepLinkId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkId]);

  const amountMinor = wallet ? majorToMinorString(amount, wallet.decimals) : null;
  const insufficient = !!(wallet && amountMinor && BigInt(amountMinor) > BigInt(wallet.availableMinor));

  const quoteQuery = useQuery({
    queryKey: ["portal", "transfers", "quote", currencyCode, amountMinor],
    queryFn: () => portalApi.get<TransferQuote>(`/portal/transfers/quote?currencyCode=${currencyCode}&amountMinor=${amountMinor}`),
    enabled: !!amountMinor && !!currencyCode && step !== "find",
  });
  const quote = quoteQuery.data;
  const totalExceeds = !!(wallet && quote && BigInt(quote.totalMinor) > BigInt(wallet.availableMinor));

  const fmt = (minor: string) => (wallet ? formatCurrencyAmount(minor, wallet.decimals, wallet.symbol, wallet.currencyCode) : minor);

  const sendMutation = useMutation({
    mutationFn: () =>
      portalApi.post<Transfer>("/portal/transfers", {
        recipientPublicId: recipient!.publicId,
        currencyCode,
        amountMinor,
        note: note.trim() || undefined,
        lookupMethod: method,
        idempotencyKey,
      }),
    onSuccess: (tr) => {
      setResult(tr);
      setStep("done");
      queryClient.invalidateQueries({ queryKey: ["portal", "wallets"] });
      queryClient.invalidateQueries({ queryKey: ["portal", "transfers"] });
      queryClient.invalidateQueries({ queryKey: ["portal", "transactions"] });
    },
    onError: (e) => toast({ variant: "destructive", title: t("transfer.toast.sendFailed", "Transfer failed"), description: e instanceof ApiError ? e.message : undefined }),
  });

  const reset = () => {
    setStep("find");
    setRecipient(null);
    setQuery("");
    setAmount("");
    setNote("");
    setResult(null);
    setIdempotencyKey(newIdempotencyKey());
  };

  const activeMethod = METHODS.find((m) => m.key === method)!;

  if (step === "done" && result) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/15 text-success">
            <CheckCircle2 className="h-9 w-9" />
          </div>
          <div>
            <p className="font-heading text-3xl font-semibold tracking-tight">{fmt(result.amountMinor)}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("transfer.done.sentTo", "sent to {{name}}", { name: result.counterparty.displayName })}</p>
          </div>
          {result.feeMinor !== "0" && <p className="text-xs text-muted-foreground">{t("transfer.done.fee", "Fee {{fee}}", { fee: fmt(result.feeMinor) })}</p>}
          <p className="font-mono text-xs text-muted-foreground">{t("transfer.done.reference", "Ref {{id}}", { id: result.transactionId })}</p>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/portal/transactions">{t("transfer.done.viewHistory", "View history")}</Link>
            </Button>
            <Button onClick={reset}>{t("transfer.done.sendAnother", "Send another")}</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-5 sm:p-6">
        {step === "find" && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {METHODS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  title={m.key === "QR" ? t("transfer.method.qrTitle", "Scan the recipient's QR code") : t("transfer.method.findBy", "Find by {{method}}", { method: m.label })}
                  onClick={() => {
                    setMethod(m.key);
                    setQuery("");
                  }}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-xs font-medium transition-colors disabled:opacity-50",
                    method === m.key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <m.icon className="h-5 w-5" />
                  {m.label}
                </button>
              ))}
            </div>

            {method === "QR" ? (
              lookupMutation.isPending ? (
                <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> {t("transfer.findingRecipient", "Finding recipient…")}
                </div>
              ) : (
                <QrScanner key={scanAttempt} onResult={(value) => lookupMutation.mutate({ method: "QR", value })} />
              )
            ) : (
              <form
                className="space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (query.trim()) lookupMutation.mutate({ method, value: query.trim() });
                }}
              >
                <Label htmlFor="transfer-query">{activeMethod.label}</Label>
                <div className="flex gap-2">
                  <Input
                    id="transfer-query"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={activeMethod.placeholder}
                    type={method === "EMAIL" ? "email" : method === "PHONE" ? "tel" : "text"}
                    inputMode={method === "PHONE" ? "tel" : undefined}
                    autoCapitalize={method === "ID" ? "characters" : "off"}
                    autoComplete="off"
                    className={method === "ID" ? "font-mono uppercase tracking-wider" : undefined}
                  />
                  <Button type="submit" disabled={!query.trim()} loading={lookupMutation.isPending}>
                    {t("transfer.find", "Find")}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{activeMethod.help}</p>
              </form>
            )}

            {(recentQuery.data?.length ?? 0) > 0 && (
              <div className="space-y-2">
                <Separator />
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("transfer.recentRecipients", "Recent")}</p>
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {recentQuery.data!.map((r) => (
                    <button
                      key={r.publicId}
                      type="button"
                      title={t("transfer.sendTo", "Send to {{name}}", { name: r.displayName })}
                      onClick={() => {
                        setMethod("ID");
                        setRecipient(r);
                        setStep("amount");
                      }}
                      className="flex w-16 shrink-0 flex-col items-center gap-1 text-center"
                    >
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary transition-transform hover:scale-105">
                        {initials(r.displayName)}
                      </span>
                      <span className="w-full truncate text-[11px] text-muted-foreground">{r.displayName}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {(step === "amount" || step === "review") && recipient && (
          <>
            <RecipientCard
              recipient={recipient}
              action={
                <Button variant="ghost" size="sm" onClick={reset} disabled={sendMutation.isPending}>
                  {t("transfer.change", "Change")}
                </Button>
              }
            />

            {step === "amount" ? (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (amountMinor && quote && !totalExceeds) setStep("review");
                }}
              >
                <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
                  <div className="space-y-1.5">
                    <Label>{t("transfer.fromWallet", "From wallet")}</Label>
                    {walletsQuery.isLoading ? (
                      <Skeleton className="h-10" />
                    ) : (
                      <Select value={currencyCode} onValueChange={setCurrencyCode}>
                        <SelectTrigger>
                          <SelectValue placeholder={t("transfer.selectWallet", "Select")} />
                        </SelectTrigger>
                        <SelectContent>
                          {wallets.map((w) => (
                            <SelectItem key={w.currencyCode} value={w.currencyCode}>
                              {w.currencyCode}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="transfer-amount">{t("transfer.amount", "Amount")}</Label>
                    <Input
                      id="transfer-amount"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                      className="font-mono text-lg"
                      autoFocus
                    />
                  </div>
                </div>
                {wallet && (
                  <p className={cn("text-xs", insufficient || totalExceeds ? "text-destructive" : "text-muted-foreground")}>
                    {t("transfer.available", "Available: {{amount}}", { amount: fmt(wallet.availableMinor) })}
                    {(insufficient || totalExceeds) && ` · ${t("transfer.insufficient", "Insufficient balance")}`}
                  </p>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="transfer-note">
                    {t("transfer.note", "Note")} <span className="font-normal text-muted-foreground">({t("transfer.optional", "optional")})</span>
                  </Label>
                  <Input id="transfer-note" maxLength={140} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("transfer.notePlaceholder", "What's it for?")} />
                </div>
                {quote && (
                  <div className="space-y-1 rounded-lg bg-muted/40 p-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("transfer.fee", "Fee")}</span>
                      <span className="font-mono">{quote.feeMinor === "0" ? t("transfer.free", "Free") : fmt(quote.feeMinor)}</span>
                    </div>
                    <div className="flex justify-between font-medium">
                      <span>{t("transfer.totalDebit", "Total debited")}</span>
                      <span className="font-mono">{fmt(quote.totalMinor)}</span>
                    </div>
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={!amountMinor || !quote || totalExceeds || quoteQuery.isFetching}>
                  {t("transfer.continue", "Continue")}
                </Button>
              </form>
            ) : (
              quote && (
                <div className="space-y-4">
                  <div className="space-y-2 rounded-xl border border-border p-4 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("transfer.theyReceive", "They receive")}</span>
                      <span className="font-mono font-medium">{fmt(quote.amountMinor)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("transfer.fee", "Fee")}</span>
                      <span className="font-mono">{quote.feeMinor === "0" ? t("transfer.free", "Free") : fmt(quote.feeMinor)}</span>
                    </div>
                    {note.trim() && (
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">{t("transfer.note", "Note")}</span>
                        <span className="truncate">{note.trim()}</span>
                      </div>
                    )}
                    <Separator />
                    <div className="flex justify-between text-base font-semibold">
                      <span>{t("transfer.total", "Total")}</span>
                      <span className="font-mono">{fmt(quote.totalMinor)}</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{t("transfer.instantNotice", "Transfers arrive instantly and can't be reversed. Make sure this is the right person.")}</p>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setStep("amount")} disabled={sendMutation.isPending} aria-label={t("transfer.back", "Back")}>
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <Button className="flex-1" onClick={() => sendMutation.mutate()} loading={sendMutation.isPending}>
                      {!sendMutation.isPending && <Send className="h-4 w-4" />}
                      {t("transfer.confirmSend", "Send {{amount}}", { amount: fmt(quote.amountMinor) })}
                    </Button>
                  </div>
                </div>
              )
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ReceivePanel() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const profileQuery = useQuery({ queryKey: ["portal", "transfers", "profile"], queryFn: () => portalApi.get<TransferProfile>("/portal/transfers/profile") });
  const profile = profileQuery.data;
  // A link, not just the bare id: scanned with a phone's own camera app it opens straight into the
  // send flow here, and the in-app scanner extracts the id from it either way.
  const link = useMemo(() => (profile ? `${window.location.origin}/portal/transfer?to=${profile.publicId}` : ""), [profile]);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: t("transfer.toast.copied", "{{label}} copied", { label }) });
    } catch {
      toast({ variant: "destructive", title: t("transfer.toast.copyFailed", "Couldn't copy") });
    }
  };

  if (profileQuery.isLoading || !profile) return <Skeleton className="h-96" />;

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-5 p-6 text-center">
        <div>
          <p className="font-heading text-lg font-semibold">{profile.displayName}</p>
          <p className="text-sm text-muted-foreground">{t("transfer.receive.scanToPay", "Scan to send me money")}</p>
        </div>
        <div className="rounded-2xl border border-border bg-white p-4 shadow-soft">
          <QRCodeSVG value={link} size={208} level="M" marginSize={0} />
        </div>
        <div className="w-full max-w-xs space-y-1">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{t("transfer.receive.yourId", "Your customer ID")}</p>
          <div className="flex items-center justify-center gap-2">
            <span className="font-mono text-xl font-semibold tracking-wider">{groupId(profile.publicId)}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t("transfer.receive.copyId", "Copy customer ID")} onClick={() => copy(profile.publicId, t("transfer.receive.idLabel", "Customer ID"))}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex w-full max-w-xs gap-2">
          <Button variant="outline" className="flex-1" onClick={() => copy(link, t("transfer.receive.linkLabel", "Payment link"))}>
            <Copy className="h-4 w-4" /> {t("transfer.receive.copyLink", "Copy link")}
          </Button>
          {"share" in navigator && (
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => navigator.share({ title: t("transfer.receive.shareTitle", "Send me money"), url: link }).catch(() => undefined)}
            >
              <Share2 className="h-4 w-4" /> {t("transfer.receive.share", "Share")}
            </Button>
          )}
        </div>
        <p className="max-w-xs text-xs text-muted-foreground">
          {profile.phoneHint
            ? t("transfer.receive.alsoFindable", "People can also find you by your email or your phone number ending {{hint}}.", { hint: profile.phoneHint.replace("•••• ", "") })
            : t("transfer.receive.alsoFindableEmail", "People can also find you by your email address.")}
        </p>
      </CardContent>
    </Card>
  );
}

function RecentTransfers() {
  const { t } = useTranslation();
  const walletsQuery = useQuery({ queryKey: ["portal", "wallets"], queryFn: () => portalApi.get<WalletBalance[]>("/portal/wallets") });
  const transfersQuery = useQuery({ queryKey: ["portal", "transfers", "list"], queryFn: () => portalApi.get<Transfer[]>("/portal/transfers?limit=10") });
  const decimalsOf = (code: string) => walletsQuery.data?.find((w) => w.currencyCode === code);

  return (
    <Card className="h-fit">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ArrowRightLeft className="h-4 w-4 text-primary" /> {t("transfer.recent.title", "Recent transfers")}
        </CardTitle>
        <CardDescription>{t("transfer.recent.subtitle", "Money you've sent and received")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {transfersQuery.isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)
        ) : !transfersQuery.data?.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("transfer.recent.empty", "No transfers yet.")}</p>
        ) : (
          transfersQuery.data.map((tr) => {
            const sent = tr.direction === "SENT";
            const w = decimalsOf(tr.currencyCode);
            const amount = formatCurrencyAmount(tr.amountMinor, w?.decimals ?? 2, w?.symbol, tr.currencyCode);
            return (
              <div key={tr.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/50">
                <div
                  className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", sent ? "bg-muted text-muted-foreground" : "bg-success/15 text-success")}
                  title={sent ? t("transfer.recent.sent", "Sent") : t("transfer.recent.received", "Received")}
                >
                  {sent ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{tr.counterparty.displayName}</p>
                  <p className="truncate text-xs text-muted-foreground">{tr.note ?? new Date(tr.createdAt).toLocaleString()}</p>
                </div>
                <span className={cn("shrink-0 font-mono text-sm font-medium", !sent && "text-success")}>
                  {sent ? "-" : "+"}
                  {amount}
                </span>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
