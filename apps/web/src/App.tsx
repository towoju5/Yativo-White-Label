import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { fetchBranding, applyBrandingToDocument } from "@/theme/branding";
import { setStaffLoginPath } from "@/lib/api-client";
import { TemplateProvider } from "@/templates/TemplateProvider";
import { StaffAuthProvider } from "@/hooks/useStaffAuth";
import { CustomerAuthProvider } from "@/hooks/useCustomerAuth";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createRouter } from "@/router";

function SplashScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
    </div>
  );
}

export default function App() {
  const { data: branding, isLoading } = useQuery({ queryKey: ["branding"], queryFn: fetchBranding });

  useEffect(() => {
    if (branding) {
      applyBrandingToDocument(branding);
      setStaffLoginPath(branding.adminLoginPath);
    }
  }, [branding]);

  // Rebuilt only if the configured path actually changes — createBrowserRouter must not be
  // re-invoked on every render, since it owns its own history instance.
  const adminLoginPath = branding?.adminLoginPath ?? "/admin/login";
  const router = useMemo(() => createRouter(adminLoginPath), [adminLoginPath]);

  if (isLoading) return <SplashScreen />;

  const templateId = branding?.templateId ?? "nova";

  return (
    <TemplateProvider templateId={templateId}>
      <TooltipProvider>
        <StaffAuthProvider>
          <CustomerAuthProvider>
            <RouterProvider router={router} />
            <Toaster />
          </CustomerAuthProvider>
        </StaffAuthProvider>
      </TooltipProvider>
    </TemplateProvider>
  );
}
