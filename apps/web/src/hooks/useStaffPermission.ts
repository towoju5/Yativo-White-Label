import type { StaffPermission } from "@white-label/shared-types";
import { useStaffAuth } from "./useStaffAuth";

/** Mirrors requirePermission() on the API — OWNER/ADMIN already carry every key in `user.permissions` (see resolveStaffPermissions), so this needs no separate role check. */
export function useStaffPermission(permission: StaffPermission): boolean {
  const { user } = useStaffAuth();
  return user?.permissions.includes(permission) ?? false;
}
