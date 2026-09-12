import { useQuery } from "@tanstack/react-query";
import type { KycRequiredService, KycStatus } from "@white-label/shared-types";
import { portalApi } from "@/lib/api-client";

interface KycStatusResponse {
  kycStatus: KycStatus;
  kycSubmissionId: string | null;
  kycSubmittedAt: string | null;
  requiredServices: KycRequiredService[];
}

/**
 * Whether a specific service is currently gated behind KYC approval, driven entirely by the
 * admin's own Settings → Verification toggle (PlatformSettings.kycRequiredServices) — nothing
 * here is hardcoded, so turning a service's KYC requirement off there also turns off the notice
 * this hook drives, with no separate switch needed.
 */
export function useKycGate(service: KycRequiredService) {
  const { data, isLoading } = useQuery({
    queryKey: ["portal", "kyc"],
    queryFn: () => portalApi.get<KycStatusResponse>("/portal/kyc"),
  });

  const required = data?.requiredServices.includes(service) ?? false;
  const approved = data?.kycStatus === "APPROVED";

  return {
    isLoading,
    /** True once we know this page's feature needs KYC and the customer isn't approved yet. */
    blocked: !isLoading && required && !approved,
    kycStatus: data?.kycStatus,
  };
}
