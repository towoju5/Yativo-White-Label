import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NavLabelOverride, NavLabelOverridesResponse } from "@white-label/shared-types";
import { Pencil, RotateCcw } from "lucide-react";
import { staffApi, ApiError } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { useStaffAuth } from "@/hooks/useStaffAuth";
import { SUPPORTED_LANGUAGES } from "@/i18n";
import { LANGUAGE_LABELS } from "@/components/LanguageSwitcher";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// The English default each key falls back to when no override exists — mirrors the second
// argument of that key's t() call in the template nav configs (apps/web/src/templates/*/PortalShell.tsx).
// Kept here by hand for the same reason KNOWN_NAV_LABEL_KEYS is hand-maintained on the API side.
const NAV_LABEL_DEFAULTS: Record<string, string> = {
  "nav.account": "Account",
  "nav.atlas.contacts": "Contacts",
  "nav.atlas.home": "Home",
  "nav.atlas.profile": "Profile",
  "nav.atlas.send": "Send",
  "nav.beneficiaries": "Beneficiaries",
  "nav.businessSpendCards": "Business Cards",
  "nav.cards": "Cards",
  "nav.cryptoWallets": "Crypto wallets",
  "nav.dashboard": "Dashboard",
  "nav.deposit": "Deposit",
  "nav.logout": "Log out",
  "nav.portal": "Portal",
  "nav.profileKyc": "Profile & KYC",
  "nav.section.account": "Account",
  "nav.section.manage": "Manage",
  "nav.sendMoney": "Withdraw",
  "nav.settings": "Settings",
  "nav.statements": "Statements",
  "nav.support": "Support",
  "nav.team": "Team",
  "nav.transactions": "Transactions",
  "nav.virtualAccounts": "Virtual accounts",
  "nav.wallets": "Wallets",
};

function defaultLabelFor(key: string): string {
  return NAV_LABEL_DEFAULTS[key] ?? key;
}

function EditLabelsDialog({
  navKey,
  override,
  open,
  onOpenChange,
}: {
  navKey: string;
  override: NavLabelOverride | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [translations, setTranslations] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) setTranslations(override?.translations ?? {});
  }, [open, override]);

  const applyUpdate = (updated: NavLabelOverride | null) => {
    queryClient.setQueryData<NavLabelOverridesResponse>(["admin", "nav-labels"], (prev) => {
      if (!prev) return prev;
      const overrides = updated
        ? prev.overrides.some((o) => o.key === navKey)
          ? prev.overrides.map((o) => (o.key === navKey ? updated : o))
          : [...prev.overrides, updated]
        : prev.overrides.filter((o) => o.key !== navKey);
      return { ...prev, overrides };
    });
  };

  const saveMutation = useMutation({
    mutationFn: () => staffApi.put<NavLabelOverride>(`/admin/nav-labels/${encodeURIComponent(navKey)}`, { translations }),
    onSuccess: (updated) => {
      toast({ title: "Saved menu label" });
      applyUpdate(updated);
      onOpenChange(false);
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't save", description: e instanceof ApiError ? e.message : undefined }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Rename "{defaultLabelFor(navKey)}"</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Leave a language blank to keep showing the default label for that language. This applies everywhere this menu item appears.
        </p>
        <div className="grid max-h-[60vh] grid-cols-1 gap-4 overflow-y-auto py-2 sm:grid-cols-2">
          {SUPPORTED_LANGUAGES.map((locale) => (
            <div key={locale} className="space-y-1.5">
              <Label htmlFor={`${navKey}-${locale}`}>{LANGUAGE_LABELS[locale]}</Label>
              <Input
                id={`${navKey}-${locale}`}
                placeholder={locale === "en" ? defaultLabelFor(navKey) : "Default"}
                value={translations[locale] ?? ""}
                onChange={(e) => setTranslations((prev) => ({ ...prev, [locale]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NavKeyRow({ navKey, override, canEdit }: { navKey: string; override: NavLabelOverride | undefined; canEdit: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  const resetMutation = useMutation({
    mutationFn: () => staffApi.del(`/admin/nav-labels/${encodeURIComponent(navKey)}`),
    onSuccess: () => {
      toast({ title: `Reset "${defaultLabelFor(navKey)}" to default` });
      queryClient.setQueryData<NavLabelOverridesResponse>(["admin", "nav-labels"], (prev) =>
        prev ? { ...prev, overrides: prev.overrides.filter((o) => o.key !== navKey) } : prev,
      );
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't reset", description: e instanceof ApiError ? e.message : undefined }),
  });

  const overriddenCount = override ? Object.keys(override.translations).length : 0;

  return (
    <TableRow>
      <TableCell className="font-medium">{defaultLabelFor(navKey)}</TableCell>
      <TableCell>
        <code className="rounded bg-muted px-1 py-0.5 text-xs">{navKey}</code>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {overriddenCount > 0 ? `Custom in ${overriddenCount} language${overriddenCount === 1 ? "" : "s"}` : "Default"}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditing(true)}
            disabled={!canEdit}
            title={canEdit ? undefined : "Only owners and admins can rename the customer menu"}
          >
            <Pencil className="h-3.5 w-3.5" /> Rename
          </Button>
          <Button variant="ghost" size="sm" onClick={() => resetMutation.mutate()} disabled={!canEdit || !override || resetMutation.isPending}>
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </Button>
        </div>
      </TableCell>
      <EditLabelsDialog navKey={navKey} override={override} open={editing} onOpenChange={setEditing} />
    </TableRow>
  );
}

export default function NavLabelsSettingsPage() {
  const { user } = useStaffAuth();
  const canEdit = user?.role === "OWNER" || user?.role === "ADMIN";

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "nav-labels"],
    queryFn: () => staffApi.get<NavLabelOverridesResponse>("/nav-labels"),
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const overridesByKey = new Map(data.overrides.map((o) => [o.key, o]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Customer menu</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Rename any item in the customer portal's navigation menu, with its own label per language. Applies across every layout template.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Menu items</CardTitle>
          <CardDescription>Renaming an item here changes what customers see everywhere it appears in the portal.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Menu item</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.knownKeys.map((key) => (
                <NavKeyRow key={key} navKey={key} override={overridesByKey.get(key)} canEdit={canEdit} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
