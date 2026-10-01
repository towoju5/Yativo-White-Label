import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CardDto, CardDetailDto, CardReveal, CardTransaction, AdminCardListItem, PaginatedResponse, Customer } from "@white-label/shared-types";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  Loader2,
  MapPin,
  Plus,
  Receipt,
  RefreshCw,
  Snowflake,
  Sun,
  Wallet,
  XCircle,
} from "lucide-react";
import { staffApi, ApiError } from "@/lib/api-client";
import type { Paginated } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { useStaffPermission } from "@/hooks/useStaffPermission";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SearchableSelect } from "@/pages/portal/kyc/kycShared";

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive"> = {
  ACTIVE: "success",
  FROZEN: "warning",
  CLOSED: "destructive",
};

const REVEAL_AUTO_HIDE_MS = 20_000;

function formatUsd(amount: string) {
  const n = Number(amount);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { style: "currency", currency: "USD" }) : amount;
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

export default function AdminCardsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canManage = useStaffPermission("cards.manage");
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [amount, setAmount] = useState("5.00");
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "cards"],
    queryFn: () => staffApi.get<PaginatedResponse<AdminCardListItem>>("/admin/cards", { pageSize: 50 }),
  });

  const customersQuery = useQuery({
    queryKey: ["admin", "customers", "for-card-issue"],
    // pageSize is capped at 100 server-side (paginationQuerySchema) — 200 here used to 400 on
    // every request, silently leaving this dropdown empty with no error shown.
    queryFn: () => staffApi.get<Paginated<Customer>>("/admin/customers", { page: 1, pageSize: 100 }),
    enabled: open,
  });
  useEffect(() => {
    if (customersQuery.isError) {
      toast({
        variant: "destructive",
        title: "Couldn't load customers",
        description: customersQuery.error instanceof ApiError ? customersQuery.error.message : undefined,
      });
    }
  }, [customersQuery.isError]);
  const customerOptions = (customersQuery.data?.items ?? []).map((c) => ({
    value: c.id,
    label: `${c.fullName ?? c.businessName ?? c.email} — ${c.email}`,
  }));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin", "cards"] });

  const issueMutation = useMutation({
    mutationFn: () => staffApi.post<CardDto>("/admin/cards/issue", { customerId, amountMinor: Math.round(Number(amount) * 100).toString() }),
    onSuccess: () => {
      toast({ title: "Virtual card issued" });
      invalidate();
      setOpen(false);
      setCustomerId("");
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't issue virtual card", description: e instanceof ApiError ? e.message : undefined }),
  });

  const cards = data?.items ?? [];
  // Track by id and resolve from the list so freeze/terminate refetches flow into the open sheet.
  const selectedCard = cards.find((c) => c.id === selectedCardId) ?? null;
  const setSelectedCard = (c: AdminCardListItem | null) => setSelectedCardId(c?.id ?? null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Virtual Cards</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Platform-wide Visa virtual card issuance — USD only</p>
        </div>
        {canManage && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4" /> Issue virtual card
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Issue a virtual card</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Customer</Label>
                <SearchableSelect
                  value={customerId}
                  onChange={setCustomerId}
                  options={customerOptions}
                  placeholder="Select a customer"
                  isLoading={customersQuery.isLoading}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="amount">Initial funding (USD)</Label>
                <Input id="amount" type="number" min="3" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <p className="text-xs text-muted-foreground">Minimum $3. Debited from the customer's wallet, plus a creation fee and top-up fee.</p>
              </div>
            </div>
            <DialogFooter>
              <Button disabled={!customerId || issueMutation.isPending} onClick={() => issueMutation.mutate()}>
                {issueMutation.isPending ? "Issuing…" : "Issue virtual card"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <CreditCard className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No virtual cards issued yet.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Network</TableHead>
              <TableHead>Number</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Issued</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cards.map((c) => (
              <TableRow key={c.id} className="cursor-pointer" onClick={() => setSelectedCard(c)}>
                <TableCell>
                  <div className="text-sm">{c.customerName ?? "—"}</div>
                  <div className="font-mono text-xs text-muted-foreground">{c.customerId}</div>
                </TableCell>
                <TableCell>{c.network}</TableCell>
                <TableCell className="font-mono">•••• {c.last4 ?? "----"}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[c.status] ?? "secondary"}>{c.status}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    title="View virtual card details"
                    aria-label="View virtual card details"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedCard(c);
                    }}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <AdminCardDetailSheet card={selectedCard} canManage={canManage} onClose={() => setSelectedCard(null)} />
    </div>
  );
}

function AdminCardDetailSheet({ card, canManage, onClose }: { card: AdminCardListItem | null; canManage: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [revealed, setRevealed] = useState<CardReveal | null>(null);
  const [terminateArmed, setTerminateArmed] = useState(false);

  useEffect(() => {
    setRevealed(null);
    setTerminateArmed(false);
  }, [card?.id]);

  useEffect(() => {
    if (!revealed) return;
    const timer = setTimeout(() => setRevealed(null), REVEAL_AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [revealed]);

  const detailQuery = useQuery({
    queryKey: ["admin", "cards", card?.id, "detail"],
    queryFn: () => staffApi.get<CardDetailDto>(`/admin/cards/${card!.id}`),
    enabled: !!card,
  });
  const detail = detailQuery.data;
  const address = detail?.billingAddress;

  const transactionsQuery = useQuery({
    queryKey: ["admin", "cards", card?.id, "transactions"],
    queryFn: () => staffApi.get<CardTransaction[]>(`/admin/cards/${card!.id}/transactions`),
    enabled: !!card,
  });

  const invalidateCards = () => queryClient.invalidateQueries({ queryKey: ["admin", "cards"] });

  const revealMutation = useMutation({
    mutationFn: () => staffApi.post<CardReveal>(`/admin/cards/${card!.id}/reveal`),
    onSuccess: setRevealed,
    onError: (e) => toast({ variant: "destructive", title: "Couldn't reveal virtual card", description: e instanceof ApiError ? e.message : undefined }),
  });

  const freezeMutation = useMutation({
    mutationFn: () => staffApi.post<CardDto>(`/admin/cards/${card!.id}/${card!.status === "FROZEN" ? "unfreeze" : "freeze"}`),
    onSuccess: (updated) => {
      toast({ title: updated.status === "FROZEN" ? "Virtual card frozen" : "Virtual card unfrozen" });
      invalidateCards();
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't update freeze state", description: e instanceof ApiError ? e.message : undefined }),
  });

  const terminateMutation = useMutation({
    mutationFn: () => staffApi.post<CardDto>(`/admin/cards/${card!.id}/terminate`),
    onSuccess: () => {
      toast({ title: "Virtual card terminated", description: "Any remaining balance is refunded to the wallet automatically." });
      invalidateCards();
      setTerminateArmed(false);
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't terminate virtual card", description: e instanceof ApiError ? e.message : undefined }),
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
              <SheetDescription>
                {card.customerName ?? "Unknown customer"} · Visa virtual card · USD
              </SheetDescription>
            </SheetHeader>

            <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/15 via-card to-card p-5 shadow-soft">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs uppercase text-muted-foreground">{card.network}</span>
                <Badge variant={STATUS_VARIANT[card.status] ?? "secondary"}>{card.status}</Badge>
              </div>
              <div className="mt-5">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Wallet className="h-3.5 w-3.5" /> Card balance
                </p>
                <div className="mt-1 flex items-center gap-2">
                  {detailQuery.isLoading ? (
                    <Skeleton className="h-8 w-32" />
                  ) : detailQuery.isError ? (
                    <span className="text-sm text-destructive">Balance unavailable</span>
                  ) : (
                    <span className="font-heading text-3xl font-semibold tracking-tight">{detail?.balance != null ? formatUsd(detail.balance) : "—"}</span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="Refresh balance"
                    aria-label="Refresh balance"
                    onClick={() => detailQuery.refetch()}
                    disabled={detailQuery.isFetching}
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${detailQuery.isFetching ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="font-mono text-lg tracking-widest">
                  {revealed?.cardNumber ? revealed.cardNumber.replace(/(.{4})/g, "$1 ").trim() : (detail?.maskedPan ?? `•••• •••• •••• ${card.last4 ?? "----"}`)}
                </p>
                {canManage && !isClosed && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => (revealed ? setRevealed(null) : revealMutation.mutate())}
                    disabled={revealMutation.isPending}
                    title={revealed ? "Hide card details" : "Reveal card number & CVV"}
                    aria-label={revealed ? "Hide card details" : "Reveal card number & CVV"}
                  >
                    {revealMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                )}
              </div>
              {revealed && (
                <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                  {revealed.expiry && <span>Exp {revealed.expiry}</span>}
                  {revealed.cvv && <span>CVV {revealed.cvv}</span>}
                  {revealed.cardNumber && (
                    <button
                      onClick={() => copy(revealed.cardNumber!.replace(/\s/g, ""), "Card number")}
                      className="inline-flex items-center gap-1 hover:text-primary"
                      title="Copy card number"
                    >
                      <Copy className="h-3 w-3" /> Copy number
                    </button>
                  )}
                  <span className="ml-auto">Hides automatically</span>
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-lg border border-border p-4 text-sm">
              {detailQuery.isLoading ? (
                <Skeleton className="h-24" />
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <DetailField label="Customer" value={card.customerName ?? "—"} />
                    <DetailField label="Cardholder" value={detail?.cardholderName ?? "—"} />
                    <DetailField label="Brand" value={detail?.cardBrand ?? card.network} className="capitalize" />
                    <DetailField label="Program" value={detail?.cardProgram ?? "—"} className="capitalize" />
                    <DetailField label="Spent this month" value={detail?.spentThisMonth ? formatUsd(detail.spentThisMonth) : "—"} />
                    <DetailField label="Added this month" value={detail?.toppedUpThisMonth ? formatUsd(detail.toppedUpThisMonth) : "—"} />
                    <DetailField label="Contactless" value={detail?.contactlessPayment == null ? "—" : detail.contactlessPayment ? "Enabled" : "Disabled"} />
                    <DetailField label="Issued" value={new Date(card.createdAt).toLocaleString()} />
                  </div>

                  <div className="space-y-2 border-t border-border pt-3">
                    <IdField label="Card ID" value={card.id} onCopy={copy} />
                    {card.yativoCardId && <IdField label="Issuer card ID" value={card.yativoCardId} onCopy={copy} />}
                    <IdField label="Customer ID" value={card.customerId} onCopy={copy} />
                  </div>

                  <div className="border-t border-border pt-3">
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" /> Billing address
                    </p>
                    {address && (address.line1 || address.city) ? (
                      <p className="mt-1 font-medium">
                        {address.line1}
                        {address.line2 ? `, ${address.line2}` : ""}
                        <br />
                        {[address.city, address.state, address.postalCode].filter(Boolean).join(", ")}
                        <br />
                        {address.country}
                      </p>
                    ) : (
                      <p className="mt-1 text-muted-foreground">{detailQuery.isError ? "Couldn't load from the card issuer" : "Not available"}</p>
                    )}
                  </div>
                </>
              )}
            </div>

            {canManage && !isClosed && (
              <div className="space-y-2">
                <Button variant="outline" className="w-full" onClick={() => freezeMutation.mutate()} disabled={freezeMutation.isPending}>
                  {freezeMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : card.status === "FROZEN" ? (
                    <>
                      <Sun className="h-4 w-4" /> Unfreeze virtual card
                    </>
                  ) : (
                    <>
                      <Snowflake className="h-4 w-4" /> Freeze virtual card
                    </>
                  )}
                </Button>
                <Button
                  variant={terminateArmed ? "destructive" : "outline"}
                  className="w-full"
                  onClick={() => (terminateArmed ? terminateMutation.mutate() : setTerminateArmed(true))}
                  disabled={terminateMutation.isPending}
                >
                  {terminateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                  {terminateArmed ? "Click again to confirm — this can't be undone" : "Terminate virtual card"}
                </Button>
                {terminateArmed && (
                  <button className="text-xs text-muted-foreground hover:underline" onClick={() => setTerminateArmed(false)}>
                    Cancel
                  </button>
                )}
              </div>
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
              ) : transactionsQuery.isError ? (
                <p className="text-sm text-destructive">Couldn't load transactions.</p>
              ) : !transactionsQuery.data || transactionsQuery.data.length === 0 ? (
                <p className="text-sm text-muted-foreground">No transactions yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {transactionsQuery.data.map((tx, i) => {
                    const isCredit = tx.type ? CREDIT_TRANSACTION_TYPES.has(tx.type.toLowerCase()) : false;
                    const merchant = typeof tx.raw.merchant === "string" ? tx.raw.merchant : undefined;
                    const title = tx.description ?? merchant ?? (tx.type ? humanize(tx.type) : "Transaction");
                    const date = tx.transactionDate ?? tx.createdAt;
                    return (
                      <div key={tx.id ?? i} className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5 text-sm">
                        <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${isCredit ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                          {tx.type === "fee" ? <Receipt className="h-3.5 w-3.5" /> : isCredit ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{title}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                            {tx.status && (
                              <Badge variant={TRANSACTION_STATUS_VARIANT[tx.status.toLowerCase()] ?? "secondary"} className="text-[10px] capitalize">
                                {tx.status}
                              </Badge>
                            )}
                            {date && <span>{new Date(date).toLocaleString()}</span>}
                            {tx.reference && <span className="font-mono">{tx.reference}</span>}
                            {tx.feeAmount && Number(tx.feeAmount) > 0 && tx.type !== "fee" && <span>Fee {formatUsd(tx.feeAmount)}</span>}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className={`font-mono font-medium ${isCredit ? "text-success" : "text-foreground"}`}>
                            {isCredit ? "+" : "-"}
                            {formatUsd(tx.amount)}
                          </p>
                          {tx.balanceAfter && <p className="text-xs text-muted-foreground">Bal {formatUsd(tx.balanceAfter)}</p>}
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

function DetailField({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-medium ${className ?? ""}`}>{value}</p>
    </div>
  );
}

function IdField({ label, value, onCopy }: { label: string; value: string; onCopy: (text: string, label: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="flex min-w-0 items-center gap-1">
        <span className="truncate font-mono text-xs">{value}</span>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" title={`Copy ${label}`} aria-label={`Copy ${label}`} onClick={() => onCopy(value, label)}>
          <Copy className="h-3 w-3" />
        </Button>
      </span>
    </div>
  );
}
