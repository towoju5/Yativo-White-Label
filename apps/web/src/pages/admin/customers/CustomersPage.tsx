import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import type { Customer, CustomerImportRun } from "@white-label/shared-types";
import { ChevronLeft, ChevronRight, Search, Download, Loader2 } from "lucide-react";
import { staffApi, ApiError } from "@/lib/api-client";
import type { Paginated } from "@/lib/types";
import { useStaffAuth } from "@/hooks/useStaffAuth";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

const KYC_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  APPROVED: "success",
  PENDING: "warning",
  REJECTED: "destructive",
  NOT_STARTED: "secondary",
};

export default function CustomersPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [kycStatus, setKycStatus] = useState<string>("ALL");
  const [status, setStatus] = useState<string>("ALL");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "customers", { search, kycStatus, status, page }],
    queryFn: () =>
      staffApi.get<Paginated<Customer>>("/admin/customers", {
        search: search || undefined,
        kycStatus: kycStatus === "ALL" ? undefined : kycStatus,
        status: status === "ALL" ? undefined : status,
        page,
        pageSize: PAGE_SIZE,
      }),
  });

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
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No customers match these filters</div>
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
                <TableHead>Joined</TableHead>
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
                    <Badge variant={KYC_VARIANT[c.kycStatus] ?? "secondary"}>{c.kycStatus.replace("_", " ")}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={c.status === "ACTIVE" ? "success" : "destructive"}>{c.status}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</TableCell>
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
