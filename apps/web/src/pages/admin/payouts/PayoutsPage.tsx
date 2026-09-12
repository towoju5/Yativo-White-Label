import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PayoutListItem } from "@white-label/shared-types";
import { formatMinorAmount } from "@white-label/shared-types";
import { ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { staffApi } from "@/lib/api-client";
import type { Paginated } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminTransactionDetailDialog } from "@/components/admin/AdminTransactionDetailDialog";

const PAGE_SIZE = 25;

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive"> = {
  POSTED: "success",
  PENDING: "warning",
  REVERSED: "destructive",
};

export default function AdminPayoutsPage() {
  const [page, setPage] = useState(1);
  const [viewingTransactionId, setViewingTransactionId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "payouts", page],
    queryFn: () => staffApi.get<Paginated<PayoutListItem>>("/admin/payouts", { page, pageSize: PAGE_SIZE }),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Payouts</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Outbound transfers across all customers</p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No payouts yet</div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Beneficiary</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{new Date(p.createdAt).toLocaleString()}</TableCell>
                  <TableCell>{p.customerName ?? <span className="font-mono text-xs text-muted-foreground">{p.customerId}</span>}</TableCell>
                  <TableCell>{p.beneficiaryName ?? <span className="font-mono text-xs text-muted-foreground">{p.beneficiaryId}</span>}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[p.status] ?? "secondary"}>{p.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatMinorAmount(p.amountMinor, 2)} {p.currencyCode}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" title="View details" onClick={() => setViewingTransactionId(p.transactionId)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
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

      <AdminTransactionDetailDialog transactionId={viewingTransactionId} onClose={() => setViewingTransactionId(null)} />
    </div>
  );
}
