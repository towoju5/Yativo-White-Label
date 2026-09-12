import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { fetchBranding } from "@/theme/branding";
import { BrandLogo } from "@/components/BrandLogo";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { publicApi } from "@/lib/api-client";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const { data: branding } = useQuery({ queryKey: ["branding"], queryFn: fetchBranding, staleTime: Infinity });
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      // Always shows the same success state regardless of whether the email has an account —
      // the API itself no-ops silently for an unknown address (see requestPasswordReset), so this
      // never reveals which emails are registered.
      await publicApi.post("/portal/auth/forgot-password", { email });
    } finally {
      setSubmitting(false);
      setSent(true);
    }
  };

  return (
    <AuthShell branding={branding} topRight={<LanguageSwitcher />}>
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center lg:hidden">
          <BrandLogo branding={branding} className="h-10" badgeClassName="rounded-xl text-sm" textClassName="text-lg" />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t("forgotPassword.title", "Reset your password")}</CardTitle>
            <CardDescription>
              {sent
                ? t("forgotPassword.sentDescription", "If an account exists for that email, we've sent a link to reset your password.")
                : t("forgotPassword.description", "Enter your email and we'll send you a link to reset your password.")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!sent && (
              <form className="space-y-4" onSubmit={onSubmit}>
                <div className="space-y-1.5">
                  <Label htmlFor="email">{t("login.emailLabel", "Email")}</Label>
                  <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? t("forgotPassword.sending", "Sending…") : t("forgotPassword.submit", "Send reset link")}
                </Button>
              </form>
            )}
            <p className="mt-4 text-center text-sm text-muted-foreground">
              <Link to="/portal/login" className="font-medium text-primary hover:underline">
                {t("forgotPassword.backToLogin", "Back to sign in")}
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </AuthShell>
  );
}
