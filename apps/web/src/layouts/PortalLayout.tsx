import { Outlet } from "react-router-dom";
import { useTemplate } from "@/templates/useTemplate";
import { LiveChatWidget } from "@/components/LiveChatWidget";

export default function PortalLayout() {
  const T = useTemplate();
  return (
    <T.PortalShell>
      <LiveChatWidget />
      <Outlet />
    </T.PortalShell>
  );
}
