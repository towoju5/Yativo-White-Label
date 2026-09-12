import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { fetchBranding } from "@/theme/branding";
import { BrandLogo } from "@/components/BrandLogo";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, publicApi } from "@/lib/api-client";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const { data: branding } = useQuery({ queryKey: ["branding"], queryFn: fetchBranding, staleTime: Infinity });
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError(t("resetPassword.tooShort", "New password must be at least 8 characters"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("resetPassword.mismatch", "Passwords don't match"));
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await publicApi.post("/portal/auth/reset-password", { token, newPassword });
      setStatus("success");
    } catch (e) {
      setStatus("error");
      setError(e instanceof ApiError ? e.message : t("resetPassword.genericError", "Couldn't reset your password."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell branding={branding} topRight={<LanguageSwitcher />}>
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center lg:hidden">
          <BrandLogo branding={branding} className="h-10" badgeClassName="rounded-xl text-sm" textClassName="text-lg" />
        </div>
        <Card>
          {!token ? (
            <>
              <CardHeader>
                <CardTitle>{t("resetPassword.missingTokenTitle", "Invalid link")}</CardTitle>
                <CardDescription>{t("resetPassword.missingToken", "This reset link is missing its token.")}</CardDescription>
              </CardHeader>
              <CardContent>
                <Link to="/portal/forgot-password" className="text-sm font-medium text-primary hover:underline">
                  {t("resetPassword.requestNewLink", "Request a new link")}
                </Link>
              </CardContent>
            </>
          ) : status === "success" ? (
            <>
              <CardHeader>
                <CardTitle>{t("resetPassword.successTitle", "Password updated")}</CardTitle>
                <CardDescription>{t("resetPassword.successDescription", "Your password has been reset — you can now sign in.")}</CardDescription>
              </CardHeader>
              <CardContent>
                <Link to="/portal/login" className="text-sm font-medium text-primary hover:underline">
                  {t("resetPassword.backToLogin", "Back to sign in")}
                </Link>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader>
                <CardTitle>{t("resetPassword.title", "Choose a new password")}</CardTitle>
                <CardDescription>{t("resetPassword.description", "This link can only be used once and expires in 1 hour.")}</CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={onSubmit}>
                  <div className="space-y-1.5">
                    <Label htmlFor="new">{t("resetPassword.newPasswordLabel", "New password")}</Label>
                    <Input id="new" type="password" autoComplete="new-password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="confirm">{t("resetPassword.confirmPasswordLabel", "Confirm new password")}</Label>
                    <Input id="confirm" type="password" autoComplete="new-password" required minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting ? t("resetPassword.updating", "Updating…") : t("resetPassword.submit", "Reset password")}
                  </Button>
                </form>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </AuthShell>
  );
}
