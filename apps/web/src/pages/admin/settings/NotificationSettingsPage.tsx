import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EMAIL_NOTIFICATION_CATALOG, type NotificationSettingsDto, type EmailNotificationType } from "@white-label/shared-types";
import { Mail, Save } from "lucide-react";
import { staffApi, ApiError } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { useStaffAuth } from "@/hooks/useStaffAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const GROUPS = Array.from(new Set(EMAIL_NOTIFICATION_CATALOG.map((c) => c.group)));

export default function NotificationSettingsPage() {
  const { toast } = useToast();
  const { user } = useStaffAuth();
  const queryClient = useQueryClient();
  const canEdit = user?.role === "OWNER" || user?.role === "ADMIN";

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "notification-settings"],
    queryFn: () => staffApi.get<NotificationSettingsDto>("/admin/settings/notifications"),
  });

  const [disabled, setDisabled] = useState<Set<EmailNotificationType> | null>(null);

  useEffect(() => {
    if (data && !disabled) setDisabled(new Set(data.disabledTypes));
  }, [data, disabled]);

  const saveMutation = useMutation({
    mutationFn: (disabledTypes: EmailNotificationType[]) => staffApi.patch<NotificationSettingsDto>("/admin/settings/notifications", { disabledTypes }),
    onSuccess: (saved) => {
      toast({ title: "Notification settings saved" });
      queryClient.setQueryData(["admin", "notification-settings"], saved);
      setDisabled(new Set(saved.disabledTypes));
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't save notification settings", description: e instanceof ApiError ? e.message : undefined }),
  });

  if (isLoading || !disabled) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const toggle = (type: EmailNotificationType, enabled: boolean) => {
    setDisabled((prev) => {
      const next = new Set(prev);
      if (enabled) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Notifications</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Choose which transactional emails customers receive.</p>
      </div>

      <div className="space-y-6">
        {GROUPS.map((group) => (
          <Card key={group}>
            <CardHeader>
              <CardTitle className="text-base">{group}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {EMAIL_NOTIFICATION_CATALOG.filter((c) => c.group === group).map((c) => (
                <div key={c.type} className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
                  <div>
                    <p className="text-sm font-medium">{c.label}</p>
                    <p className="text-xs text-muted-foreground">{c.description}</p>
                  </div>
                  <Switch checked={!disabled.has(c.type)} disabled={!canEdit} onCheckedChange={(v) => toggle(c.type, v)} />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <Button onClick={() => saveMutation.mutate(Array.from(disabled))} disabled={!canEdit || saveMutation.isPending} title={canEdit ? undefined : "Only owners and admins can change notification settings"}>
        <Save className="h-4 w-4" /> {saveMutation.isPending ? "Saving…" : "Save notification settings"}
      </Button>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Mail className="h-3.5 w-3.5" /> Manage the wording of these emails from Settings → Email templates.
      </p>
    </div>
  );
}
