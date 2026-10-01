import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import type { Customer, CustomerImportRun } from "@white-label/shared-types";
import { ChevronLeft, ChevronRight, Search, Download, Loader2, RotateCcw } from "lucide-react";
import { staffApi, ApiError } from "@/lib/api-client";
import type { Paginated } from "@/lib/types";
import { useStaffAuth } from "@/hooks/useStaffAuth";
import { useToast } from "@/hooks/use-toast";
import { useStaffPermission } from "@/hooks/useStaffPermission";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EndorsementProgressBadge } from "@/components/endorsements/EndorsementProgressBadge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PAGE_SIZE = 20;

/** "Import from Yativo" trigger + live status — polls while a run is in flight, stops once it settles. */
function ImportFromYativoButton() {
  const { user } = useStaffAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canImport = user?.role === "OWNER" || user?.role === "ADMIN" || (user?.permissions.includes("customers.import") ?? false);

  const runsQuery = useQuery({
    queryKey: ["admin", "customers", "import-runs"],
    queryFn: () => staffApi.get<CustomerImportRun[]>("/admin/customers/import-runs"),
    enabled: canImport,
    refetchInterval: (query) => (query.state.data?.[0]?.status === "RUNNING" ? 2000 : false),
  });
  const latestRun = runsQuery.data?.[0];
  const isRunning = latestRun?.status === "RUNNING";

  const triggerMutation = useMutation({
    mutationFn: () => staffApi.post<CustomerImportRun>("/admin/customers/import-from-yativo"),
    onSuccess: () => {
      toast({ title: "Import started", description: "Syncing customers from Yativo in the background…" });
      queryClient.invalidateQueries({ queryKey: ["admin", "customers", "import-runs"] });
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't start import", description: e instanceof ApiError ? e.message : undefined }),
  });

  if (!canImport) return null;

  return (
    <div className="flex items-center gap-3">
      {latestRun && (
        <span className="text-xs text-muted-foreground">
          {isRunning
            ? `Importing… ${latestRun.imported} imported, ${latestRun.skipped} skipped so far`
            : latestRun.status === "FAILED"
              ? `Last import failed: ${latestRun.error ?? "unknown error"}`
              : `Last import: ${latestRun.imported} added, ${latestRun.skipped} already existed`}
        </span>
      )}
      <Button variant="outline" size="sm" onClick={() => triggerMutation.mutate()} disabled={triggerMutation.isPending || isRunning}>
        {isRunning || triggerMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        Import from Yativo
      </Button>
    </div>
  );
}

export default function CustomersPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [kycStatus, setKycStatus] = useState<string>("ALL");
  const [status, setStatus] = useState<string>("ALL");
  const [view, setView] = useState<"current" | "deleted">("current");
  const [page, setPage] = useState(1);
  const showingDeleted = view === "deleted";

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canDelete = useStaffPermission("customers.delete");
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin", "customers", { search, kycStatus, status, view, page }],
    queryFn: () =>
      staffApi.get<Paginated<Customer>>("/admin/customers", {
        search: search || undefined,
        kycStatus: kycStatus === "ALL" ? undefined : kycStatus,
        status: status === "ALL" ? undefined : status,
        deleted: showingDeleted ? "true" : undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => staffApi.post<Customer>(`/admin/customers/${id}/restore`),
    onSuccess: (c) => {
      toast({ title: "Customer restored", description: `${c.fullName ?? c.businessName ?? c.email} can sign in again.` });
      queryClient.invalidateQueries({ queryKey: ["admin", "customers"] });
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't restore customer", description: e instanceof ApiError ? e.message : undefined }),
  });
  useEffect(() => {
    if (isError) {
      toast({ variant: "destructive", title: "Couldn't load customers", description: error instanceof ApiError ? error.message : undefined });
    }
  }, [isError]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Customers</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Onboard, review and manage your customers</p>
        </div>
        <ImportFromYativoButton />
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name or email…"
            className="pl-8"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Select
          value={kycStatus}
          onValueChange={(v) => {
            setKycStatus(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="KYC status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All KYC statuses</SelectItem>
            <SelectItem value="NOT_STARTED">Not started</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
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
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="FROZEN">Frozen</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={view}
          onValueChange={(v) => {
            setView(v as "current" | "deleted");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="View" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="current">Current customers</SelectItem>
            <SelectItem value="deleted">Deleted customers</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-dashed border-destructive/50 p-10 text-center text-sm">
          <p className="text-destructive">Couldn't load customers{error instanceof ApiError ? `: ${error.message}` : ""}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">{showingDeleted ? "No deleted customers match these filters" : "No customers match these filters"}</div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>KYC</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>{showingDeleted ? "Deleted" : "Joined"}</TableHead>
                {showingDeleted && canDelete && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate(`/admin/customers/${c.id}`)}>
                  <TableCell className="font-medium">
                    {c.fullName ?? c.businessName ?? "—"}
                    {c.source === "IMPORTED" && (
                      <Badge variant="secondary" className="ml-2 align-middle">
                        Imported
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.email}</TableCell>
                  <TableCell>{c.type}</TableCell>
                  <TableCell>
                    <EndorsementProgressBadge customer={c} />
                  </TableCell>
                  <TableCell>
                    <Badge variant={c.status === "ACTIVE" ? "success" : "destructive"}>{c.status}</Badge>
                  </TableCell>
                  {showingDeleted ? (
                    <TableCell className="text-muted-foreground">
                      <div>{c.deletedAt ? new Date(c.deletedAt).toLocaleDateString() : "—"}</div>
                      {c.deletionReason && (
                        <div className="max-w-56 truncate text-xs" title={c.deletionReason}>
                          {c.deletionReason}
                        </div>
                      )}
                    </TableCell>
                  ) : (
                    <TableCell className="text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</TableCell>
                  )}
                  {showingDeleted && canDelete && (
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        title="Restore this customer"
                        disabled={restoreMutation.isPending}
                        onClick={(e) => {
                          e.stopPropagation();
                          restoreMutation.mutate(c.id);
                        }}
                      >
                        {restoreMutation.isPending && restoreMutation.variables === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                        Restore
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="icon" title="Previous page" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {page} / {totalPages}
            </span>
            <Button variant="outline" size="icon" title="Next page" aria-label="Next page" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
