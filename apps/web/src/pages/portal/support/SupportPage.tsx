import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Mail, ExternalLink, Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { SupportTicketListItem, SupportTicketDetail, SupportTicketStatus } from "@white-label/shared-types";
import { fetchBranding, fetchSupportPages } from "@/theme/branding";
import { portalApi, ApiError } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { useSupportTicketRealtime } from "@/hooks/useSupportTicketRealtime";
import { playChatBeep } from "@/lib/chatSound";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const STATUS_VARIANT: Record<SupportTicketStatus, "success" | "warning" | "destructive" | "secondary"> = {
  OPEN: "warning",
  IN_PROGRESS: "secondary",
  RESOLVED: "success",
  CLOSED: "secondary",
};

function MyTicketsCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: tickets, isLoading } = useQuery({
    queryKey: ["portal", "support", "tickets"],
    queryFn: () => portalApi.get<SupportTicketListItem[]>("/portal/support/tickets"),
  });

  const { data: detail } = useQuery({
    queryKey: ["portal", "support", "tickets", openTicketId],
    queryFn: () => portalApi.get<SupportTicketDetail>(`/portal/support/tickets/${openTicketId}`),
    enabled: !!openTicketId,
  });

  // Instant delivery: the server publishes every new message (staff or the customer's own, from
  // whichever tab/device sent it) over the ticket's realtime channel the moment it's persisted —
  // patched straight into the cache here rather than waiting on the mutation's own response or a
  // refetch, and de-duped by message id since a message this tab just sent arrives both ways.
  useSupportTicketRealtime(openTicketId, "portal", (msg) => {
    queryClient.setQueryData<SupportTicketDetail | undefined>(["portal", "support", "tickets", openTicketId], (prev) => {
      if (!prev || prev.messages.some((m) => m.id === msg.message.id)) return prev;
      return { ...prev, status: msg.status as SupportTicketStatus, messages: [...prev.messages, msg.message] };
    });
    queryClient.invalidateQueries({ queryKey: ["portal", "support", "tickets"] });
    if (msg.message.authorType === "STAFF") playChatBeep();
  });

  const replyMutation = useMutation({
    mutationFn: (body: string) => portalApi.post<SupportTicketDetail>(`/portal/support/tickets/${openTicketId}/messages`, { body }),
    onSuccess: () => setReply(""),
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [detail?.messages.length]);

  if (!isLoading && (tickets ?? []).length === 0) return null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("support.yourTickets", "Your tickets")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <Skeleton className="h-16" />
          ) : (
            (tickets ?? []).map((ticket) => (
              <button
                key={ticket.id}
                onClick={() => setOpenTicketId(ticket.id)}
                className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2.5 text-left text-sm hover:bg-muted"
              >
                <span className="truncate pr-2">{ticket.subject}</span>
                <Badge variant={STATUS_VARIANT[ticket.status]}>{ticket.status.replace("_", " ")}</Badge>
              </button>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={!!openTicketId} onOpenChange={(open) => !open && setOpenTicketId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{detail?.subject}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4">
              <div className="max-h-72 space-y-3 overflow-y-auto rounded-lg border border-border p-3">
                {detail.messages.map((m) => (
                  <div key={m.id} className={m.authorType === "STAFF" ? "mr-6 rounded-md bg-muted p-2.5" : "ml-6 rounded-md bg-primary/10 p-2.5"}>
                    <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-medium">{m.authorType === "STAFF" ? m.authorName : t("support.you", "You")}</span>
                      <span>{new Date(m.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm">{m.body}</p>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
              {detail.status !== "CLOSED" && (
                <div className="space-y-2">
                  <Textarea rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t("support.replyPlaceholder", "Write a reply…")} />
                  <Button size="sm" disabled={!reply.trim() || replyMutation.isPending} onClick={() => replyMutation.mutate(reply)}>
                    <Send className="h-3.5 w-3.5" /> {replyMutation.isPending ? t("support.sending", "Sending…") : t("support.send", "Send message")}
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function SupportPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const { data: branding } = useQuery({ queryKey: ["branding"], queryFn: fetchBranding, staleTime: Infinity });
  const { data: faqPages } = useQuery({ queryKey: ["pages", "support"], queryFn: fetchSupportPages });

  const ticketMutation = useMutation({
    mutationFn: () => portalApi.post<{ submitted: boolean; id: string }>("/portal/support/tickets", { subject, message }),
    onSuccess: () => {
      toast({ title: t("support.ticketSent", "Message sent — we'll get back to you here and by email") });
      setSubject("");
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["portal", "support", "tickets"] });
    },
    onError: (e) => toast({ variant: "destructive", title: t("support.ticketError", "Couldn't send your message"), description: e instanceof ApiError ? e.message : undefined }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{t("support.title", "Support")}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{t("support.subtitle", "Get help, chat with us, or browse frequently asked questions")}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("support.contact", "Contact us")}</CardTitle>
          </CardHeader>
          <CardContent>
            {branding?.supportEmail ? (
              <a href={`mailto:${branding.supportEmail}`} className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
                <Mail className="h-4 w-4" /> {branding.supportEmail}
              </a>
            ) : (
              <p className="text-sm text-muted-foreground">{t("support.noEmail", "Use the form below to reach us")}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("support.liveChat", "Live chat")}</CardTitle>
          </CardHeader>
          <CardContent>
            {branding?.liveChatEnabled ? (
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="success">{t("support.chatOnline", "Online")}</Badge>
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <MessageCircle className="h-4 w-4" /> {t("support.chatHint", "Use the chat bubble in the corner to talk to us live")}
                </span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("support.chatUnavailable", "Live chat isn't available right now")}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <MyTicketsCard />

      {faqPages && faqPages.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("support.faq", "Frequently asked questions")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {faqPages.map((p) => (
              <Link key={p.slug} to={`/${p.slug}`} target="_blank" className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">
                {p.title}
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("support.sendMessage", "Send us a message")}</CardTitle>
          <CardDescription>{t("support.sendMessageDescription", "We'll reply to the email on your account")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="subject">{t("support.subject", "Subject")}</Label>
            <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t("support.subjectPlaceholder", "What do you need help with?")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="message">{t("support.message", "Message")}</Label>
            <Textarea id="message" rows={5} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t("support.messagePlaceholder", "Describe your issue…")} />
          </div>
          <Button disabled={!subject.trim() || !message.trim() || ticketMutation.isPending} onClick={() => ticketMutation.mutate()}>
            {ticketMutation.isPending ? t("support.sending", "Sending…") : t("support.send", "Send message")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
