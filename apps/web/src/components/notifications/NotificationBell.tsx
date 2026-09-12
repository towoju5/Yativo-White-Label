import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Bell } from "lucide-react";
import type { NotificationDto } from "@white-label/shared-types";
import { portalApi } from "@/lib/api-client";
import type { Paginated } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 8;

/** Notification bell + dropdown shared by every white-label template's Topbar — backs onto the real /portal/notifications endpoints (see portalNotifications.routes.ts), not a decorative placeholder. */
export function NotificationBell() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const unreadQuery = useQuery({
    queryKey: ["portal", "notifications", "unread-count"],
    queryFn: () => portalApi.get<{ count: number }>("/portal/notifications/unread-count"),
    refetchInterval: 60_000,
  });

  const listQuery = useQuery({
    queryKey: ["portal", "notifications", "list"],
    queryFn: () => portalApi.get<Paginated<NotificationDto>>("/portal/notifications", { page: 1, pageSize: PAGE_SIZE }),
    enabled: open,
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => portalApi.post("/portal/notifications/read-all", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal", "notifications"] });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => portalApi.post(`/portal/notifications/${id}/read`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal", "notifications"] });
    },
  });

  const unreadCount = unreadQuery.data?.count ?? 0;
  const items = listQuery.data?.items ?? [];

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={t("topbar.prime.notifications", "Notifications")}
          title={t("topbar.prime.notifications", "Notifications")}
          className="relative rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-destructive text-[9px] font-semibold text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-2 py-1.5">
          <DropdownMenuLabel className="p-0">{t("notifications.title", "Notifications")}</DropdownMenuLabel>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => markAllReadMutation.mutate()}>
              {t("notifications.markAllRead", "Mark all read")}
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-80 overflow-y-auto">
          {listQuery.isLoading ? (
            <p className="p-4 text-center text-sm text-muted-foreground">{t("notifications.loading", "Loading…")}</p>
          ) : items.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">{t("notifications.empty", "You're all caught up.")}</p>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                onClick={() => !n.readAt && markReadMutation.mutate(n.id)}
                className={cn(
                  "flex w-full flex-col gap-0.5 border-b border-border px-3 py-2.5 text-left last:border-0 hover:bg-muted/50",
                  !n.readAt && "bg-primary/5",
                )}
              >
                <div className="flex items-center gap-2">
                  {!n.readAt && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                  <p className="truncate text-sm font-medium">{n.title}</p>
                </div>
                <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                <p className="text-[10px] text-muted-foreground">{new Date(n.createdAt).toLocaleString()}</p>
              </button>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
