import { Outlet } from "react-router-dom";
import { useTemplate } from "@/templates/useTemplate";

export default function PortalLayout() {
  const T = useTemplate();
  return (
    <T.PortalShell>
      <Outlet />
    </T.PortalShell>
  );
}
