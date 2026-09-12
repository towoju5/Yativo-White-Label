import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ShieldAlert, X } from "lucide-react";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "kyc-banner-dismissed";

/** Nudges a customer to submit KYC until it's approved. Dismissible for the current browser
 * session only — it reappears next time so an unverified account doesn't go unnoticed for long. */
export function KycStatusBanner() {
  const { user } = useCustomerAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(DISMISS_KEY) === "1");

  const needsKyc = user?.kycStatus === "NOT_STARTED" || user?.kycStatus === "REJECTED";
  if (!needsKyc || dismissed) return null;

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

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
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("kyc.banner.dismiss", "Dismiss")}
        className="shrink-0 rounded p-1 text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/40"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
