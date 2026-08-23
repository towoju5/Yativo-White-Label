import { Outlet } from "react-router-dom";
import { useTemplate } from "@/templates/useTemplate";

export default function AdminLayout() {
  const T = useTemplate();
  return (
    <T.AdminShell>
      <Outlet />
    </T.AdminShell>
  );
}
