import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import type { AdminVirtualAccount } from "@white-label/shared-types";
import { ChevronLeft, ChevronRight, Landmark } from "lucide-react";
import { staffApi } from "@/lib/api-client";
import type { Paginated } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const PAGE_SIZE = 20;

/** The one identifier field most worth showing inline (account number/IBAN/etc.) — the rest vary too much by country/rail to fit a table column. */
function primaryIdentifier(identifiers: Record<string, unknown>): string {
  const candidates = ["accountNumber", "iban", "clabe", "pixKey"];
  for (const key of candidates) {
    const value = identifiers[key];
    if (typeof value === "string" && value) return value;
  }
  return "—";
}

export default function AdminVirtualAccountsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "virtual-accounts", { page }],
    queryFn: () => staffApi.get<Paginated<AdminVirtualAccount>>("/admin/virtual-accounts", { page, pageSize: PAGE_SIZE }),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Virtual accounts</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Every dedicated bank-transfer receiving account customers have provisioned, and who owns each one.</p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <Landmark className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No virtual accounts have been provisioned yet.</p>
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((a) => (
                <TableRow key={a.id} className="cursor-pointer" onClick={() => navigate(`/admin/customers/${a.customerId}`)}>
                  <TableCell className="font-medium">
                    {a.customerName ?? "—"}
                    <p className="text-xs font-normal text-muted-foreground">{a.customerEmail ?? "—"}</p>
                  </TableCell>
                  <TableCell>{a.currencyCode}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{primaryIdentifier(a.identifiers)}</TableCell>
                  <TableCell className="text-muted-foreground">{new Date(a.createdAt).toLocaleDateString()}</TableCell>
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
