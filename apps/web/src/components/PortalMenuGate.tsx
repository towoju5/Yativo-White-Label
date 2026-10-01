import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { findPortalMenuForPath } from "@white-label/shared-types";
import { EyeOff } from "lucide-react";
import { usePortalMenus } from "@/hooks/usePortalMenus";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Blocks a portal page whose menu an admin switched off, so a bookmark or typed URL can't reach a hidden feature. */
export function PortalMenuGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { isPathEnabled, isLoading } = usePortalMenus();

  // An off-by-default page (Swap) would flash "unavailable" before the list arrives — wait instead.
  if (isLoading && findPortalMenuForPath(pathname)?.defaultEnabled === false) {
    return <Skeleton className="h-64" />;
  }
  if (isPathEnabled(pathname)) return <>{children}</>;

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <EyeOff className="h-6 w-6" />
        </div>
        <p className="font-heading text-lg font-semibold">{t("portalMenu.unavailableTitle", "Not available")}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{t("portalMenu.unavailableBody", "This feature isn't available on your account right now.")}</p>
        <Button asChild variant="outline">
          <Link to="/portal">{t("portalMenu.backHome", "Back to dashboard")}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
