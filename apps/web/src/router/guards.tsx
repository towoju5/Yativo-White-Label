import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useStaffAuth } from "@/hooks/useStaffAuth";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { fetchBranding } from "@/theme/branding";

function FullScreenSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
    </div>
  );
}

export function RequireCustomerAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useCustomerAuth();
  const location = useLocation();

  if (isLoading) return <FullScreenSpinner />;
  if (!isAuthenticated) return <Navigate to="/portal/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

export function RequireStaffAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useStaffAuth();
  const location = useLocation();
  // Already cached by App.tsx's own fetch at boot — this just reads it, no extra request.
  const { data: branding } = useQuery({ queryKey: ["branding"], queryFn: fetchBranding });

  if (isLoading) return <FullScreenSpinner />;
  if (!isAuthenticated) {
    return <Navigate to={branding?.adminLoginPath ?? "/admin/login"} replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

export function RequireStaffRole({ roles, children }: { roles: Array<"OWNER" | "ADMIN" | "STAFF">; children: ReactNode }) {
  const { user } = useStaffAuth();
  if (user && !roles.includes(user.role)) {
    return (
      <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        You don't have permission to view this page.
      </div>
    );
  }
  return <>{children}</>;
}
