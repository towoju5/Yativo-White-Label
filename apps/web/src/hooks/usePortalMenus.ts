import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { findPortalMenuForPath, type PortalMenusResponse } from "@white-label/shared-types";
import { publicApi } from "@/lib/api-client";

/**
 * Which customer-portal menus the admin has switched on (Settings → Customer menu). Until the list
 * loads — or if it fails to — every menu falls back to its shipped default, so an opt-in feature
 * like Swap stays hidden rather than flashing into the nav.
 */
export function usePortalMenus() {
  const { data, isLoading } = useQuery({
    queryKey: ["portal-menus"],
    queryFn: () => publicApi.get<PortalMenusResponse>("/portal-menus"),
    staleTime: 60_000,
  });

  const isPathEnabled = useCallback(
    (pathname: string) => {
      const menu = findPortalMenuForPath(pathname);
      if (!menu) return true;
      return data?.menus.find((m) => m.key === menu.key)?.enabled ?? menu.defaultEnabled;
    },
    [data],
  );

  return { isPathEnabled, isLoading };
}
