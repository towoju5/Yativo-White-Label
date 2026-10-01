import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { Customer, CustomerEndorsement } from "@white-label/shared-types";
import { staffApi, ApiError } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

/** Customer statuses that override the endorsement count — a blocked account's verification progress isn't the relevant signal. */
const BLOCKED_STATUSES = new Set(["FROZEN", "SUSPENDED"]);

export function countEndorsements(endorsements: CustomerEndorsement[]) {
  return { approved: endorsements.filter((e) => e.status === "approved").length, total: endorsements.length };
}

/**
 * "approved/total" endorsements — the only verification signal there is. A customer's identity
 * approval IS their Yativo endorsements (per service); the platform has no KYC approval of its own,
 * so this never falls back to the local kycStatus as if it were one.
 *
 * - `notSubmitted`: the customer isn't registered for verification yet (no details submitted / no
 *   Yativo customer) — there's nothing to count.
 * - `endorsements` undefined and not loading: the lookup failed.
 */
export function EndorsementCountBadge({
  endorsements,
  isLoading,
  notSubmitted,
  prefix = "",
  className,
}: {
  endorsements: CustomerEndorsement[] | undefined;
  isLoading?: boolean;
  notSubmitted?: boolean;
  prefix?: string;
  className?: string;
}) {
  const { t } = useTranslation();

  if (notSubmitted) {
    return (
      <Badge variant="secondary" className={className}>
        {prefix}
        {t("endorsements.notSubmitted", "Not submitted")}
      </Badge>
    );
  }
  if (isLoading) return <Skeleton className={`inline-block h-5 w-12 align-middle ${className ?? ""}`} />;
  if (!endorsements) {
    return (
      <Badge variant="secondary" className={className} title={t("endorsements.unavailable", "Couldn't load endorsements")}>
        {prefix}—
      </Badge>
    );
  }

  const { approved, total } = countEndorsements(endorsements);
  const variant = total > 0 && approved === total ? "success" : approved > 0 ? "warning" : "secondary";
  return (
    <Badge variant={variant} className={className} title={t("endorsements.progressTitle", "{{approved}} of {{total}} endorsements approved", { approved, total })}>
      {prefix}
      {approved}/{total}
    </Badge>
  );
}

/**
 * Admin variant: fetches the customer's endorsements itself (same cache key the customer detail
 * page uses). Frozen/suspended customers show their account status instead.
 */
export function EndorsementProgressBadge({ customer, prefix = "" }: { customer: Pick<Customer, "id" | "status" | "yativoCustomerId">; prefix?: string }) {
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

  // 409 = not registered on Yativo yet — same meaning as having no yativoCustomerId.
  const notRegistered = endorsementsQuery.error instanceof ApiError && endorsementsQuery.error.status === 409;
  return (
    <EndorsementCountBadge
      endorsements={endorsementsQuery.data}
      isLoading={endorsementsQuery.isLoading}
      notSubmitted={!customer.yativoCustomerId || notRegistered}
      prefix={prefix}
    />
  );
}
