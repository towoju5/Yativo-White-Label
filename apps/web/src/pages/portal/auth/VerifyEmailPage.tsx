import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { fetchBranding } from "@/theme/branding";
import { BrandLogo } from "@/components/BrandLogo";
import { AuthShell } from "@/components/auth/AuthShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, publicApi } from "@/lib/api-client";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export default function VerifyEmailPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const { data: branding } = useQuery({ queryKey: ["branding"], queryFn: fetchBranding, staleTime: Infinity });
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setError(t("verifyEmail.missingToken", "This verification link is missing its token."));
      return;
    }
    (async () => {
      try {
        await publicApi.post("/portal/auth/verify-email", { token });
        setStatus("success");
      } catch (e) {
        setStatus("error");
        setError(e instanceof ApiError ? e.message : t("verifyEmail.genericError", "Couldn't verify your email."));
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
              {status === "verifying" && t("verifyEmail.verifyingTitle", "Verifying your email…")}
              {status === "success" && t("verifyEmail.successTitle", "Email verified")}
              {status === "error" && t("verifyEmail.errorTitle", "Verification failed")}
            </CardTitle>
            <CardDescription>
              {status === "success" && t("verifyEmail.successDescription", "Your email is verified — you can now sign in.")}
              {status === "error" && error}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/portal/login" className="text-sm font-medium text-primary hover:underline">
              {t("verifyEmail.backToLogin", "Back to sign in")}
            </Link>
          </CardContent>
        </Card>
      </div>
    </AuthShell>
  );
}
