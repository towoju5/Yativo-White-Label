import { Outlet } from "react-router-dom";
import { useTemplate } from "@/templates/useTemplate";
import { LiveChatWidget } from "@/components/LiveChatWidget";
import { KycStatusBanner } from "@/components/kyc/KycStatusBanner";
import { EmailVerificationBanner } from "@/components/kyc/EmailVerificationBanner";
import { InstallAppBanner } from "@/components/pwa/InstallAppBanner";

export default function PortalLayout() {
  const T = useTemplate();
  return (
    <T.PortalShell>
      <EmailVerificationBanner />
      <KycStatusBanner />
      <InstallAppBanner />
      <LiveChatWidget />
      <Outlet />
    </T.PortalShell>
  );
}
