import { useQuery } from "@tanstack/react-query";
import { publicApi } from "@/lib/api-client";

export type DemoConfig = { publicSignupEnabled: boolean };

const DEMO_OFF: DemoConfig = { publicSignupEnabled: false };

/**
 * GET /demo/config only exists when the API runs with DEMO_ENABLED=true — on every normal
 * deployment it 404s. That 404 is the expected answer ("demo off"), not an error, so it (and any
 * other failure — fail closed to the normal login) resolves to DEMO_OFF as *data*.
 *
 * This matters beyond tidiness: as an error with no data, every new observer of this query (App,
 * LoginPage) refetches it, and React Query resets an errored-without-data query to `pending` while
 * it refetches — App's splash gate then unmounted LoginPage, whose remount refetched again, in an
 * endless reload loop on any deployment without demo mode.
 */
async function fetchDemoConfig(): Promise<DemoConfig> {
  try {
    return await publicApi.get<DemoConfig>("/demo/config");
  } catch {
    return DEMO_OFF;
  }
}

/** Shared by App (router choice) and LoginPage — one request, cached for the session (only changes with an API restart). */
export function useDemoConfig() {
  return useQuery({ queryKey: ["demo", "config"], queryFn: fetchDemoConfig, staleTime: Infinity, retry: false });
}
