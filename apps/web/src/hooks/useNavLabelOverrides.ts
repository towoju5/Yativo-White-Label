import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { NavLabelOverridesResponse } from "@white-label/shared-types";
import { publicApi } from "@/lib/api-client";
import i18n, { SUPPORTED_LANGUAGES } from "@/i18n";

async function fetchNavLabelOverrides(): Promise<NavLabelOverridesResponse> {
  try {
    return await publicApi.get<NavLabelOverridesResponse>("/nav-labels");
  } catch {
    return { overrides: [], knownKeys: [] };
  }
}

/**
 * Mounted once at the app root (see App.tsx). Layers admin-configured nav label overrides on top
 * of the shipped translations via i18next's own resource store, so every page reading a `nav.*`
 * key through `t()` picks up a rename immediately with zero per-page/per-template wiring. An
 * override only needs to cover the locales an admin actually typed a custom label for — any locale
 * missing from its `translations` map keeps using the shipped default for that key (i18next's
 * normal per-key resolution, unaffected by this).
 */
export function useNavLabelOverrides() {
  const { data } = useQuery({ queryKey: ["nav-labels"], queryFn: fetchNavLabelOverrides });

  useEffect(() => {
    if (!data) return;
    for (const override of data.overrides) {
      for (const [locale, label] of Object.entries(override.translations)) {
        if (!label || !(SUPPORTED_LANGUAGES as readonly string[]).includes(locale)) continue;
        i18n.addResource(locale, "translation", override.key, label);
      }
    }
  }, [data]);
}
