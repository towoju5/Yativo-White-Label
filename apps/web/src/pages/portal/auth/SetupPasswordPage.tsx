import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { fetchBranding } from "@/theme/branding";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { BrandLogo } from "@/components/BrandLogo";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, portalApi } from "@/lib/api-client";

/**
 * Reached only for an account imported from Yativo that signed in via magic link and hasn't
 * chosen its own password yet (see RequireCustomerAuth's redirect on user.requiresPasswordSetup).
 * Unlike ResetPasswordPage, this is already authenticated — no token, no "current password" to
 * confirm, just a fresh password for an account that never had one.
 */
export default function SetupPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { refreshUser } = useCustomerAuth();
  const { data: branding } = useQuery({ queryKey: ["branding"], queryFn: fetchBranding, staleTime: Infinity });
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError(t("setupPassword.tooShort", "Password must be at least 8 characters"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("setupPassword.mismatch", "Passwords don't match"));
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await portalApi.post("/portal/auth/setup-password", { newPassword });
      await refreshUser();
      navigate("/portal", { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("setupPassword.genericError", "Couldn't set your password."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell branding={branding}>
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center lg:hidden">
          <BrandLogo branding={branding} className="h-10" badgeClassName="rounded-xl text-sm" textClassName="text-lg" />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t("setupPassword.title", "Choose a password")}</CardTitle>
            <CardDescription>
              {t("setupPassword.description", "You signed in with a one-time link — set a password now so you can sign in directly next time.")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="space-y-1.5">
                <Label htmlFor="new">{t("setupPassword.newPasswordLabel", "New password")}</Label>
                <PasswordInput id="new" autoComplete="new-password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm">{t("setupPassword.confirmPasswordLabel", "Confirm password")}</Label>
                <PasswordInput id="confirm" autoComplete="new-password" required minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? t("setupPassword.submitting", "Saving…") : t("setupPassword.submit", "Save password")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </AuthShell>
  );
}
