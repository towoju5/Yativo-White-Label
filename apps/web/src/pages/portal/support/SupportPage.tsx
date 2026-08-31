import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MessageCircle, Mail, ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { fetchBranding, fetchSupportPages } from "@/theme/branding";
import { portalApi, ApiError } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export default function SupportPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const { data: branding } = useQuery({ queryKey: ["branding"], queryFn: fetchBranding, staleTime: Infinity });
  const { data: faqPages } = useQuery({ queryKey: ["pages", "support"], queryFn: fetchSupportPages });

  const ticketMutation = useMutation({
    mutationFn: () => portalApi.post<{ submitted: boolean }>("/portal/support/tickets", { subject, message }),
    onSuccess: () => {
      toast({ title: t("support.ticketSent", "Message sent — we'll get back to you by email") });
      setSubject("");
      setMessage("");
    },
    onError: (e) => toast({ variant: "destructive", title: t("support.ticketError", "Couldn't send your message"), description: e instanceof ApiError ? e.message : undefined }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{t("support.title", "Support")}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{t("support.subtitle", "Get help, chat with us, or browse frequently asked questions")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
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
