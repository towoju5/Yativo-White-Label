import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AdminAuditLogEntryDto } from "@white-label/shared-types";
import { ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { staffApi } from "@/lib/api-client";
import type { Paginated } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const PAGE_SIZE = 25;

export default function AuditLogPage() {
  const [target, setTarget] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AdminAuditLogEntryDto | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "audit-log", { target, page }],
    queryFn: () =>
      staffApi.get<Paginated<AdminAuditLogEntryDto>>("/admin/audit-log", {
        target: target || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
  });

  const items = data?.items ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Every admin-visible change, and who (or what) made it</p>
      </div>

      <input
        placeholder="Filter by target id (transaction, customer, staff member…)"
        value={target}
        onChange={(e) => {
          setTarget(e.target.value);
          setPage(1);
        }}
        className="h-10 w-full max-w-md rounded-md border border-input bg-background px-3 text-sm shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No audit log entries yet</div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead className="text-right">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge variant={entry.actorId === "system" ? "secondary" : "outline"}>{entry.actorLabel ?? entry.actorId}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{entry.action}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{entry.target}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => setSelected(entry)} disabled={!entry.metadata}>
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

      <Sheet open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{selected?.action}</SheetTitle>
          </SheetHeader>
          <p className="mt-2 text-sm text-muted-foreground">
            {selected?.actorLabel ?? selected?.actorId} · {selected ? new Date(selected.createdAt).toLocaleString() : ""}
          </p>
          <pre className="scrollbar-thin mt-4 max-h-[70vh] overflow-auto rounded-lg bg-muted p-4 font-mono text-xs">
            {selected ? JSON.stringify(selected.metadata, null, 2) : ""}
          </pre>
        </SheetContent>
      </Sheet>
    </div>
  );
}
