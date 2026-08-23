import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReconciliationReportDto } from "@white-label/shared-types";
import { formatMinorAmount } from "@white-label/shared-types";
import { AlertTriangle, ChevronLeft, ChevronRight, PlayCircle } from "lucide-react";
import { staffApi, ApiError } from "@/lib/api-client";
import type { Paginated } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

export default function ReconciliationPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "reconciliation", page],
    queryFn: () => staffApi.get<Paginated<ReconciliationReportDto>>("/admin/reconciliation", { page, pageSize: PAGE_SIZE }),
  });

  const runMutation = useMutation({
    mutationFn: () => staffApi.post("/admin/reconciliation/run"),
    onSuccess: () => {
      toast({ title: "Reconciliation run started" });
      queryClient.invalidateQueries({ queryKey: ["admin", "reconciliation"] });
    },
    onError: (e) => toast({ variant: "destructive", title: "Run failed", description: e instanceof ApiError ? e.message : undefined }),
  });

  const items = data?.items ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  // Scoped to the current page — there's no separate summary endpoint to total mismatches across all pages.
  const mismatchCount = items.filter((r) => r.status === "MISMATCH").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Reconciliation</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Ledger vs. upstream settlement{" "}
            {mismatchCount > 0 && <span className="font-medium text-destructive">— {mismatchCount} mismatch{mismatchCount > 1 ? "es" : ""}</span>}
          </p>
        </div>
        <Button onClick={() => runMutation.mutate()} disabled={runMutation.isPending}>
          <PlayCircle className="h-4 w-4" /> {runMutation.isPending ? "Running…" : "Run now"}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No reconciliation reports yet</div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Expected</TableHead>
                <TableHead className="text-right">Actual</TableHead>
                <TableHead className="text-right">Delta</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((r) => (
                <TableRow key={r.id} className={cn(r.status === "MISMATCH" && "bg-destructive/5")}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</TableCell>
                  <TableCell className="font-mono text-xs">{r.currencyCode}</TableCell>
                  <TableCell className="text-xs uppercase text-muted-foreground">{r.accountType}</TableCell>
                  <TableCell className="text-right font-mono">{formatMinorAmount(r.expectedMinor, 2)}</TableCell>
                  <TableCell className="text-right font-mono">{formatMinorAmount(r.actualMinor, 2)}</TableCell>
                  <TableCell className={cn("text-right font-mono font-medium", r.status === "MISMATCH" ? "text-destructive" : "text-muted-foreground")}>
                    {formatMinorAmount(r.deltaMinor, 2)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.status === "MISMATCH" ? "destructive" : "success"} className="gap-1">
                      {r.status === "MISMATCH" && <AlertTriangle className="h-3 w-3" />}
                      {r.status}
                    </Badge>
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
    </div>
  );
}
