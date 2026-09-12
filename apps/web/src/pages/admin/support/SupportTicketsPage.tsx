import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminSupportTicketListItem, AdminSupportTicketDetail, SupportTicketStatus } from "@white-label/shared-types";
import { SUPPORT_TICKET_STATUSES } from "@white-label/shared-types";
import { Send } from "lucide-react";
import { staffApi, ApiError } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { useSupportTicketRealtime } from "@/hooks/useSupportTicketRealtime";
import { playChatBeep } from "@/lib/chatSound";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

const STATUS_VARIANT: Record<SupportTicketStatus, "success" | "warning" | "destructive" | "secondary"> = {
  OPEN: "warning",
  IN_PROGRESS: "secondary",
  RESOLVED: "success",
  CLOSED: "secondary",
};

export default function SupportTicketsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState("");

  const { data: tickets, isLoading } = useQuery({
    queryKey: ["admin", "support", "tickets", status],
    queryFn: () => staffApi.get<AdminSupportTicketListItem[]>("/admin/support/tickets", { status: status === "ALL" ? undefined : status }),
  });

  const { data: detail } = useQuery({
    queryKey: ["admin", "support", "tickets", selectedId],
    queryFn: () => staffApi.get<AdminSupportTicketDetail>(`/admin/support/tickets/${selectedId}`),
    enabled: !!selectedId,
  });

  // Same instant-delivery pattern as the portal side (see SupportPage.tsx) — the server publishes
  // every new message (from either side) the moment it's persisted.
  useSupportTicketRealtime(selectedId, "staff", (msg) => {
    queryClient.setQueryData<AdminSupportTicketDetail | undefined>(["admin", "support", "tickets", selectedId], (prev) => {
      if (!prev || prev.messages.some((m) => m.id === msg.message.id)) return prev;
      return { ...prev, status: msg.status as SupportTicketStatus, messages: [...prev.messages, msg.message] };
    });
    queryClient.invalidateQueries({ queryKey: ["admin", "support", "tickets", status] });
    if (msg.message.authorType === "CUSTOMER") playChatBeep();
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [detail?.messages.length]);

  const replyMutation = useMutation({
    mutationFn: (body: string) => staffApi.post<AdminSupportTicketDetail>(`/admin/support/tickets/${selectedId}/messages`, { body }),
    onSuccess: () => setReply(""),
    onError: (e) => toast({ variant: "destructive", title: "Couldn't send reply", description: e instanceof ApiError ? e.message : undefined }),
  });

  const statusMutation = useMutation({
    mutationFn: (next: SupportTicketStatus) => staffApi.patch<AdminSupportTicketDetail>(`/admin/support/tickets/${selectedId}/status`, { status: next }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "support", "tickets"] }),
    onError: (e) => toast({ variant: "destructive", title: "Couldn't update status", description: e instanceof ApiError ? e.message : undefined }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Support tickets</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Customer messages from the portal's Support page.</p>
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {SUPPORT_TICKET_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last reply</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={4}><Skeleton className="h-6" /></TableCell></TableRow>
              ))
            ) : (tickets ?? []).length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground">No tickets</TableCell></TableRow>
            ) : (
              (tickets ?? []).map((t) => (
                <TableRow key={t.id} className="cursor-pointer" onClick={() => setSelectedId(t.id)}>
                  <TableCell>
                    <div className="text-sm font-medium">{t.customerName}</div>
                    <div className="text-xs text-muted-foreground">{t.customerEmail}</div>
                  </TableCell>
                  <TableCell className="max-w-[260px] truncate">{t.subject}</TableCell>
                  <TableCell><Badge variant={STATUS_VARIANT[t.status]}>{t.status.replace("_", " ")}</Badge></TableCell>
                  <TableCell>
                    <div className="text-sm">{t.lastMessageAuthorType === "STAFF" ? (t.lastMessageAuthorName ?? "Support") : t.lastMessageAuthorType === "CUSTOMER" ? t.customerName : "—"}</div>
                    <div className="text-xs text-muted-foreground">{new Date(t.lastMessageAt).toLocaleString()}</div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={!!selectedId} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{detail?.subject}</SheetTitle>
          </SheetHeader>
          {detail && (
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">{detail.customerName} · {detail.customerEmail}</div>
                <Select value={detail.status} onValueChange={(v) => statusMutation.mutate(v as SupportTicketStatus)}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SUPPORT_TICKET_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3 rounded-lg border border-border p-3">
                {detail.messages.map((m) => (
                  <div key={m.id} className={m.authorType === "STAFF" ? "ml-6 rounded-md bg-primary/10 p-2.5" : "mr-6 rounded-md bg-muted p-2.5"}>
                    <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-medium">{m.authorType === "STAFF" ? m.authorName : detail.customerName}</span>
                      <span>{new Date(m.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm">{m.body}</p>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              <div className="space-y-2">
                <Textarea rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply…" />
                <Button size="sm" disabled={!reply.trim() || replyMutation.isPending} onClick={() => replyMutation.mutate(reply)}>
                  <Send className="h-3.5 w-3.5" /> {replyMutation.isPending ? "Sending…" : "Send reply"}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
