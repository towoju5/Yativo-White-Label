import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { CustomerEndorsement } from "@white-label/shared-types";
import { BadgeCheck, PencilLine, ShieldCheck } from "lucide-react";
import { portalApi, ApiError } from "@/lib/api-client";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EndorsementsTable } from "@/components/endorsements/EndorsementsTable";
import { EndorsementCountBadge, countEndorsements } from "@/components/endorsements/EndorsementProgressBadge";

export default function ProfilePage() {
  const { t } = useTranslation();
  const { user } = useCustomerAuth();
  const navigate = useNavigate();

  const kycQuery = useQuery({
    queryKey: ["portal", "kyc"],
    queryFn: () => portalApi.get<{ kycStatus: string; kycSubmittedAt: string | null }>("/portal/kyc"),
  });

  const status = kycQuery.data?.kycStatus ?? user?.kycStatus ?? "NOT_STARTED";
  const canStart = status === "NOT_STARTED" || status === "REJECTED";
  // Anything already submitted can be corrected in place (PATCH) — see KycWizardPage's ?mode=update.
  const canUpdate = status !== "NOT_STARTED";

  const endorsementsQuery = useQuery({
    queryKey: ["portal", "kyc", "endorsements"],
    queryFn: () => portalApi.get<CustomerEndorsement[]>("/portal/kyc/endorsements"),
    // Only skip retries for the one genuinely non-transient case (not registered on Yativo yet,
    // 409) — everything else is worth a couple of retries rather than sticking on a one-off
    // network blip against this endpoint's live upstream call to Yativo.
    retry: (failureCount, error) => !(error instanceof ApiError && error.status === 409) && failureCount < 2,
  });
  // 409 = not registered on Yativo yet, i.e. nothing submitted — nothing to count.
  const notRegistered = endorsementsQuery.error instanceof ApiError && endorsementsQuery.error.status === 409;
  const notSubmitted = status === "NOT_STARTED" || notRegistered;
  const counts = endorsementsQuery.data ? countEndorsements(endorsementsQuery.data) : null;

  // kycStatus only says whether details were submitted — there's no platform-level approval. What
  // the customer can actually use is decided per service by their endorsements.
  const description =
    status === "NOT_STARTED"
      ? t("profile.statusNotStarted", "Required before you can send money, hold a virtual account, or get a card.")
      : status === "REJECTED"
        ? t("profile.statusRejected", "Your last submission wasn't approved — start a new one below.")
        : counts
          ? t("profile.statusSubmittedSummary", "{{approved}} of {{total}} services approved. Each service is approved separately — see Endorsements below.", counts)
          : t("profile.statusSubmitted", "Your details are submitted. Each service is approved separately — see Endorsements below.");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{t("profile.heading", "Profile & verification")}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{t("profile.subheading", "Manage your identity details")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("profile.accountTitle", "Account")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("profile.emailLabel", "Email")}</span>
            <span>{user?.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("profile.typeLabel", "Type")}</span>
            <span>{user?.type}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">{t("profile.identityVerificationTitle", "Identity verification")}</CardTitle>
            <EndorsementCountBadge
              endorsements={endorsementsQuery.data}
              isLoading={endorsementsQuery.isLoading}
              notSubmitted={notSubmitted}
              className="ml-auto"
            />
          </div>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        {(canStart || canUpdate) && (
          <CardContent className="flex flex-wrap gap-2">
            {canStart && (
              <Button onClick={() => navigate("/portal/verify")}>
                {status === "REJECTED" ? t("profile.restartVerification", "Restart verification") : t("profile.startVerification", "Start verification")}
              </Button>
            )}
            {canUpdate && (
              <Button variant={canStart ? "outline" : "default"} onClick={() => navigate("/portal/verify?mode=update")}>
                <PencilLine className="mr-1.5 h-4 w-4" />
                {t("profile.updateKyc", "Update KYC information")}
              </Button>
            )}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BadgeCheck className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">{t("profile.endorsementsTitle", "Endorsements")}</CardTitle>
          </div>
          <CardDescription>
            {t("profile.endorsementsDescription", "Per-service verification required for certain features, like local bank transfers or virtual cards.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EndorsementsTable
            endorsements={endorsementsQuery.data}
            isLoading={endorsementsQuery.isLoading}
            errorMessage={
              endorsementsQuery.isError
                ? endorsementsQuery.error instanceof ApiError
                  ? endorsementsQuery.error.message
                  : t("profile.endorsementsLoadError", "Couldn't load endorsements.")
                : null
            }
            onGenerateLink={(service) => portalApi.post<CustomerEndorsement[]>(`/portal/kyc/endorsements/${service}/link`)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
