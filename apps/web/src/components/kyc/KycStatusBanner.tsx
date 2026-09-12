import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ShieldAlert } from "lucide-react";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { Button } from "@/components/ui/button";

/** Nudges a customer to submit KYC until it's approved — never dismissable, unlike most other
 * banners here: an unapproved account can block real features (see KycRequiredNotice on the
 * pages those features live on), so this needs to stay visible until it's actually resolved. */
export function KycStatusBanner() {
  const { user } = useCustomerAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const needsKyc = user?.kycStatus === "NOT_STARTED" || user?.kycStatus === "REJECTED";
  if (!needsKyc) return null;

  const isRejected = user?.kycStatus === "REJECTED";

  return (
    <div className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
      <ShieldAlert className="h-4 w-4 shrink-0" />
      <p className="flex-1">
        {isRejected
          ? t("kyc.banner.rejected", "Your identity verification was rejected — please resubmit to unlock full access.")
          : t("kyc.banner.notStarted", "Submit your identity verification (KYC) to unlock deposits, payouts, and cards.")}
      </p>
      <Button size="sm" variant="outline" className="shrink-0 border-amber-300 bg-transparent hover:bg-amber-100" onClick={() => navigate("/portal/verify")}>
        {t("kyc.banner.cta", "Submit KYC")}
      </Button>
    </div>
  );
}
