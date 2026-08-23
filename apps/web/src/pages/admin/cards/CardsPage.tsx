import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CardDto, CardReveal, AdminCardListItem, PaginatedResponse, Customer } from "@white-label/shared-types";
import { CreditCard, Eye, EyeOff, Plus, Snowflake, Sun, XCircle, Loader2 } from "lucide-react";
import { staffApi, ApiError } from "@/lib/api-client";
import type { Paginated } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SearchableSelect } from "@/pages/portal/kyc/kycShared";

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive"> = {
  ACTIVE: "success",
  FROZEN: "warning",
  CLOSED: "destructive",
};

export default function AdminCardsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [amount, setAmount] = useState("5.00");
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [revealedCard, setRevealedCard] = useState<CardReveal | null>(null);
  const [terminateArmedId, setTerminateArmedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "cards"],
    queryFn: () => staffApi.get<PaginatedResponse<AdminCardListItem>>("/admin/cards", { pageSize: 50 }),
  });

  const customersQuery = useQuery({
    queryKey: ["admin", "customers", "for-card-issue"],
    queryFn: () => staffApi.get<Paginated<Customer>>("/admin/customers", { page: 1, pageSize: 200 }),
    enabled: open,
  });
  const customerOptions = (customersQuery.data?.items ?? []).map((c) => ({
    value: c.id,
    label: `${c.fullName ?? c.businessName ?? c.email} — ${c.email}`,
  }));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin", "cards"] });

  const issueMutation = useMutation({
    mutationFn: () => staffApi.post<CardDto>("/admin/cards/issue", { customerId, amountMinor: Math.round(Number(amount) * 100).toString() }),
    onSuccess: () => {
      toast({ title: "Card issued" });
      invalidate();
      setOpen(false);
      setCustomerId("");
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't issue card", description: e instanceof ApiError ? e.message : undefined }),
  });

  const freezeMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => staffApi.post<CardDto>(`/admin/cards/${id}/${status === "FROZEN" ? "unfreeze" : "freeze"}`),
    onSuccess: (updated) => {
      toast({ title: updated.status === "FROZEN" ? "Card frozen" : "Card unfrozen" });
      invalidate();
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't update freeze state", description: e instanceof ApiError ? e.message : undefined }),
  });

  const revealMutation = useMutation({
    mutationFn: (id: string) => staffApi.post<CardReveal>(`/admin/cards/${id}/reveal`),
    onSuccess: (reveal, id) => {
      setRevealedId(id);
      setRevealedCard(reveal);
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't reveal card", description: e instanceof ApiError ? e.message : undefined }),
  });

  const terminateMutation = useMutation({
    mutationFn: (id: string) => staffApi.post<CardDto>(`/admin/cards/${id}/terminate`),
    onSuccess: () => {
      toast({ title: "Card terminated", description: "Any remaining balance is refunded to the wallet automatically." });
      invalidate();
      setTerminateArmedId(null);
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't terminate card", description: e instanceof ApiError ? e.message : undefined }),
  });

  const cards = data?.items ?? [];

  const hideRevealed = () => {
    setRevealedId(null);
    setRevealedCard(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Cards</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Platform-wide Visa virtual card issuance — USD only</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4" /> Issue card
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Issue a card</DialogTitle>
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
                {issueMutation.isPending ? "Issuing…" : "Issue card"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
          <p className="text-sm text-muted-foreground">No cards issued yet.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Network</TableHead>
              <TableHead>Number</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cards.map((c) => {
              const isRevealed = revealedId === c.id;
              return (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="text-sm">{c.customerName ?? "—"}</div>
                    <div className="font-mono text-xs text-muted-foreground">{c.customerId}</div>
                  </TableCell>
                  <TableCell>{c.network}</TableCell>
                  <TableCell className="font-mono">
                    {isRevealed && revealedCard?.cardNumber ? (
                      <span className="flex items-center gap-2">
                        {revealedCard.cardNumber.replace(/(.{4})/g, "$1 ").trim()}
                        {revealedCard.cvv && <span className="text-xs text-muted-foreground">CVV {revealedCard.cvv}</span>}
                      </span>
                    ) : (
                      `•••• ${c.last4 ?? "----"}`
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[c.status] ?? "secondary"}>{c.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {c.status !== "CLOSED" && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => (isRevealed ? hideRevealed() : revealMutation.mutate(c.id))}
                            disabled={revealMutation.isPending}
                            title={isRevealed ? "Hide" : "Reveal card number"}
                          >
                            {revealMutation.isPending && revealMutation.variables === c.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : isRevealed ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => freezeMutation.mutate({ id: c.id, status: c.status })}
                            disabled={freezeMutation.isPending}
                          >
                            {c.status === "FROZEN" ? <Sun className="h-3.5 w-3.5" /> : <Snowflake className="h-3.5 w-3.5" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={terminateArmedId === c.id ? "text-destructive" : ""}
                            onClick={() => (terminateArmedId === c.id ? terminateMutation.mutate(c.id) : setTerminateArmedId(c.id))}
                            disabled={terminateMutation.isPending}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            {terminateArmedId === c.id ? " Confirm" : ""}
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
