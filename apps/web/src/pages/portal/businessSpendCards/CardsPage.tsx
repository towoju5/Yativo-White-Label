import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BusinessSpendCardDto, BusinessSpendCardTransaction, BusinessSpendCardWalletActionResult } from "@white-label/shared-types";
import { CreditCard, Plus, Lock, Unlock, XCircle, Loader2, KeyRound, Gauge, ArrowDownToLine, ArrowUpFromLine, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { portalApi, ApiError } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { KycRequiredNotice } from "@/components/kyc/KycRequiredNotice";

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive"> = {
  ACTIVE: "success",
  SUSPENDED: "warning",
  TERMINATED: "destructive",
};

function formatUsd(minorOrAmount: string) {
  const n = Number(minorOrAmount);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { style: "currency", currency: "USD" }) : minorOrAmount;
}

const TRANSACTION_STATUS_VARIANT: Record<string, "success" | "warning" | "destructive"> = {
  posted: "success",
  pending: "warning",
  decline: "destructive",
};

export default function PortalBusinessSpendCardsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [issueOpen, setIssueOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState<BusinessSpendCardDto | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["portal", "business-spend-cards"],
    queryFn: () => portalApi.get<BusinessSpendCardDto[]>("/portal/business-spend-cards"),
  });

  const issueMutation = useMutation({
    mutationFn: () => portalApi.post<BusinessSpendCardDto>("/portal/business-spend-cards", { cardType: "VIRTUAL" }),
    onSuccess: () => {
      toast({ title: t("businessSpendCards.toast.cardIssued", "Business Spend Card issued") });
      queryClient.invalidateQueries({ queryKey: ["portal", "business-spend-cards"] });
      setIssueOpen(false);
    },
    onError: (e) => toast({ variant: "destructive", title: t("businessSpendCards.toast.issueCardError", "Couldn't issue card"), description: e instanceof ApiError ? e.message : undefined }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{t("businessSpendCards.title", "Business Spend Cards")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("businessSpendCards.subtitle", "Cards for your business, funded from your USD wallet")}</p>
        </div>
      </div>

      <KycRequiredNotice service="BUSINESS_SPEND_CARD" />

      <div className="flex items-center justify-end">
        <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4" /> {t("businessSpendCards.requestCard", "Request card")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("businessSpendCards.requestDialogTitle", "Request a Business Spend Card")}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              {t("businessSpendCards.requestDialogHelp", "Issued with a zero balance — fund it from your USD wallet once it's ready.")}
            </p>
            <DialogFooter>
              <Button onClick={() => issueMutation.mutate()} disabled={issueMutation.isPending}>
                {issueMutation.isPending ? t("businessSpendCards.requesting", "Requesting…") : t("businessSpendCards.requestCard", "Request card")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <CreditCard className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("businessSpendCards.emptyState", "No Business Spend Cards yet. Request one to get started.")}</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCard(c)}
              className="flex flex-col justify-between rounded-2xl border border-border bg-gradient-to-br from-primary/15 via-card to-card p-5 text-left shadow-soft transition-transform hover:-translate-y-0.5 hover:shadow-elevated"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs uppercase text-muted-foreground">{c.issuanceType}</span>
                <Badge variant={STATUS_VARIANT[c.status] ?? "secondary"}>{c.status}</Badge>
              </div>
              <p className="mt-6 font-mono text-lg tracking-widest">{c.maskedPan ?? "•••• •••• •••• ----"}</p>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{t("businessSpendCards.usd", "Business Spend Card · USD")}</span>
                <span className="text-xs font-medium text-primary">{t("businessSpendCards.manage", "Manage →")}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      <CardDetailSheet card={selectedCard} onClose={() => setSelectedCard(null)} />
    </div>
  );
}

function CardDetailSheet({ card, onClose }: { card: BusinessSpendCardDto | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [fundAmount, setFundAmount] = useState("10.00");
  const [withdrawAmount, setWithdrawAmount] = useState("10.00");
  const [pin, setPin] = useState("");
  const [monthlyLimit, setMonthlyLimit] = useState("2000");
  const [terminateArmed, setTerminateArmed] = useState(false);

  useEffect(() => {
    setTerminateArmed(false);
    setPin("");
  }, [card?.id]);

  const transactionsQuery = useQuery({
    queryKey: ["portal", "business-spend-cards", card?.id, "transactions"],
    queryFn: () => portalApi.get<BusinessSpendCardTransaction[]>(`/portal/business-spend-cards/${card!.id}/transactions`),
    enabled: !!card,
  });

  const invalidateCards = () => queryClient.invalidateQueries({ queryKey: ["portal", "business-spend-cards"] });

  const walletMutation = useMutation({
    mutationFn: (action: "fund" | "withdraw") =>
      portalApi.post<BusinessSpendCardWalletActionResult>(`/portal/business-spend-cards/${card!.id}/wallet`, {
        action,
        amountMinor: Math.round(Number(action === "fund" ? fundAmount : withdrawAmount) * 100).toString(),
      }),
    onSuccess: (result, action) => {
      toast({
        title: action === "fund" ? t("businessSpendCards.toast.cardFunded", "Card funded") : t("businessSpendCards.toast.withdrawalSubmitted", "Withdrawal submitted"),
        description: result.cardEmptied && !result.cardTerminated ? t("businessSpendCards.toast.terminationPending", "Card emptied — automatic termination is still pending, retry from here shortly.") : undefined,
      });
      invalidateCards();
      queryClient.invalidateQueries({ queryKey: ["portal", "wallets"] });
    },
    onError: (e) => toast({ variant: "destructive", title: t("businessSpendCards.toast.walletActionFailed", "Action failed"), description: e instanceof ApiError ? e.message : undefined }),
  });

  const statusMutation = useMutation({
    mutationFn: (action: "activate" | "suspend" | "terminate") => portalApi.post<BusinessSpendCardDto>(`/portal/business-spend-cards/${card!.id}/status`, { action }),
    onSuccess: (updated, action) => {
      toast({ title: t(`businessSpendCards.toast.status.${action}`, action === "activate" ? "Card activated" : action === "suspend" ? "Card suspended" : "Card terminated") });
      invalidateCards();
      if (updated.status === "TERMINATED") onClose();
    },
    onError: (e) => toast({ variant: "destructive", title: t("businessSpendCards.toast.statusError", "Couldn't update card"), description: e instanceof ApiError ? e.message : undefined }),
  });

  const pinMutation = useMutation({
    mutationFn: () => portalApi.post<BusinessSpendCardDto>(`/portal/business-spend-cards/${card!.id}/pin`, { pin }),
    onSuccess: () => {
      toast({ title: t("businessSpendCards.toast.pinUpdated", "PIN updated") });
      setPin("");
    },
    onError: (e) => toast({ variant: "destructive", title: t("businessSpendCards.toast.pinError", "Couldn't update PIN"), description: e instanceof ApiError ? e.message : undefined }),
  });

  const limitsMutation = useMutation({
    mutationFn: () =>
      portalApi.put(`/portal/business-spend-cards/${card!.id}/limits`, {
        limits: [{ amountLimit: Number(monthlyLimit), timeUnit: "Monthly", operationName: "SPENDINGLIMIT" }],
      }),
    onSuccess: () => toast({ title: t("businessSpendCards.toast.limitsUpdated", "Spending limit updated") }),
    onError: (e) => toast({ variant: "destructive", title: t("businessSpendCards.toast.limitsError", "Couldn't update limit"), description: e instanceof ApiError ? e.message : undefined }),
  });

  const isActive = card?.status === "ACTIVE";
  const isTerminated = card?.status === "TERMINATED";

  return (
    <Sheet open={!!card} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="flex flex-col gap-6 overflow-y-auto">
        {card && (
          <>
            <SheetHeader>
              <SheetTitle>{t("businessSpendCards.cardTitle", "Business Spend Card")}</SheetTitle>
              <SheetDescription>{t("businessSpendCards.subtitleUsd", "Visa · USD")}</SheetDescription>
            </SheetHeader>

            <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/15 via-card to-card p-5 shadow-soft">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs uppercase text-muted-foreground">{card.issuanceType}</span>
                <Badge variant={STATUS_VARIANT[card.status] ?? "secondary"}>{card.status}</Badge>
              </div>
              <p className="mt-6 font-mono text-lg tracking-widest">{card.maskedPan ?? "•••• •••• •••• ----"}</p>
              {card.expirationDate && <p className="mt-1 text-xs text-muted-foreground">{t("businessSpendCards.exp", "Exp {{date}}", { date: card.expirationDate })}</p>}
            </div>

            {!isTerminated && (
              <>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="fund" className="flex items-center gap-1.5 text-xs">
                      <ArrowDownToLine className="h-3.5 w-3.5" /> {t("businessSpendCards.fund", "Fund")}
                    </Label>
                    <Input id="fund" type="number" min="0.01" step="0.01" value={fundAmount} onChange={(e) => setFundAmount(e.target.value)} disabled={!isActive} />
                    <Button size="sm" className="w-full" onClick={() => walletMutation.mutate("fund")} disabled={!isActive || walletMutation.isPending}>
                      {walletMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("businessSpendCards.addFunds", "Add funds")}
                    </Button>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="withdraw" className="flex items-center gap-1.5 text-xs">
                      <ArrowUpFromLine className="h-3.5 w-3.5" /> {t("businessSpendCards.withdraw", "Withdraw")}
                    </Label>
                    <Input id="withdraw" type="number" min="0.01" step="0.01" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} disabled={!isActive} />
                    <Button size="sm" variant="outline" className="w-full" onClick={() => walletMutation.mutate("withdraw")} disabled={!isActive || walletMutation.isPending}>
                      {walletMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("businessSpendCards.withdraw", "Withdraw")}
                    </Button>
                  </div>
                </div>
                <p className="-mt-3 text-xs text-muted-foreground">
                  {t("businessSpendCards.withdrawFeeNote", "Withdrawing to zero automatically terminates the card. A fee may apply to withdrawals.")}
                </p>

                <Separator />

                <div className="space-y-1.5">
                  <Label htmlFor="pin" className="flex items-center gap-1.5 text-xs">
                    <KeyRound className="h-3.5 w-3.5" /> {t("businessSpendCards.setPin", "Set PIN")}
                  </Label>
                  <div className="flex gap-2">
                    <Input id="pin" type="password" inputMode="numeric" maxLength={6} placeholder="••••" value={pin} onChange={(e) => setPin(e.target.value)} disabled={!isActive} />
                    <Button size="sm" onClick={() => pinMutation.mutate()} disabled={!isActive || pin.length < 4 || pinMutation.isPending}>
                      {pinMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("businessSpendCards.save", "Save")}
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="limit" className="flex items-center gap-1.5 text-xs">
                    <Gauge className="h-3.5 w-3.5" /> {t("businessSpendCards.monthlySpendingLimit", "Monthly spending limit (USD)")}
                  </Label>
                  <div className="flex gap-2">
                    <Input id="limit" type="number" min="1" max="10000" value={monthlyLimit} onChange={(e) => setMonthlyLimit(e.target.value)} disabled={!isActive} />
                    <Button size="sm" onClick={() => limitsMutation.mutate()} disabled={!isActive || limitsMutation.isPending}>
                      {limitsMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("businessSpendCards.save", "Save")}
                    </Button>
                  </div>
                </div>

                <Separator />

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => statusMutation.mutate(card.status === "SUSPENDED" ? "activate" : "suspend")}
                  disabled={statusMutation.isPending}
                >
                  {statusMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : card.status === "SUSPENDED" ? (
                    <>
                      <Unlock className="h-4 w-4" /> {t("businessSpendCards.activateCard", "Activate card")}
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4" /> {t("businessSpendCards.suspendCard", "Suspend card")}
                    </>
                  )}
                </Button>

                <div className="space-y-2">
                  <Button
                    variant={terminateArmed ? "destructive" : "outline"}
                    className="w-full"
                    onClick={() => (terminateArmed ? statusMutation.mutate("terminate") : setTerminateArmed(true))}
                    disabled={statusMutation.isPending}
                  >
                    {statusMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                    {terminateArmed ? t("businessSpendCards.confirmTerminate", "Click again to confirm — this can't be undone") : t("businessSpendCards.terminateCard", "Terminate card")}
                  </Button>
                  {terminateArmed && (
                    <button className="text-xs text-muted-foreground hover:underline" onClick={() => setTerminateArmed(false)}>
                      {t("businessSpendCards.cancel", "Cancel")}
                    </button>
                  )}
                </div>
              </>
            )}

            {isTerminated && (
              <Button className="w-full" onClick={() => statusMutation.mutate("terminate")} disabled={statusMutation.isPending}>
                {statusMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("businessSpendCards.retryTermination", "Retry termination")}
              </Button>
            )}

            <Separator />

            <div className="space-y-2">
              <h3 className="text-sm font-medium">{t("businessSpendCards.transactions", "Transactions")}</h3>
              {transactionsQuery.isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-10" />
                  ))}
                </div>
              ) : !transactionsQuery.data || transactionsQuery.data.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("businessSpendCards.noTransactions", "No transactions yet.")}</p>
              ) : (
                <div className="space-y-1.5">
                  {transactionsQuery.data.map((tx, i) => {
                    const isCredit = tx.status === "posted" && Number(tx.amount) >= 0;
                    return (
                      <div key={tx.txnGuid ?? i} className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5 text-sm">
                        <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${isCredit ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                          {isCredit ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{tx.description ?? t("businessSpendCards.transactionFallback", "Transaction")}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                            {tx.status && (
                              <Badge variant={TRANSACTION_STATUS_VARIANT[tx.status] ?? "secondary"} className="text-[10px] capitalize">
                                {tx.status}
                              </Badge>
                            )}
                            {tx.txnDate && <span>{new Date(tx.txnDate).toLocaleString()}</span>}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-mono font-medium">{tx.amount ? formatUsd(tx.amount) : "—"}</p>
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
