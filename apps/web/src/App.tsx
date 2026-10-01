import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { fetchBranding, applyBrandingToDocument } from "@/theme/branding";
import { applyPwaManifest, registerServiceWorker } from "@/theme/pwa";
import { setStaffLoginPath } from "@/lib/api-client";
import { useDemoConfig } from "@/lib/demoConfig";
import { TemplateProvider } from "@/templates/TemplateProvider";
import { StaffAuthProvider } from "@/hooks/useStaffAuth";
import { CustomerAuthProvider } from "@/hooks/useCustomerAuth";
import { useRealtimeWalletBridge } from "@/hooks/useRealtimeWallets";
import { useNavLabelOverrides } from "@/hooks/useNavLabelOverrides";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GlobalLoadingBar } from "@/components/GlobalLoadingBar";
import { StepUpDialogHost } from "@/components/StepUpDialogHost";
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
  const { data: demoConfig, isLoading: demoConfigLoading } = useDemoConfig();
  useRealtimeWalletBridge();
  useNavLabelOverrides();

  useEffect(() => {
    if (branding) {
      applyBrandingToDocument(branding);
      applyPwaManifest(branding);
      setStaffLoginPath(branding.adminLoginPath);
    }
  }, [branding]);

  useEffect(() => {
    registerServiceWorker();
  }, []);

  // Rebuilt only if the configured path actually changes — createBrowserRouter must not be
  // re-invoked on every render, since it owns its own history instance.
  const adminLoginPath = branding?.adminLoginPath ?? "/admin/login";
  const demoLandingActive = demoConfig?.publicSignupEnabled ?? false;
  const router = useMemo(() => createRouter(adminLoginPath, demoLandingActive), [adminLoginPath, demoLandingActive]);

  // Waits for /demo/config too, so "/" doesn't flash the login page before swapping to the landing
  // page. Safe because useDemoConfig always resolves to data (a 404 = demo off) and never refetches
  // — see lib/demoConfig.ts for the reload loop this gate caused when a 404 was left as an error.
  if (isLoading || demoConfigLoading) return <SplashScreen />;

  const templateId = branding?.templateId ?? "nova";

  return (
    <TemplateProvider templateId={templateId}>
      <TooltipProvider>
        <StaffAuthProvider>
          <CustomerAuthProvider>
            <GlobalLoadingBar />
            <RouterProvider router={router} />
            <Toaster />
            <StepUpDialogHost />
          </CustomerAuthProvider>
        </StaffAuthProvider>
      </TooltipProvider>
    </TemplateProvider>
  );
}
