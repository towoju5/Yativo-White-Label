import { useEffect } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowRightLeft } from "lucide-react";
import { fetchBranding } from "@/theme/branding";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { setPostAuthRedirect } from "@/lib/postAuthRedirect";
import { AuthShell } from "@/components/auth/AuthShell";
import { BrandLogo } from "@/components/BrandLogo";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Public landing for a "Receive" QR code / payment link (/pay/:publicId), for someone who scanned it
 * with their phone's own camera rather than the in-app scanner (which reads the id straight out of
 * this same URL). Signed in → straight into the send flow with the recipient filled in. Signed out →
 * log in or sign up first; the intended destination is remembered (setPostAuthRedirect) so either
 * path — including email verification in another tab — ends up back on the payment.
 *
 * Deliberately shows no recipient details before sign-in: the lookup endpoint is authenticated and
 * rate-limited so a payment link can't be used to discover who's behind an id.
 */
export default function PayLinkPage() {
  const { t } = useTranslation();
  const { publicId = "" } = useParams();
  const { isAuthenticated, isLoading } = useCustomerAuth();
  const { data: branding } = useQuery({ queryKey: ["branding"], queryFn: fetchBranding, staleTime: Infinity });
  const id = publicId.replace(/[\s-]/g, "").toUpperCase();
  const destination = `/portal/transfer?to=${encodeURIComponent(id)}`;

  useEffect(() => {
    if (!isLoading && !isAuthenticated && id) setPostAuthRedirect(destination);
  }, [isLoading, isAuthenticated, id, destination]);

  if (!id) return <Navigate to="/portal" replace />;
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
      </div>
    );
  }
  if (isAuthenticated) return <Navigate to={destination} replace />;

  return (
    <AuthShell branding={branding} tagline={t("payLink.tagline", "Send money in seconds")} topRight={<LanguageSwitcher />}>
      <div className="w-full max-w-sm">
        <div className="mb-6 lg:hidden">{branding && <BrandLogo branding={branding} className="h-8" />}</div>
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
              <ArrowRightLeft className="h-6 w-6" />
            </div>
            <CardTitle className="font-heading text-xl">{t("payLink.title", "You've been sent a payment link")}</CardTitle>
            <CardDescription>
              {t("payLink.description", "Log in or create a free account to send money to this person. You'll come straight back to the payment.")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button asChild className="w-full">
              <Link to="/portal/login">{t("payLink.login", "Log in to pay")}</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link to="/portal/signup">{t("payLink.signup", "Create an account")}</Link>
            </Button>
            <p className="pt-2 text-center font-mono text-xs text-muted-foreground">{t("payLink.recipientId", "Recipient ID {{id}}", { id })}</p>
          </CardContent>
        </Card>
      </div>
    </AuthShell>
  );
}
