import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatMinorAmount, LEDGER_TRANSACTION_TYPES, LEDGER_TRANSACTION_STATUSES } from "@white-label/shared-types";
import { CheckCircle2, ChevronLeft, ChevronRight, Undo2 } from "lucide-react";
import { staffApi, ApiError } from "@/lib/api-client";
import type { AdminTransactionRow, Paginated } from "@/lib/types";
import { useStaffAuth } from "@/hooks/useStaffAuth";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  POSTED: "success",
  PENDING: "warning",
  REVERSED: "destructive",
};

export default function TransactionsPage() {
  const { user } = useStaffAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canAdjust = user?.role === "OWNER" || user?.role === "ADMIN";

  const [type, setType] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const [adjusting, setAdjusting] = useState<{ tx: AdminTransactionRow; action: "settle" | "reverse" } | null>(null);
  const [reason, setReason] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "transactions", { type, status, page }],
    queryFn: () =>
      staffApi.get<Paginated<AdminTransactionRow>>("/admin/transactions", {
        type: type === "ALL" ? undefined : type,
        status: status === "ALL" ? undefined : status,
        page,
        pageSize: PAGE_SIZE,
      }),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  const closeDialog = () => {
    setAdjusting(null);
    setReason("");
  };

  const adjustMutation = useMutation({
    mutationFn: () => {
      if (!adjusting) return Promise.reject(new Error("No transaction selected"));
      return staffApi.post(`/admin/transactions/${adjusting.tx.id}/${adjusting.action}`, { reason });
    },
    onSuccess: () => {
      toast({ title: adjusting?.action === "settle" ? "Transaction marked as posted" : "Transaction reversed" });
      queryClient.invalidateQueries({ queryKey: ["admin", "transactions"] });
      closeDialog();
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't adjust transaction", description: e instanceof ApiError ? e.message : undefined }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Transactions</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Platform-wide ledger activity</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select
          value={type}
          onValueChange={(v) => {
            setType(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All types</SelectItem>
            {LEDGER_TRANSACTION_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {LEDGER_TRANSACTION_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No transactions match these filters</div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                {canAdjust && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{new Date(tx.createdAt).toLocaleString()}</TableCell>
                  <TableCell className="text-xs uppercase text-muted-foreground">{tx.type}</TableCell>
                  <TableCell className="max-w-[260px] truncate">{tx.description ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{tx.customerEmail ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[tx.status] ?? "secondary"}>{tx.status}</Badge>
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-mono",
                      tx.direction === "CREDIT" ? "text-success" : tx.direction === "DEBIT" ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {tx.amountMinor !== undefined ? (
                      <>
                        {tx.direction === "CREDIT" ? "+" : tx.direction === "DEBIT" ? "-" : ""}
                        {formatMinorAmount(tx.amountMinor, 2)} {tx.currencyCode ?? ""}
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  {canAdjust && (
                    <TableCell className="text-right">
                      {tx.status !== "REVERSED" && (
                        <div className="flex justify-end gap-1">
                          {tx.status === "PENDING" && (
                            <Button variant="ghost" size="icon" title="Mark as posted" onClick={() => setAdjusting({ tx, action: "settle" })}>
                              <CheckCircle2 className="h-4 w-4 text-success" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" title="Reverse" onClick={() => setAdjusting({ tx, action: "reverse" })}>
                            <Undo2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {page} / {totalPages}
            </span>
            <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}

      <Dialog open={!!adjusting} onOpenChange={(v) => !v && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{adjusting?.action === "settle" ? "Mark transaction as posted" : "Reverse transaction"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {adjusting?.action === "settle"
                ? "Confirms this pending transaction actually happened, using its own original amount and accounts — for a hold stuck because a webhook never arrived."
                : adjusting?.tx.status === "PENDING"
                  ? "Releases this hold — no posted funds move, since a pending transaction was never posted."
                  : "Posts an offsetting entry that reverses this transaction's real effect."}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="reason">Reason (required)</Label>
              <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Confirmed via bank statement on 2026-08-22…" />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant={adjusting?.action === "reverse" ? "destructive" : "default"}
              disabled={!reason.trim() || adjustMutation.isPending}
              onClick={() => adjustMutation.mutate()}
            >
              {adjustMutation.isPending ? "Saving…" : adjusting?.action === "settle" ? "Mark as posted" : "Reverse"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
