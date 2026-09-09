import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useStaffAuth } from "@/hooks/useStaffAuth";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import LandingPage from "@/pages/marketing/LandingPage";

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

  if (isLoading) return <FullScreenSpinner />;
  // Deliberately does not redirect to the configured admin login path: doing so would let anyone
  // discover the (possibly custom, meant-to-be-hidden) login URL just by hitting /admin unauthenticated.
  // Render the same thing an unknown route would, so /admin looks exactly like it doesn't exist.
  if (!isAuthenticated) return <LandingPage />;
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
