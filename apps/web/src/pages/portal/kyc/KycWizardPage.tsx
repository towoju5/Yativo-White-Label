import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { KycCountry } from "@white-label/shared-types";
import { CheckCircle2, Clock, PencilLine, ShieldCheck } from "lucide-react";
import { portalApi } from "@/lib/api-client";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { Button } from "@/components/ui/button";
import IndividualKycWizard from "./IndividualKycWizard";
import BusinessKycWizard from "./BusinessKycWizard";

export default function KycWizardPage() {
  const { t } = useTranslation();
  const { user } = useCustomerAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const countriesQuery = useQuery({
    queryKey: ["portal", "kyc", "ref", "countries"],
    queryFn: () => portalApi.get<KycCountry[]>("/portal/kyc/reference/countries"),
  });
  const kycQuery = useQuery({
    queryKey: ["portal", "kyc"],
    queryFn: () => portalApi.get<{ kycStatus: string }>("/portal/kyc"),
  });

  const status = kycQuery.data?.kycStatus ?? user?.kycStatus;
  // ?mode=update — correcting an already-submitted KYC (PATCH) rather than a first submission.
  // Only meaningful once something has been submitted; otherwise it falls through to the normal wizard.
  const isUpdate = searchParams.get("mode") === "update" && !!status && status !== "NOT_STARTED";

  if (!isUpdate && (status === "PENDING" || status === "APPROVED")) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-elevated">
          {status === "APPROVED" ? (
            <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-success" />
          ) : (
            <Clock className="mx-auto mb-4 h-10 w-10 text-warning" />
          )}
          <h1 className="font-heading text-xl font-semibold">
            {status === "APPROVED" ? t("kycWizard.verifiedHeading", "You're verified") : t("kycWizard.pendingHeading", "Verification pending")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {status === "APPROVED"
              ? t(
                  "kycWizard.verifiedDescription",
                  "Your identity has been verified. You have full access to sending, cards, and virtual accounts.",
                )
              : t(
                  "kycWizard.pendingDescription",
                  "We've received your details and are reviewing them. We'll notify you once a decision is made.",
                )}
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => navigate("/portal/verify?mode=update")}>
              <PencilLine className="mr-1.5 h-4 w-4" />
              {t("kycWizard.updateKyc", "Update KYC information")}
            </Button>
            <Button onClick={() => navigate("/portal")}>{t("kycWizard.backToDashboard", "Back to dashboard")}</Button>
          </div>
        </div>
      </div>
    );
  }

  if (kycQuery.isLoading || countriesQuery.isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <ShieldCheck className="h-6 w-6 animate-pulse text-muted-foreground" />
      </div>
    );
  }

  const countries = countriesQuery.data ?? [];
  const mode = isUpdate ? "update" : "submit";
  return user.type === "BUSINESS" ? (
    <BusinessKycWizard countries={countries} countriesLoading={countriesQuery.isLoading} mode={mode} />
  ) : (
    <IndividualKycWizard countries={countries} countriesLoading={countriesQuery.isLoading} mode={mode} />
  );
}
