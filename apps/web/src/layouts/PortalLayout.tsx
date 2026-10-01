import { Outlet } from "react-router-dom";
import { useTemplate } from "@/templates/useTemplate";
import { LiveChatWidget } from "@/components/LiveChatWidget";
import { EmailVerificationBanner } from "@/components/kyc/EmailVerificationBanner";
import { InstallAppBanner } from "@/components/pwa/InstallAppBanner";
import { DemoExpiryBanner } from "@/components/demo/DemoExpiryBanner";
import { PortalMenuGate } from "@/components/PortalMenuGate";

export default function PortalLayout() {
  const T = useTemplate();
  return (
    <T.PortalShell>
      <DemoExpiryBanner />
      <EmailVerificationBanner />
      <InstallAppBanner />
      <LiveChatWidget />
      <PortalMenuGate>
        <Outlet />
      </PortalMenuGate>
    </T.PortalShell>
  );
}
