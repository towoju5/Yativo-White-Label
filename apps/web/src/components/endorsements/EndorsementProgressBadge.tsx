import { useQuery } from "@tanstack/react-query";
import type { Customer, CustomerEndorsement } from "@white-label/shared-types";
import { staffApi, ApiError } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const KYC_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  APPROVED: "success",
  PENDING: "warning",
  REJECTED: "destructive",
  NOT_STARTED: "secondary",
};

/** Customer statuses that override the endorsement count — a blocked account's KYC progress isn't the relevant signal. */
const BLOCKED_STATUSES = new Set(["FROZEN", "SUSPENDED"]);

/**
 * Admin KYC indicator: "approved/total" endorsements, read live from the same query the customer
 * detail page uses (shared cache key). Frozen/suspended customers show their account status instead;
 * customers not yet on Yativo (no endorsements to count) or a failed lookup fall back to the local kycStatus.
 */
export function EndorsementProgressBadge({ customer, prefix = "" }: { customer: Pick<Customer, "id" | "status" | "kycStatus" | "yativoCustomerId">; prefix?: string }) {
  const isBlocked = BLOCKED_STATUSES.has(customer.status);
  const endorsementsQuery = useQuery({
    queryKey: ["admin", "customers", customer.id, "endorsements"],
    queryFn: () => staffApi.get<CustomerEndorsement[]>(`/admin/customers/${customer.id}/endorsements`),
    enabled: !isBlocked && !!customer.yativoCustomerId,
    staleTime: 60_000,
    retry: (failureCount, error) => !(error instanceof ApiError && error.status === 409) && failureCount < 2,
  });

  if (isBlocked) {
    const label = customer.status.charAt(0) + customer.status.slice(1).toLowerCase();
    return <Badge variant="destructive">{prefix}{label}</Badge>;
  }

  if (customer.yativoCustomerId && endorsementsQuery.isLoading) return <Skeleton className="inline-block h-5 w-16 align-middle" />;

  const endorsements = endorsementsQuery.data;
  if (!customer.yativoCustomerId || !endorsements) {
    return <Badge variant={KYC_VARIANT[customer.kycStatus] ?? "secondary"}>{prefix}{customer.kycStatus.replace("_", " ")}</Badge>;
  }

  const approved = endorsements.filter((e) => e.status === "approved").length;
  const total = endorsements.length;
  const variant = total > 0 && approved === total ? "success" : approved > 0 ? "warning" : "secondary";
  return (
    <Badge variant={variant} title={`${approved} of ${total} endorsements approved`}>
      {prefix}{approved}/{total}
    </Badge>
  );
}
