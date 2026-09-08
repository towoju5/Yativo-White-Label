import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EMAIL_NOTIFICATION_CATALOG, type EmailTemplateDto, type EmailNotificationType } from "@white-label/shared-types";
import { Send, Save, RotateCcw } from "lucide-react";
import { staffApi, ApiError } from "@/lib/api-client";
import { fetchBranding } from "@/theme/branding";
import { useToast } from "@/hooks/use-toast";
import { useStaffAuth } from "@/hooks/useStaffAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const GROUPS = Array.from(new Set(EMAIL_NOTIFICATION_CATALOG.map((c) => c.group)));

// Mirrors the sample data notifications.service.ts's renderSampleEmail uses server-side — kept
// only for a live client-side preview; the actual "Send test" button hits the real endpoint.
const SAMPLE_VARS: Record<string, string> = {
  firstName: "Alex",
  productName: "Your Product",
  supportEmail: "support@example.com",
  reason: "Document image was too blurry to read",
  amount: "250.00",
  currency: "USD",
  sourceAmount: "100.00",
  sourceCurrency: "USD",
  targetAmount: "92.30",
  targetCurrency: "EUR",
  last4: "4242",
  merchant: "Example Store",
  passkeyName: "MacBook Touch ID",
  beneficiaryName: "Jane's Checking Account",
};

function renderPreview(template: string, extraVars: Record<string, string>): string {
  const vars = { ...SAMPLE_VARS, ...extraVars };
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => vars[key] ?? match);
}

export default function EmailTemplatesSettingsPage() {
  const { toast } = useToast();
  const { user } = useStaffAuth();
  const queryClient = useQueryClient();
  const canEdit = user?.role === "OWNER" || user?.role === "ADMIN";

  const [selectedType, setSelectedType] = useState<EmailNotificationType>(EMAIL_NOTIFICATION_CATALOG[0]!.type);
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [testEmail, setTestEmail] = useState("");

  const { data: templates, isLoading } = useQuery({
    queryKey: ["admin", "email-templates"],
    queryFn: () => staffApi.get<EmailTemplateDto[]>("/admin/settings/email-templates"),
  });

  // Same query key BrandingSettingsPage uses — shares its cache, so this reflects exactly what a
  // real send will look like (logo-or-name, and the actual primary/secondary colors) without a
  // second round trip if that page was already visited this session.
  const { data: branding } = useQuery({ queryKey: ["branding"], queryFn: fetchBranding });
  const previewBrandVars: Record<string, string> = {
    productName: branding?.productName ?? "Your Product",
    brandColorFrom: branding?.primaryColor ?? "#4f46e5",
    brandColorTo: branding?.secondaryColor ?? "#6366f1",
    brandMark: branding?.logoUrl
      ? `<img src="${branding.logoUrl}" alt="${branding.productName}" style="max-height: 40px; max-width: 240px; width: auto; height: auto; display: inline-block;" />`
      : `<span style="font-family: -apple-system, Helvetica, Arial, sans-serif; font-size: 20px; font-weight: 700; color: #111827;">${branding?.productName ?? "Your Product"}</span>`,
  };

  const selected = templates?.find((t) => t.type === selectedType);
  const catalogEntry = EMAIL_NOTIFICATION_CATALOG.find((c) => c.type === selectedType)!;

  useEffect(() => {
    if (selected) {
      setSubject(selected.subject);
      setBodyHtml(selected.bodyHtml);
    }
  }, [selected]);

  const saveMutation = useMutation({
    mutationFn: () => staffApi.patch<EmailTemplateDto>(`/admin/settings/email-templates/${selectedType}`, { subject, bodyHtml }),
    onSuccess: (updated) => {
      toast({ title: "Template saved" });
      queryClient.setQueryData<EmailTemplateDto[]>(["admin", "email-templates"], (prev) => prev?.map((t) => (t.type === updated.type ? updated : t)));
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't save template", description: e instanceof ApiError ? e.message : undefined }),
  });

  const resetMutation = useMutation({
    mutationFn: () => staffApi.del<EmailTemplateDto>(`/admin/settings/email-templates/${selectedType}`),
    onSuccess: (reset) => {
      toast({ title: "Reset to the current default design" });
      queryClient.setQueryData<EmailTemplateDto[]>(["admin", "email-templates"], (prev) => prev?.map((t) => (t.type === reset.type ? reset : t)));
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't reset template", description: e instanceof ApiError ? e.message : undefined }),
  });

  const resetAllMutation = useMutation({
    mutationFn: () => staffApi.post<EmailTemplateDto[]>("/admin/settings/email-templates/reset-all"),
    onSuccess: (all) => {
      toast({ title: "All templates reset to the current default design" });
      queryClient.setQueryData(["admin", "email-templates"], all);
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't reset templates", description: e instanceof ApiError ? e.message : undefined }),
  });

  const testMutation = useMutation({
    mutationFn: () => staffApi.post(`/admin/settings/email-templates/${selectedType}/test`, testEmail ? { to: testEmail } : undefined),
    onSuccess: () => toast({ title: "Test email sent", description: testEmail ? `Sent to ${testEmail}.` : "Check your staff account's inbox." }),
    onError: (e) => toast({ variant: "destructive", title: "Couldn't send test email", description: e instanceof ApiError ? e.message : undefined }),
  });

  if (isLoading || !templates) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Email templates</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Customize the subject and design of each transactional email.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (window.confirm("Reset ALL email templates to the current default design? Any customizations you've made will be lost.")) {
              resetAllMutation.mutate();
            }
          }}
          disabled={!canEdit || resetAllMutation.isPending}
          title={canEdit ? "Discards every customization and reverts every template to the built-in design" : "Only owners and admins can reset templates"}
        >
          <RotateCcw className="h-4 w-4" /> Reset all to default
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <nav className="space-y-5">
          {GROUPS.map((group) => (
            <div key={group}>
              <p className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</p>
              <div className="space-y-0.5">
                {EMAIL_NOTIFICATION_CATALOG.filter((c) => c.group === group).map((c) => (
                  <button
                    key={c.type}
                    type="button"
                    onClick={() => setSelectedType(c.type)}
                    className={cn(
                      "w-full rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
                      c.type === selectedType ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{catalogEntry.label}</CardTitle>
            <CardDescription>
              {catalogEntry.description}
              {catalogEntry.variables.length > 0 && (
                <span className="mt-1 block">
                  Available variables:{" "}
                  {["firstName", "productName", "supportEmail", ...catalogEntry.variables].map((v) => (
                    <code key={v} className="mr-1 rounded bg-muted px-1 py-0.5 text-xs">{`{{${v}}}`}</code>
                  ))}
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="subject">Subject</Label>
              <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!canEdit} />
            </div>

            <Tabs defaultValue="edit">
              <TabsList>
                <TabsTrigger value="edit">HTML</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
              </TabsList>
              <TabsContent value="edit">
                <Textarea value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} disabled={!canEdit} className="min-h-[360px] font-mono text-sm" />
              </TabsContent>
              <TabsContent value="preview">
                <iframe
                  title="Email preview"
                  sandbox=""
                  srcDoc={`<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#f4f4f5;padding:24px 0;">${renderPreview(bodyHtml, previewBrandVars)}</body></html>`}
                  className="min-h-[360px] w-full rounded-lg border border-border bg-white"
                />
              </TabsContent>
            </Tabs>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <div className="flex items-center gap-2">
                <Input
                  type="email"
                  placeholder="Send to (defaults to your own email)"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  className="w-64"
                />
                <Button variant="outline" onClick={() => testMutation.mutate()} disabled={testMutation.isPending}>
                  <Send className="h-4 w-4" /> {testMutation.isPending ? "Sending…" : "Send test email"}
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (window.confirm(`Reset "${catalogEntry.label}" to the current default design? Any customization will be lost.`)) {
                      resetMutation.mutate();
                    }
                  }}
                  disabled={!canEdit || resetMutation.isPending}
                  title={canEdit ? undefined : "Only owners and admins can reset templates"}
                >
                  <RotateCcw className="h-4 w-4" /> Reset to default
                </Button>
                <Button
                  onClick={() => saveMutation.mutate()}
                  disabled={!canEdit || saveMutation.isPending}
                  title={canEdit ? undefined : "Only owners and admins can edit email templates"}
                >
                  <Save className="h-4 w-4" /> {saveMutation.isPending ? "Saving…" : "Save template"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
