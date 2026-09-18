import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { fetchBranding } from "@/theme/branding";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { BrandLogo } from "@/components/BrandLogo";
import { AuthShell } from "@/components/auth/AuthShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api-client";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

/** Reached by scanning/opening the "continue on another device" QR/link generated from within the KYC wizard (see POST /portal/kyc/continue-link) — redeems the token into a real session on THIS device and drops straight into the wizard, wherever the draft last left off. */
export default function KycContinuePage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();
  const { verifyKycContinueLink } = useCustomerAuth();
  const { data: branding } = useQuery({ queryKey: ["branding"], queryFn: fetchBranding, staleTime: Infinity });
  const [status, setStatus] = useState<"verifying" | "error">("verifying");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setError(t("kycContinue.missingToken", "This link is missing its token."));
      return;
    }
    (async () => {
      try {
        await verifyKycContinueLink(token);
        navigate("/portal/verify", { replace: true });
      } catch (e) {
        setStatus("error");
        setError(e instanceof ApiError ? e.message : t("kycContinue.genericError", "Couldn't continue verification with this link."));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <AuthShell branding={branding} topRight={<LanguageSwitcher />}>
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center lg:hidden">
          <BrandLogo branding={branding} className="h-10" badgeClassName="rounded-xl text-sm" textClassName="text-lg" />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>
              {status === "verifying" ? t("kycContinue.verifyingTitle", "Picking up where you left off…") : t("kycContinue.errorTitle", "Couldn't continue")}
            </CardTitle>
            {status === "error" && <CardDescription>{error}</CardDescription>}
          </CardHeader>
          {status === "error" && (
            <CardContent>
              <Link to="/portal/login" className="text-sm font-medium text-primary hover:underline">
                {t("kycContinue.backToLogin", "Back to sign in")}
              </Link>
            </CardContent>
          )}
        </Card>
      </div>
    </AuthShell>
  );
}
