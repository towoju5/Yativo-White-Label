import { useRef } from "react";
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
