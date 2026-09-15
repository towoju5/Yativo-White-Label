import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { EndorsementDisplaySetting, EndorsementDisplaySettingsResponse } from "@white-label/shared-types";
import { Plus, RotateCcw, Save } from "lucide-react";
import { staffApi, ApiError } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { useStaffAuth } from "@/hooks/useStaffAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

function formatServiceName(service: string) {
  return service.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function ServiceRow({
  service,
  override,
  canEdit,
}: {
  service: string;
  override: EndorsementDisplaySetting | undefined;
  canEdit: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [displayName, setDisplayName] = useState(override?.displayName ?? "");
  const [description, setDescription] = useState(override?.description ?? "");
  const [isVisible, setIsVisible] = useState(override?.isVisible ?? true);
  const [sortOrder, setSortOrder] = useState(override?.sortOrder ?? 0);

  useEffect(() => {
    setDisplayName(override?.displayName ?? "");
    setDescription(override?.description ?? "");
    setIsVisible(override?.isVisible ?? true);
    setSortOrder(override?.sortOrder ?? 0);
  }, [override]);

  const applyUpdate = (updated: EndorsementDisplaySetting | null) => {
    queryClient.setQueryData<EndorsementDisplaySettingsResponse>(["admin", "endorsement-settings"], (prev) => {
      if (!prev) return prev;
      const overrides = updated
        ? prev.overrides.some((o) => o.service === service)
          ? prev.overrides.map((o) => (o.service === service ? updated : o))
          : [...prev.overrides, updated]
        : prev.overrides.filter((o) => o.service !== service);
      return { ...prev, overrides };
    });
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      staffApi.put<EndorsementDisplaySetting>(`/admin/endorsement-settings/${service}`, {
        displayName: displayName.trim() || null,
        description: description.trim() || null,
        isVisible,
        sortOrder,
      }),
    onSuccess: (updated) => {
      toast({ title: `Saved display settings for "${formatServiceName(service)}"` });
      applyUpdate(updated);
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't save", description: e instanceof ApiError ? e.message : undefined }),
  });

  const resetMutation = useMutation({
    mutationFn: () => staffApi.del(`/admin/endorsement-settings/${service}`),
    onSuccess: () => {
      toast({ title: `Reset "${formatServiceName(service)}" to default` });
      applyUpdate(null);
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't reset", description: e instanceof ApiError ? e.message : undefined }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{override?.displayName || formatServiceName(service)}</CardTitle>
        <CardDescription>
          Service slug: <code className="rounded bg-muted px-1 py-0.5 text-xs">{service}</code>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
          <div className="space-y-1.5">
            <Label htmlFor={`name-${service}`}>Customer-facing name</Label>
            <Input
              id={`name-${service}`}
              placeholder={formatServiceName(service)}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`order-${service}`}>Sort order</Label>
            <Input
              id={`order-${service}`}
              type="number"
              className="w-24"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
              disabled={!canEdit}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`description-${service}`}>Description shown to customers</Label>
          <Textarea
            id={`description-${service}`}
            placeholder="Optional — explains what this verification is for."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!canEdit}
            className="min-h-[70px]"
          />
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
          <div className="flex items-center gap-2">
            <Switch id={`visible-${service}`} checked={isVisible} onCheckedChange={setIsVisible} disabled={!canEdit} />
            <Label htmlFor={`visible-${service}`} className="cursor-pointer font-normal">
              Show to customers
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => resetMutation.mutate()}
              disabled={!canEdit || !override || resetMutation.isPending}
              title={canEdit ? undefined : "Only owners and admins can edit endorsement display settings"}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset to default
            </Button>
            <Button size="sm" onClick={() => saveMutation.mutate()} disabled={!canEdit || saveMutation.isPending}>
              <Save className="h-3.5 w-3.5" /> {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function EndorsementSettingsPage() {
  const { toast } = useToast();
  const { user } = useStaffAuth();
  const queryClient = useQueryClient();
  const canEdit = user?.role === "OWNER" || user?.role === "ADMIN";
  const [newService, setNewService] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "endorsement-settings"],
    queryFn: () => staffApi.get<EndorsementDisplaySettingsResponse>("/admin/endorsement-settings"),
  });

  const addMutation = useMutation({
    mutationFn: (service: string) => staffApi.put<EndorsementDisplaySetting>(`/admin/endorsement-settings/${service}`, {}),
    onSuccess: (created) => {
      setNewService("");
      queryClient.setQueryData<EndorsementDisplaySettingsResponse>(["admin", "endorsement-settings"], (prev) =>
        prev
          ? {
              overrides: prev.overrides.some((o) => o.service === created.service) ? prev.overrides : [...prev.overrides, created],
              knownServices: prev.knownServices.includes(created.service) ? prev.knownServices : [...prev.knownServices, created.service].sort(),
            }
          : prev,
      );
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't add service", description: e instanceof ApiError ? e.message : undefined }),
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  const overridesByService = new Map(data.overrides.map((o) => [o.service, o]));
  const services = [...data.knownServices].sort((a, b) => {
    const orderA = overridesByService.get(a)?.sortOrder ?? 0;
    const orderB = overridesByService.get(b)?.sortOrder ?? 0;
    return orderA - orderB || a.localeCompare(b);
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Endorsements display</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Customize the name, description, and visibility of each verification service on the customer-facing endorsement checklist. This only
          controls what customers see — it never changes whether an endorsement is required to create a card, virtual account, or wallet.
        </p>
      </div>

      <div className="space-y-4">
        {services.map((service) => (
          <ServiceRow key={service} service={service} override={overridesByService.get(service)} canEdit={canEdit} />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a service</CardTitle>
          <CardDescription>
            Only needed for a service slug that hasn't shown up here yet — e.g. one seen on a customer's endorsement list in the Endorsements page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Input
              placeholder="e.g. faster_payments"
              value={newService}
              onChange={(e) => setNewService(e.target.value)}
              disabled={!canEdit}
              className="max-w-xs"
            />
            <Button
              variant="outline"
              onClick={() => addMutation.mutate(newService.trim())}
              disabled={!canEdit || !newService.trim() || addMutation.isPending}
              title={canEdit ? undefined : "Only owners and admins can edit endorsement display settings"}
            >
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
