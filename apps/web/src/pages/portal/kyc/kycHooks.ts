import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import type { KycCountry, KycSubdivision, KycIdentificationType, KycPostalCodeRule, KycOccupation, KycLabelMap } from "@white-label/shared-types";
import { portalApi } from "@/lib/api-client";

// Hooks only — no components — deliberately kept out of kycShared.tsx. Vite's Fast Refresh only
// treats a module as a hot-reloadable boundary when ALL of its exports are components; mixing in
// hooks (even ones already named `use*`) forces a full-module invalidate on every edit to
// kycShared.tsx or anything that imports from it. See kycUtils.ts for the same reasoning applied
// to plain helper functions.

export function useFileRegistry() {
  const ref = useRef<Map<string, File> | null>(null);
  if (!ref.current) ref.current = new Map();
  return ref.current;
}

export function useKycCountries() {
  return useQuery({ queryKey: ["portal", "kyc", "ref", "countries"], queryFn: () => portalApi.get<KycCountry[]>("/portal/kyc/reference/countries") });
}
export function useKycSubdivisions(country: string | undefined) {
  return useQuery({
    queryKey: ["portal", "kyc", "ref", "subdivisions", country],
    queryFn: () => portalApi.get<KycSubdivision[]>(`/portal/kyc/reference/subdivisions/${country}`),
    enabled: !!country && country.length === 2,
  });
}
export function useKycIdentificationTypes(country: string | undefined) {
  return useQuery({
    queryKey: ["portal", "kyc", "ref", "id-types", country],
    queryFn: () => portalApi.get<KycIdentificationType[]>(`/portal/kyc/reference/identification-types/${country}`),
    enabled: !!country && country.length === 2,
  });
}
export function useKycPostalCodeRule(country: string | undefined) {
  return useQuery({
    queryKey: ["portal", "kyc", "ref", "postal", country],
    queryFn: () => portalApi.get<KycPostalCodeRule>(`/portal/kyc/reference/postal-codes/${country}`),
    enabled: !!country && country.length === 2,
  });
}
export function useKycOccupations() {
  return useQuery({ queryKey: ["portal", "kyc", "ref", "occupations"], queryFn: () => portalApi.get<KycOccupation[]>("/portal/kyc/reference/occupations") });
}
export function useKycBusinessIndustries() {
  return useQuery({
    queryKey: ["portal", "kyc", "ref", "business-industries"],
    queryFn: () => portalApi.get<KycOccupation[]>("/portal/kyc/reference/business-industries"),
  });
}
export function useKycLabelMap(kind: "individual/account-purposes" | "individual/source-of-funds" | "individual/expected-monthly-payments" | "business/account-purposes" | "business/source-of-funds") {
  return useQuery({ queryKey: ["portal", "kyc", "ref", kind], queryFn: () => portalApi.get<KycLabelMap>(`/portal/kyc/reference/${kind}`) });
}

/** Non-sensitive fields saved from the customer's last submission attempt — see kyc.routes.ts's
 * GET /portal/kyc/draft. Used to pre-fill a retry instead of starting the wizard from scratch. */
export function useKycDraft() {
  return useQuery({
    queryKey: ["portal", "kyc", "draft"],
    queryFn: () => portalApi.get<{ type: "INDIVIDUAL" | "BUSINESS"; draft: Record<string, unknown> | null }>("/portal/kyc/draft"),
  });
}

export type KycDraftFileMeta = { fieldPath: string; filename: string; mimetype: string; size: number };

/** Metadata for any document/photo the customer already selected mid-wizard — see kyc.routes.ts's
 * GET /portal/kyc/draft/files. Fetched separately from the bytes (GET .../draft/files/content,
 * see kycShared.tsx's FileField and portalDownload) so listing what's already attached is cheap
 * even before anything needs to actually re-fetch and re-hydrate a specific file's content. */
export function useKycDraftFiles() {
  return useQuery({
    queryKey: ["portal", "kyc", "draft", "files"],
    queryFn: () => portalApi.get<KycDraftFileMeta[]>("/portal/kyc/draft/files"),
  });
}

const AUTOSAVE_DEBOUNCE_MS = 2000;

/**
 * Silently persists the customer's in-progress (possibly incomplete/invalid) form values as they
 * type, via PUT /portal/kyc/draft — the ingredient that makes "continue on another device" (see
 * ContinueOnDeviceButton in kycShared.tsx) resume with real progress instead of an empty form.
 * Debounced so this doesn't fire on every keystroke; best-effort — a failed autosave is silently
 * swallowed, same as the server-side save-on-submit already does, since it must never interrupt
 * the customer's typing. `enabled: false` until the once-per-mount draft prefill (useKycDraft +
 * form.reset) has actually run, so autosave can never fire first and overwrite a real draft with
 * the wizard's still-empty defaultValues.
 */
export function useKycDraftAutosave(values: unknown, enabled: boolean) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // react-hook-form's watch() returns a new object identity every render even when the actual
  // values haven't changed — stringify so the effect only re-fires on a real edit.
  const key = JSON.stringify(values);

  useEffect(() => {
    if (!enabled) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      portalApi.put("/portal/kyc/draft", values as Record<string, unknown>).catch(() => {
        // Best-effort — see doc comment above.
      });
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
}
