import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { fetchBranding } from "@/theme/branding";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { BrandLogo } from "@/components/BrandLogo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api-client";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

/** Reached from the magic-link sign-in email — redeems the token into a real session (see POST /portal/auth/magic-link/verify) and drops the customer straight into the portal. */
export default function MagicLinkPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();
  const { verifyMagicLink } = useCustomerAuth();
  const { data: branding } = useQuery({ queryKey: ["branding"], queryFn: fetchBranding, staleTime: Infinity });
  const [status, setStatus] = useState<"verifying" | "error">("verifying");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setError(t("magicLink.missingToken", "This sign-in link is missing its token."));
      return;
    }
    (async () => {
      try {
        await verifyMagicLink(token);
        navigate("/portal", { replace: true });
      } catch (e) {
        setStatus("error");
        setError(e instanceof ApiError ? e.message : t("magicLink.genericError", "Couldn't sign you in with this link."));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <BrandLogo branding={branding} className="h-10" badgeClassName="rounded-xl text-sm" textClassName="text-lg" />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>
              {status === "verifying" ? t("magicLink.verifyingTitle", "Signing you in…") : t("magicLink.errorTitle", "Sign-in failed")}
            </CardTitle>
            {status === "error" && <CardDescription>{error}</CardDescription>}
          </CardHeader>
          {status === "error" && (
            <CardContent>
              <Link to="/portal/login" className="text-sm font-medium text-primary hover:underline">
                {t("magicLink.backToLogin", "Back to sign in")}
              </Link>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
