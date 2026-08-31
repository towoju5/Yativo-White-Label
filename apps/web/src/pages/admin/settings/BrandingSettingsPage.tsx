import { useEffect, useState, type CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BrandingConfig, UpdateBrandingInput } from "@white-label/shared-types";
import { Check, Save } from "lucide-react";
import { fetchBranding, hexToHslTriplet } from "@/theme/branding";
import { staffApi, ApiError } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { useStaffAuth } from "@/hooks/useStaffAuth";
import { TEMPLATE_LIST } from "@/templates/TemplateProvider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Draft = Omit<UpdateBrandingInput, "templateId"> & { templateId: BrandingConfig["templateId"] };

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={HEX_RE.test(text) ? text : "#000000"}
          onChange={(e) => {
            setText(e.target.value);
            onChange(e.target.value);
          }}
          className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-background p-1"
        />
        <Input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (HEX_RE.test(e.target.value)) onChange(e.target.value);
          }}
          placeholder="#6366f1"
          className="font-mono"
        />
      </div>
    </div>
  );
}

export default function BrandingSettingsPage() {
  const { toast } = useToast();
  const { user } = useStaffAuth();
  const queryClient = useQueryClient();
  const canEdit = user?.role === "OWNER" || user?.role === "ADMIN";

  const { data, isLoading } = useQuery({ queryKey: ["branding"], queryFn: fetchBranding });

  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    if (data && !draft) {
      setDraft({
        productName: data.productName,
        logoUrl: data.logoUrl,
        logoUrlDark: data.logoUrlDark,
        logoInvertOnDark: data.logoInvertOnDark,
        faviconUrl: data.faviconUrl,
        templateId: data.templateId,
        primaryColor: data.primaryColor,
        secondaryColor: data.secondaryColor,
        accentColor: data.accentColor,
        supportEmail: data.supportEmail,
        liveChatEnabled: data.liveChatEnabled,
        liveChatCode: data.liveChatCode,
      });
    }
  }, [data, draft]);

  const saveMutation = useMutation({
    mutationFn: (input: UpdateBrandingInput) => staffApi.patch<BrandingConfig>("/admin/branding", input),
    onSuccess: (updated) => {
      toast({ title: "Branding saved" });
      queryClient.setQueryData(["branding"], updated);
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't save branding", description: e instanceof ApiError ? e.message : undefined }),
  });

  if (isLoading || !draft) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const previewVars: CSSProperties = {
    ["--brand-primary" as string]: hexToHslTriplet(draft.primaryColor ?? "#6366f1"),
    ["--brand-secondary" as string]: hexToHslTriplet(draft.secondaryColor ?? "#0ea5e9"),
    ["--brand-accent" as string]: hexToHslTriplet(draft.accentColor ?? "#22d3ee"),
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Branding</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Pick a template and colors for your whole deployment</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Template</CardTitle>
          <CardDescription>Structure and layout — nav placement, dashboard composition, landing page.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2" style={previewVars}>
            {TEMPLATE_LIST.map((t) => (
              <button
                key={t.id}
                onClick={() => setDraft((d) => (d ? { ...d, templateId: t.id } : d))}
                className={cn(
                  "group overflow-hidden rounded-xl border-2 text-left transition-colors",
                  draft.templateId === t.id ? "border-primary" : "border-border hover:border-primary/40",
                )}
              >
                <div className="h-36 w-full">
                  <t.PreviewThumbnail className="h-full w-full" />
                </div>
                <div className="flex items-center justify-between p-3">
                  <div>
                    <p className="text-sm font-semibold">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.description}</p>
                  </div>
                  {draft.templateId === t.id && (
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-3 w-3" />
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Identity</CardTitle>
            <CardDescription>Product name, colors, and contact details.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="productName">Product name</Label>
              <Input
                id="productName"
                value={draft.productName ?? ""}
                onChange={(e) => setDraft((d) => (d ? { ...d, productName: e.target.value } : d))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supportEmail">Support email</Label>
              <Input
                id="supportEmail"
                type="email"
                value={draft.supportEmail ?? ""}
                onChange={(e) => setDraft((d) => (d ? { ...d, supportEmail: e.target.value || null } : d))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="logoUrl">Logo URL</Label>
              <Input
                id="logoUrl"
                placeholder="https://…"
                value={draft.logoUrl ?? ""}
                onChange={(e) => setDraft((d) => (d ? { ...d, logoUrl: e.target.value || null } : d))}
              />
              <p className="text-xs text-muted-foreground">Once set, the logo replaces the product name text everywhere it's shown.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="logoUrlDark">Logo URL (dark mode)</Label>
              <Input
                id="logoUrlDark"
                placeholder="https://… (optional — leave blank to reuse the logo above)"
                value={draft.logoUrlDark ?? ""}
                onChange={(e) => setDraft((d) => (d ? { ...d, logoUrlDark: e.target.value || null } : d))}
              />
            </div>
            {!draft.logoUrlDark && (
              <div className="flex items-center gap-2.5">
                <Switch
                  checked={draft.logoInvertOnDark ?? false}
                  onCheckedChange={(checked) => setDraft((d) => (d ? { ...d, logoInvertOnDark: checked } : d))}
                />
                <Label>Invert the logo's colors in dark mode</Label>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-3">
              <ColorField label="Primary" value={draft.primaryColor ?? "#6366f1"} onChange={(v) => setDraft((d) => (d ? { ...d, primaryColor: v } : d))} />
              <ColorField
                label="Secondary"
                value={draft.secondaryColor ?? "#0ea5e9"}
                onChange={(v) => setDraft((d) => (d ? { ...d, secondaryColor: v } : d))}
              />
              <ColorField label="Accent" value={draft.accentColor ?? "#22d3ee"} onChange={(v) => setDraft((d) => (d ? { ...d, accentColor: v } : d))} />
            </div>
            <Button
              onClick={() => saveMutation.mutate(draft)}
              disabled={!canEdit || saveMutation.isPending}
              title={canEdit ? undefined : "Only owners and admins can change branding"}
            >
              <Save className="h-4 w-4" /> {saveMutation.isPending ? "Saving…" : "Save branding"}
            </Button>
          </CardContent>
        </Card>

        <Card style={previewVars}>
          <CardHeader>
            <CardTitle className="text-base">Live preview</CardTitle>
            <CardDescription>Updates instantly as you edit — save to apply for real.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-primary to-accent text-xs font-bold text-primary-foreground">
                {(draft.productName ?? "W").slice(0, 1)}
              </div>
              <span className="font-heading text-sm font-semibold">{draft.productName}</span>
            </div>
            <div className="h-32 overflow-hidden rounded-lg">
              {(() => {
                const T = TEMPLATE_LIST.find((t) => t.id === draft.templateId) ?? TEMPLATE_LIST[0];
                return T ? <T.PreviewThumbnail className="h-full w-full" /> : null;
              })()}
            </div>
            <div className="flex gap-2">
              <span className="h-8 flex-1 rounded-md bg-primary" />
              <span className="h-8 flex-1 rounded-md bg-secondary" />
              <span className="h-8 flex-1 rounded-md bg-accent" />
            </div>
            <Button className="w-full" size="sm" disabled>
              Primary action
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Live chat</CardTitle>
          <CardDescription>
            Paste a live-chat provider's embed snippet (e.g. tawk.to, Crisp, Intercom) and it's injected into the customer portal. Trusted, unsanitized — only owners and admins can set this.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2.5">
            <Switch
              checked={draft.liveChatEnabled ?? false}
              onCheckedChange={(checked) => setDraft((d) => (d ? { ...d, liveChatEnabled: checked } : d))}
            />
            <Label>Enable live chat on the portal</Label>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="liveChatCode">Embed snippet</Label>
            <Textarea
              id="liveChatCode"
              rows={8}
              className="font-mono text-xs"
              placeholder={'<script type="text/javascript">\n  // provider embed code\n</script>'}
              value={draft.liveChatCode ?? ""}
              onChange={(e) => setDraft((d) => (d ? { ...d, liveChatCode: e.target.value || null } : d))}
            />
          </div>
          <Button
            onClick={() => saveMutation.mutate(draft)}
            disabled={!canEdit || saveMutation.isPending}
            title={canEdit ? undefined : "Only owners and admins can change branding"}
          >
            <Save className="h-4 w-4" /> {saveMutation.isPending ? "Saving…" : "Save branding"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
