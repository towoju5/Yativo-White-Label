import { Outlet, useLocation } from "react-router-dom";
import { useTemplate } from "@/templates/useTemplate";

export default function AdminLayout() {
  const T = useTemplate();
  const { pathname } = useLocation();
  // The Endorsements page's two-pane customer list + checklist layout benefits from the full
  // viewport width every other admin page's standard content max-width would otherwise cap it at.
  const fullWidth = pathname === "/admin/endorsements";
  return (
    <T.AdminShell fullWidth={fullWidth}>
      <Outlet />
    </T.AdminShell>
  );
}
