import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ShieldAlert } from "lucide-react";
import type { KycRequiredService } from "@white-label/shared-types";
import { useKycGate } from "@/hooks/useKycGate";
import { Button } from "@/components/ui/button";

/**
 * A prominent, non-dismissable notice for a page whose feature currently requires KYC approval
 * (per the admin's Settings → Verification toggle) when the customer isn't approved yet. Renders
 * nothing once that service doesn't require KYC, or the customer is already approved — so
 * dropping this into a page is always safe, it just self-hides when irrelevant.
 */
export function KycRequiredNotice({ service }: { service: KycRequiredService }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { blocked, kycStatus } = useKycGate(service);

  if (!blocked) return null;

  const isRejected = kycStatus === "REJECTED";

  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2.5">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          {isRejected
            ? t("kyc.gate.rejected", "Your identity verification was rejected — resubmit it to use this feature.")
            : t("kyc.gate.notStarted", "This feature requires identity verification (KYC) before you can use it.")}
        </p>
      </div>
      <Button size="sm" className="shrink-0 border-amber-300" variant="outline" onClick={() => navigate("/portal/verify")}>
        {t("kyc.gate.cta", "Submit KYC")}
      </Button>
    </div>
  );
}
