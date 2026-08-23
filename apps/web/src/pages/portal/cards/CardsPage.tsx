import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CardDto, CardDetailDto, CardReveal, CardTransaction } from "@white-label/shared-types";
import {
  CreditCard,
  Eye,
  EyeOff,
  Copy,
  Plus,
  Snowflake,
  Sun,
  Plane,
  ArrowDownToLine,
  ArrowUpFromLine,
  XCircle,
  Loader2,
  MapPin,
  ArrowDownLeft,
  ArrowUpRight,
  Receipt,
} from "lucide-react";
import { portalApi, ApiError } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive"> = {
  ACTIVE: "success",
  FROZEN: "warning",
  CLOSED: "destructive",
};

const REVEAL_AUTO_HIDE_MS = 20_000;

function formatUsd(minorOrAmount: string) {
  const n = Number(minorOrAmount);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { style: "currency", currency: "USD" }) : minorOrAmount;
}

/** "CARD_CREATION_FEE" / "card_creation_fee" -> "Card creation fee" */
function humanize(value: string) {
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}

const TRANSACTION_STATUS_VARIANT: Record<string, "success" | "warning" | "destructive"> = {
  completed: "success",
  success: "success",
  successful: "success",
  pending: "warning",
  processing: "warning",
  failed: "destructive",
  declined: "destructive",
};

/** Transactions that add funds to the card (shown as a credit); everything else (fees, purchases, withdrawals) is a debit. */
const CREDIT_TRANSACTION_TYPES = new Set(["funding", "topup", "refund", "credit"]);

export default function PortalCardsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [issueOpen, setIssueOpen] = useState(false);
  const [amount, setAmount] = useState("5.00");
  const [selectedCard, setSelectedCard] = useState<CardDto | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["portal", "cards"],
    queryFn: () => portalApi.get<CardDto[]>("/portal/cards"),
  });

  const issueMutation = useMutation({
    mutationFn: () => portalApi.post<CardDto>("/portal/cards", { amountMinor: Math.round(Number(amount) * 100).toString() }),
    onSuccess: () => {
      toast({ title: "Card issued" });
      queryClient.invalidateQueries({ queryKey: ["portal", "cards"] });
      setIssueOpen(false);
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't issue card", description: e instanceof ApiError ? e.message : undefined }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Cards</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Visa virtual cards linked to your USD wallet</p>
        </div>
        <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4" /> Request card
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Request a virtual card</DialogTitle>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="amount">Initial funding (USD)</Label>
              <Input id="amount" type="number" min="3" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <p className="text-xs text-muted-foreground">Minimum $3. Debited from your USD wallet along with a creation fee and top-up fee.</p>
            </div>
            <DialogFooter>
              <Button onClick={() => issueMutation.mutate()} disabled={issueMutation.isPending}>
                {issueMutation.isPending ? "Requesting…" : "Request card"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <CreditCard className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No cards yet. Request one to start spending.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCard(c)}
              className="flex flex-col justify-between rounded-2xl border border-border bg-gradient-to-br from-primary/15 via-card to-card p-5 text-left shadow-soft transition-transform hover:-translate-y-0.5 hover:shadow-elevated"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs uppercase text-muted-foreground">{c.network}</span>
                <Badge variant={STATUS_VARIANT[c.status] ?? "secondary"}>{c.status}</Badge>
              </div>
              <p className="mt-6 font-mono text-lg tracking-widest">•••• •••• •••• {c.last4 ?? "----"}</p>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Virtual · USD</span>
                <span className="text-xs font-medium text-primary">Manage →</span>
              </div>
            </button>
          ))}
        </div>
      )}

      <CardDetailSheet card={selectedCard} onClose={() => setSelectedCard(null)} />
    </div>
  );
}

function CardDetailSheet({ card, onClose }: { card: CardDto | null; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [revealed, setRevealed] = useState<CardReveal | null>(null);
  const [topupAmount, setTopupAmount] = useState("10.00");
  const [withdrawAmount, setWithdrawAmount] = useState("10.00");
  const [airlineEnabled, setAirlineEnabled] = useState(false);
  const [terminateArmed, setTerminateArmed] = useState(false);

  useEffect(() => {
    setRevealed(null);
    setTerminateArmed(false);
  }, [card?.id]);

  useEffect(() => {
    if (!revealed) return;
    const t = setTimeout(() => setRevealed(null), REVEAL_AUTO_HIDE_MS);
    return () => clearTimeout(t);
  }, [revealed]);

  const transactionsQuery = useQuery({
    queryKey: ["portal", "cards", card?.id, "transactions"],
    queryFn: () => portalApi.get<CardTransaction[]>(`/portal/cards/${card!.id}/transactions`),
    enabled: !!card,
  });

  const detailQuery = useQuery({
    queryKey: ["portal", "cards", card?.id, "detail"],
    queryFn: () => portalApi.get<CardDetailDto>(`/portal/cards/${card!.id}`),
    enabled: !!card,
  });
  const detail = detailQuery.data;
  const address = detail?.billingAddress;

  const invalidateCards = () => queryClient.invalidateQueries({ queryKey: ["portal", "cards"] });

  const revealMutation = useMutation({
    mutationFn: () => portalApi.post<CardReveal>(`/portal/cards/${card!.id}/reveal`),
    onSuccess: setRevealed,
    onError: (e) => toast({ variant: "destructive", title: "Couldn't reveal card", description: e instanceof ApiError ? e.message : undefined }),
  });

  const freezeMutation = useMutation({
    mutationFn: () => portalApi.post<CardDto>(`/portal/cards/${card!.id}/${card!.status === "FROZEN" ? "unfreeze" : "freeze"}`),
    onSuccess: (updated) => {
      toast({ title: updated.status === "FROZEN" ? "Card frozen" : "Card unfrozen" });
      invalidateCards();
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't update freeze state", description: e instanceof ApiError ? e.message : undefined }),
  });

  const topupMutation = useMutation({
    mutationFn: () => portalApi.post<CardDto>(`/portal/cards/${card!.id}/topup`, { amountMinor: Math.round(Number(topupAmount) * 100).toString() }),
    onSuccess: () => {
      toast({ title: "Card topped up" });
      invalidateCards();
      queryClient.invalidateQueries({ queryKey: ["portal", "wallets"] });
    },
    onError: (e) => toast({ variant: "destructive", title: "Top-up failed", description: e instanceof ApiError ? e.message : undefined }),
  });

  const withdrawMutation = useMutation({
    mutationFn: () => portalApi.post<CardDto>(`/portal/cards/${card!.id}/withdraw`, { amountMinor: Math.round(Number(withdrawAmount) * 100).toString() }),
    onSuccess: () => {
      toast({ title: "Withdrawal submitted", description: "A fee is deducted before the net amount lands back in your wallet." });
      invalidateCards();
      queryClient.invalidateQueries({ queryKey: ["portal", "wallets"] });
    },
    onError: (e) => toast({ variant: "destructive", title: "Withdrawal failed", description: e instanceof ApiError ? e.message : undefined }),
  });

  const airlineMutation = useMutation({
    mutationFn: (enabled: boolean) => portalApi.post<CardDto>(`/portal/cards/${card!.id}/airline-payments`, { enabled }),
    onSuccess: (_data, enabled) => {
      setAirlineEnabled(enabled);
      toast({ title: enabled ? "Airline payments enabled" : "Airline payments disabled" });
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't update airline payments", description: e instanceof ApiError ? e.message : undefined }),
  });

  const terminateMutation = useMutation({
    mutationFn: () => portalApi.post<CardDto>(`/portal/cards/${card!.id}/terminate`),
    onSuccess: () => {
      toast({ title: "Card terminated", description: "Any remaining balance is refunded to your wallet automatically." });
      invalidateCards();
      onClose();
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't terminate card", description: e instanceof ApiError ? e.message : undefined }),
  });

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `${label} copied` });
    } catch {
      toast({ variant: "destructive", title: "Couldn't copy" });
    }
  };

  const isActive = card?.status === "ACTIVE";
  const isClosed = card?.status === "CLOSED";

  return (
    <Sheet open={!!card} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="flex flex-col gap-6 overflow-y-auto">
        {card && (
          <>
            <SheetHeader>
              <SheetTitle>Card ending in {card.last4 ?? "----"}</SheetTitle>
              <SheetDescription>Visa virtual card · USD</SheetDescription>
            </SheetHeader>

            <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/15 via-card to-card p-5 shadow-soft">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs uppercase text-muted-foreground">{card.network}</span>
                <Badge variant={STATUS_VARIANT[card.status] ?? "secondary"}>{card.status}</Badge>
              </div>
              <div className="mt-6 flex items-center justify-between gap-3">
                <p className="font-mono text-lg tracking-widest">
                  {revealed?.cardNumber
                    ? revealed.cardNumber.replace(/(.{4})/g, "$1 ").trim()
                    : `•••• •••• •••• ${card.last4 ?? "----"}`}
                </p>
                {isActive && !isClosed && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => (revealed ? setRevealed(null) : revealMutation.mutate())}
                    disabled={revealMutation.isPending}
                  >
                    {revealMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : revealed ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
              {revealed && (
                <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                  {revealed.expiry && <span>Exp {revealed.expiry}</span>}
                  {revealed.cvv && <span>CVV {revealed.cvv}</span>}
                  {revealed.cardNumber && (
                    <button onClick={() => copy(revealed.cardNumber!.replace(/\s/g, ""), "Card number")} className="inline-flex items-center gap-1 hover:text-primary">
                      <Copy className="h-3 w-3" /> Copy number
                    </button>
                  )}
                  <span className="ml-auto">Hides automatically</span>
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-lg border border-border p-4 text-sm">
              {detailQuery.isLoading ? (
                <Skeleton className="h-16" />
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Cardholder</p>
                      <p className="font-medium">{detail?.cardholderName ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Program</p>
                      <p className="font-medium capitalize">{detail?.cardProgram ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Spent this month</p>
                      <p className="font-medium">{detail?.spentThisMonth ? formatUsd(detail.spentThisMonth) : "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Added this month</p>
                      <p className="font-medium">{detail?.toppedUpThisMonth ? formatUsd(detail.toppedUpThisMonth) : "—"}</p>
                    </div>
                  </div>

                  {address && (address.line1 || address.city) && (
                    <div className="border-t border-border pt-3">
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5" /> Billing address
                      </p>
                      <p className="mt-1 font-medium">
                        {address.line1}
                        {address.line2 ? `, ${address.line2}` : ""}
                        <br />
                        {[address.city, address.state, address.postalCode].filter(Boolean).join(", ")}
                        <br />
                        {address.country}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>

            {!isClosed && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="topup" className="flex items-center gap-1.5 text-xs">
                      <ArrowDownToLine className="h-3.5 w-3.5" /> Top up
                    </Label>
                    <Input id="topup" type="number" min="1" max="100000" step="0.01" value={topupAmount} onChange={(e) => setTopupAmount(e.target.value)} disabled={!isActive} />
                    <Button size="sm" className="w-full" onClick={() => topupMutation.mutate()} disabled={!isActive || topupMutation.isPending}>
                      {topupMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add funds"}
                    </Button>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="withdraw" className="flex items-center gap-1.5 text-xs">
                      <ArrowUpFromLine className="h-3.5 w-3.5" /> Withdraw
                    </Label>
                    <Input id="withdraw" type="number" min="1" step="0.01" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} disabled={!isActive} />
                    <Button size="sm" variant="outline" className="w-full" onClick={() => withdrawMutation.mutate()} disabled={!isActive || withdrawMutation.isPending}>
                      {withdrawMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Withdraw"}
                    </Button>
                  </div>
                </div>
                <p className="-mt-3 text-xs text-muted-foreground">A fee is deducted from withdrawals before the net amount reaches your wallet.</p>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <Plane className="h-4 w-4 text-muted-foreground" /> Airline payments
                  </div>
                  <Switch checked={airlineEnabled} onCheckedChange={(v) => airlineMutation.mutate(v)} disabled={!isActive || airlineMutation.isPending} />
                </div>

                <Button variant="outline" className="w-full" onClick={() => freezeMutation.mutate()} disabled={freezeMutation.isPending}>
                  {freezeMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : card.status === "FROZEN" ? (
                    <>
                      <Sun className="h-4 w-4" /> Unfreeze card
                    </>
                  ) : (
                    <>
                      <Snowflake className="h-4 w-4" /> Freeze card
                    </>
                  )}
                </Button>

                <Separator />

                <div className="space-y-2">
                  <Button
                    variant={terminateArmed ? "destructive" : "outline"}
                    className="w-full"
                    onClick={() => (terminateArmed ? terminateMutation.mutate() : setTerminateArmed(true))}
                    disabled={terminateMutation.isPending}
                  >
                    {terminateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                    {terminateArmed ? "Click again to confirm — this can't be undone" : "Terminate card"}
                  </Button>
                  {terminateArmed && (
                    <button className="text-xs text-muted-foreground hover:underline" onClick={() => setTerminateArmed(false)}>
                      Cancel
                    </button>
                  )}
                </div>
              </>
            )}

            <Separator />

            <div className="space-y-2">
              <h3 className="text-sm font-medium">Transactions</h3>
              {transactionsQuery.isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-10" />
                  ))}
                </div>
              ) : !transactionsQuery.data || transactionsQuery.data.length === 0 ? (
                <p className="text-sm text-muted-foreground">No transactions yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {transactionsQuery.data.map((t, i) => {
                    const isCredit = t.type ? CREDIT_TRANSACTION_TYPES.has(t.type.toLowerCase()) : false;
                    const merchant = typeof t.raw.merchant === "string" ? t.raw.merchant : undefined;
                    const title = t.description ?? merchant ?? (t.type ? humanize(t.type) : "Transaction");
                    const date = t.transactionDate ?? t.createdAt;
                    return (
                      <div key={t.id ?? i} className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5 text-sm">
                        <div
                          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                            isCredit ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {t.type === "fee" ? (
                            <Receipt className="h-3.5 w-3.5" />
                          ) : isCredit ? (
                            <ArrowDownLeft className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{title}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                            {t.status && (
                              <Badge variant={TRANSACTION_STATUS_VARIANT[t.status.toLowerCase()] ?? "secondary"} className="text-[10px] capitalize">
                                {t.status}
                              </Badge>
                            )}
                            {date && <span>{new Date(date).toLocaleString()}</span>}
                            {t.feeAmount && Number(t.feeAmount) > 0 && t.type !== "fee" && <span>Fee {formatUsd(t.feeAmount)}</span>}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className={`font-mono font-medium ${isCredit ? "text-success" : "text-foreground"}`}>
                            {isCredit ? "+" : "-"}
                            {formatUsd(t.amount)}
                          </p>
                          {t.balanceAfter && <p className="text-xs text-muted-foreground">Bal {formatUsd(t.balanceAfter)}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
