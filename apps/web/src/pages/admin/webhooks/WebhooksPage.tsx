import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { WebhookEventDto } from "@white-label/shared-types";
import { WEBHOOK_PROCESSING_STATUSES } from "@white-label/shared-types";
import { ChevronLeft, ChevronRight, RefreshCw, Eye } from "lucide-react";
import { staffApi, ApiError } from "@/lib/api-client";
import type { Paginated } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const PAGE_SIZE = 20;

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  PROCESSED: "success",
  PENDING: "warning",
  FAILED: "destructive",
  IGNORED: "secondary",
};

export default function WebhooksPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [processingStatus, setProcessingStatus] = useState("ALL");
  const [eventType, setEventType] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<WebhookEventDto | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "webhooks", { processingStatus, eventType, page }],
    queryFn: () =>
      staffApi.get<Paginated<WebhookEventDto>>("/admin/webhooks", {
        processingStatus: processingStatus === "ALL" ? undefined : processingStatus,
        eventType: eventType || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
  });

  const items = data?.items ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  const replayMutation = useMutation({
    mutationFn: (id: string) => staffApi.post(`/admin/webhooks/${id}/replay`),
    onSuccess: () => {
      toast({ title: "Webhook replayed" });
      queryClient.invalidateQueries({ queryKey: ["admin", "webhooks"] });
    },
    onError: (e) => toast({ variant: "destructive", title: "Replay failed", description: e instanceof ApiError ? e.message : undefined }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Webhooks</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Inbound events from Yativo</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select
          value={processingStatus}
          onValueChange={(v) => {
            setProcessingStatus(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {WEBHOOK_PROCESSING_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input
          placeholder="Filter by event type…"
          value={eventType}
          onChange={(e) => {
            setEventType(e.target.value);
            setPage(1);
          }}
          className="h-10 w-56 rounded-md border border-input bg-background px-3 text-sm shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No webhook events yet</div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Received</TableHead>
                <TableHead>Event type</TableHead>
                <TableHead>Signature</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{new Date(w.receivedAt).toLocaleString()}</TableCell>
                  <TableCell className="font-mono text-xs">{w.eventType}</TableCell>
                  <TableCell>
                    <Badge variant={w.signatureValid ? "success" : "destructive"}>{w.signatureValid ? "valid" : "invalid"}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[w.processingStatus] ?? "secondary"}>{w.processingStatus}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setSelected(w)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => replayMutation.mutate(w.id)}
                        disabled={replayMutation.isPending}
                        title="Replay"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>
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
            <SheetTitle>{selected?.eventType}</SheetTitle>
          </SheetHeader>
          {selected?.errorMessage && <p className="mt-3 text-sm text-destructive">{selected.errorMessage}</p>}
          <pre className="scrollbar-thin mt-4 max-h-[70vh] overflow-auto rounded-lg bg-muted p-4 font-mono text-xs">
            {selected ? JSON.stringify(selected.payload, null, 2) : ""}
          </pre>
        </SheetContent>
      </Sheet>
    </div>
  );
}
