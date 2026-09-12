import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminBusinessSpendCardListItem, BusinessSpendCardDto, BusinessSpendCardWalletActionResult, PaginatedResponse, Customer } from "@white-label/shared-types";
import { CreditCard, Plus, Lock, Unlock, XCircle, Loader2, Settings2 } from "lucide-react";
import { staffApi, ApiError } from "@/lib/api-client";
import type { Paginated } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { useStaffPermission } from "@/hooks/useStaffPermission";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SearchableSelect } from "@/pages/portal/kyc/kycShared";

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive"> = {
  ACTIVE: "success",
  SUSPENDED: "warning",
  TERMINATED: "destructive",
};

export default function AdminBusinessSpendCardsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canManage = useStaffPermission("businessSpendCards.manage");
  const [issueOpen, setIssueOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [manageCard, setManageCard] = useState<AdminBusinessSpendCardListItem | null>(null);
  const [terminateArmedId, setTerminateArmedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "business-spend-cards"],
    queryFn: () => staffApi.get<PaginatedResponse<AdminBusinessSpendCardListItem>>("/admin/business-spend-cards", { pageSize: 50 }),
  });

  const customersQuery = useQuery({
    queryKey: ["admin", "customers", "for-business-spend-card-issue"],
    queryFn: () => staffApi.get<Paginated<Customer>>("/admin/customers", { page: 1, pageSize: 200 }),
    enabled: issueOpen,
  });
  const customerOptions = (customersQuery.data?.items ?? [])
    .filter((c) => c.type === "BUSINESS")
    .map((c) => ({ value: c.id, label: `${c.businessName ?? c.fullName ?? c.email} — ${c.email}` }));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin", "business-spend-cards"] });

  const issueMutation = useMutation({
    mutationFn: () => staffApi.post<BusinessSpendCardDto>("/admin/business-spend-cards", { customerId, cardType: "VIRTUAL" }),
    onSuccess: () => {
      toast({ title: "Business Spend Card issued" });
      invalidate();
      setIssueOpen(false);
      setCustomerId("");
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't issue card", description: e instanceof ApiError ? e.message : undefined }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "activate" | "suspend" | "terminate" }) =>
      staffApi.post<BusinessSpendCardDto>(`/admin/business-spend-cards/${id}/status`, { action }),
    onSuccess: () => {
      toast({ title: "Card updated" });
      invalidate();
      setTerminateArmedId(null);
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't update card", description: e instanceof ApiError ? e.message : undefined }),
  });

  const cards = data?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Business Spend Cards</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Platform-wide Business Spend Card issuance — business customers only</p>
        </div>
        {canManage && (
        <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4" /> Issue card
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Issue a Business Spend Card</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Business customer</Label>
                <SearchableSelect value={customerId} onChange={setCustomerId} options={customerOptions} placeholder="Select a business customer" isLoading={customersQuery.isLoading} />
                <p className="text-xs text-muted-foreground">Only business-type customers are eligible for this product.</p>
              </div>
            </div>
            <DialogFooter>
              <Button disabled={!customerId || issueMutation.isPending} onClick={() => issueMutation.mutate()}>
                {issueMutation.isPending ? "Issuing…" : "Issue card"}
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
          <p className="text-sm text-muted-foreground">No Business Spend Cards issued yet.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Card</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cards.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <div className="text-sm">{c.customerName ?? "—"}</div>
                  <div className="font-mono text-xs text-muted-foreground">{c.customerId}</div>
                </TableCell>
                <TableCell>{c.issuanceType}</TableCell>
                <TableCell className="font-mono">{c.maskedPan ?? "•••• •••• •••• ----"}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[c.status] ?? "secondary"}>{c.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {!canManage ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : c.status !== "TERMINATED" && (
                      <>
                        <Button variant="ghost" size="icon" title="Manage" onClick={() => setManageCard(c)}>
                          <Settings2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => statusMutation.mutate({ id: c.id, action: c.status === "SUSPENDED" ? "activate" : "suspend" })}
                          disabled={statusMutation.isPending}
                        >
                          {c.status === "SUSPENDED" ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={terminateArmedId === c.id ? "text-destructive" : ""}
                          onClick={() => (terminateArmedId === c.id ? statusMutation.mutate({ id: c.id, action: "terminate" }) : setTerminateArmedId(c.id))}
                          disabled={statusMutation.isPending}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          {terminateArmedId === c.id ? " Confirm" : ""}
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <ManageCardDialog card={manageCard} onClose={() => setManageCard(null)} onChanged={invalidate} />
    </div>
  );
}

function ManageCardDialog({ card, onClose, onChanged }: { card: AdminBusinessSpendCardListItem | null; onClose: () => void; onChanged: () => void }) {
  const { toast } = useToast();
  const [fundAmount, setFundAmount] = useState("10.00");
  const [withdrawAmount, setWithdrawAmount] = useState("10.00");
  const [pin, setPin] = useState("");
  const [monthlyLimit, setMonthlyLimit] = useState("2000");

  const walletMutation = useMutation({
    mutationFn: (action: "fund" | "withdraw") =>
      staffApi.post<BusinessSpendCardWalletActionResult>(`/admin/business-spend-cards/${card!.id}/wallet`, {
        action,
        amountMinor: Math.round(Number(action === "fund" ? fundAmount : withdrawAmount) * 100).toString(),
      }),
    onSuccess: (result, action) => {
      toast({ title: action === "fund" ? "Card funded" : "Withdrawal submitted", description: result.cardEmptied && !result.cardTerminated ? "Card emptied — automatic termination is still pending." : undefined });
      onChanged();
    },
    onError: (e) => toast({ variant: "destructive", title: "Action failed", description: e instanceof ApiError ? e.message : undefined }),
  });

  const pinMutation = useMutation({
    mutationFn: () => staffApi.post<BusinessSpendCardDto>(`/admin/business-spend-cards/${card!.id}/pin`, { pin }),
    onSuccess: () => {
      toast({ title: "PIN updated" });
      setPin("");
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't update PIN", description: e instanceof ApiError ? e.message : undefined }),
  });

  const limitsMutation = useMutation({
    mutationFn: () =>
      staffApi.put(`/admin/business-spend-cards/${card!.id}/limits`, {
        limits: [{ amountLimit: Number(monthlyLimit), timeUnit: "Monthly", operationName: "SPENDINGLIMIT" }],
      }),
    onSuccess: () => toast({ title: "Spending limit updated" }),
    onError: (e) => toast({ variant: "destructive", title: "Couldn't update limit", description: e instanceof ApiError ? e.message : undefined }),
  });

  return (
    <Dialog open={!!card} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        {card && (
          <>
            <DialogHeader>
              <DialogTitle>Manage {card.maskedPan ?? "card"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="admin-fund">Fund (USD)</Label>
                  <Input id="admin-fund" type="number" min="0.01" step="0.01" value={fundAmount} onChange={(e) => setFundAmount(e.target.value)} />
                  <Button size="sm" className="w-full" onClick={() => walletMutation.mutate("fund")} disabled={walletMutation.isPending}>
                    {walletMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add funds"}
                  </Button>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="admin-withdraw">Withdraw (USD)</Label>
                  <Input id="admin-withdraw" type="number" min="0.01" step="0.01" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} />
                  <Button size="sm" variant="outline" className="w-full" onClick={() => walletMutation.mutate("withdraw")} disabled={walletMutation.isPending}>
                    {walletMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Withdraw"}
                  </Button>
                </div>
              </div>

              <Separator />

              <div className="space-y-1.5">
                <Label htmlFor="admin-pin">Set PIN</Label>
                <div className="flex gap-2">
                  <Input id="admin-pin" type="password" inputMode="numeric" maxLength={6} placeholder="••••" value={pin} onChange={(e) => setPin(e.target.value)} />
                  <Button size="sm" onClick={() => pinMutation.mutate()} disabled={pin.length < 4 || pinMutation.isPending}>
                    {pinMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="admin-limit">Monthly spending limit (USD)</Label>
                <div className="flex gap-2">
                  <Input id="admin-limit" type="number" min="1" max="10000" value={monthlyLimit} onChange={(e) => setMonthlyLimit(e.target.value)} />
                  <Button size="sm" onClick={() => limitsMutation.mutate()} disabled={limitsMutation.isPending}>
                    {limitsMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
