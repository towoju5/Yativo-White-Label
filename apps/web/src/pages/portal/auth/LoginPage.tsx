import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { portalLoginSchema, type PortalLoginInput, type PortalAuthConfig } from "@white-label/shared-types";
import { fetchBranding } from "@/theme/branding";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, publicApi } from "@/lib/api-client";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export default function PortalLoginPage() {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading: authLoading, login, loginWithPasskey, verifyTwoFactor } = useCustomerAuth();
  const { data: branding } = useQuery({ queryKey: ["branding"], queryFn: fetchBranding, staleTime: Infinity });
  const { data: authConfig } = useQuery({ queryKey: ["portal", "auth-config"], queryFn: () => publicApi.get<PortalAuthConfig>("/portal/auth/config"), staleTime: Infinity });
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [passkeySubmitting, setPasskeySubmitting] = useState(false);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [needsEmailVerification, setNeedsEmailVerification] = useState(false);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");
  const [lastEmail, setLastEmail] = useState("");
  const [magicEmail, setMagicEmail] = useState("");
  const [magicSent, setMagicSent] = useState(false);

  const magicLinkMutation = useMutation({
    mutationFn: () => publicApi.post("/portal/auth/magic-link/request", { email: magicEmail }),
    onSuccess: () => setMagicSent(true),
    onError: (e) => setError(e instanceof ApiError ? e.message : t("login.genericError", "Unable to sign in. Check your credentials.")),
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PortalLoginInput>({ resolver: zodResolver(portalLoginSchema) });

  if (!authLoading && isAuthenticated) {
    const from = (location.state as { from?: string })?.from ?? "/portal";
    return <Navigate to={from} replace />;
  }

  const onSubmit = async (values: PortalLoginInput) => {
    setError(null);
    setNeedsEmailVerification(false);
    setResendState("idle");
    setSubmitting(true);
    try {
      const result = await login(values);
      if ("requiresTwoFactor" in result) {
        setChallengeToken(result.challengeToken);
        return;
      }
      navigate("/portal", { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.body && typeof e.body === "object" && (e.body as { code?: string }).code === "EMAIL_NOT_VERIFIED") {
        setNeedsEmailVerification(true);
        setLastEmail(values.email);
      }
      setError(e instanceof ApiError ? e.message : t("login.genericError", "Unable to sign in. Check your credentials."));
    } finally {
      setSubmitting(false);
    }
  };

  const onResendVerification = async () => {
    if (!lastEmail) return;
    setResendState("sending");
    try {
      await publicApi.post("/portal/auth/resend-verification", { email: lastEmail });
      setResendState("sent");
    } catch {
      setResendState("idle");
    }
  };

  const onPasskeySubmit = async () => {
    setError(null);
    setPasskeySubmitting(true);
    try {
      await loginWithPasskey();
      navigate("/portal", { replace: true });
    } catch (e) {
      // A cancelled/timed-out browser prompt throws a plain DOMException, not an ApiError.
      setError(e instanceof ApiError ? e.message : t("login.passkeyError", "Couldn't sign in with that passkey."));
    } finally {
      setPasskeySubmitting(false);
    }
  };

  const onVerifyTwoFactor = async () => {
    if (!challengeToken) return;
    setError(null);
    setSubmitting(true);
    try {
      await verifyTwoFactor(challengeToken, code);
      navigate("/portal", { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("login.invalidCodeError", "Invalid code. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

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
          {challengeToken ? (
            <>
              <CardHeader>
                <CardTitle>{t("login.verifyHeading", "Verify it's you")}</CardTitle>
                <CardDescription>
                  {t("login.verifyDescription", "Enter the 6-digit code from your authenticator app, or a backup code.")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    onVerifyTwoFactor();
                  }}
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="twoFactorCode">{t("login.verificationCodeLabel", "Verification code")}</Label>
                    <Input
                      id="twoFactorCode"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      autoFocus
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                    />
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button type="submit" className="w-full" disabled={submitting || code.length < 6}>
                    {submitting ? t("login.verifying", "Verifying…") : t("login.verify", "Verify")}
                  </Button>
                  <button
                    type="button"
                    className="w-full text-center text-xs text-muted-foreground hover:underline"
                    onClick={() => {
                      setChallengeToken(null);
                      setCode("");
                      setError(null);
                    }}
                  >
                    {t("login.backToSignIn", "← Back to sign in")}
                  </button>
                </form>
              </CardContent>
            </>
          ) : authConfig?.loginMethod === "MAGIC_LINK" ? (
            <>
              <CardHeader>
                <CardTitle>{t("login.welcomeBack", "Welcome back")}</CardTitle>
                <CardDescription>
                  {magicSent
                    ? t("login.magicLinkSentDescription", "Check your email for a sign-in link.")
                    : t("login.magicLinkDescription", "We'll email you a link to sign in — no password needed.")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {magicSent ? (
                  <p className="text-sm text-muted-foreground">
                    {t("login.magicLinkSentBody", "If an account exists for {{email}}, a sign-in link is on its way. It expires in 15 minutes.", { email: magicEmail })}
                  </p>
                ) : (
                  <form
                    className="space-y-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      setError(null);
                      magicLinkMutation.mutate();
                    }}
                  >
                    <div className="space-y-1.5">
                      <Label htmlFor="magicEmail">{t("login.emailLabel", "Email")}</Label>
                      <Input id="magicEmail" type="email" autoComplete="email" required value={magicEmail} onChange={(e) => setMagicEmail(e.target.value)} />
                    </div>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    <Button type="submit" className="w-full" disabled={magicLinkMutation.isPending}>
                      {magicLinkMutation.isPending ? t("login.magicLinkSending", "Sending…") : t("login.magicLinkSend", "Send sign-in link")}
                    </Button>
                  </form>
                )}
                <p className="mt-4 text-center text-sm text-muted-foreground">
                  {t("login.newHere", "New here?")}{" "}
                  <Link to="/portal/signup" className="font-medium text-primary hover:underline">
                    {t("login.createAccount", "Create an account")}
                  </Link>
                </p>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader>
                <CardTitle>{t("login.welcomeBack", "Welcome back")}</CardTitle>
                <CardDescription>{t("login.signInDescription", "Sign in to your account")}</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email">{t("login.emailLabel", "Email")}</Label>
                    <Input id="email" type="email" autoComplete="email" {...register("email")} />
                    {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">{t("login.passwordLabel", "Password")}</Label>
                      <Link to="/portal/forgot-password" className="text-xs font-medium text-primary hover:underline">
                        {t("login.forgotPassword", "Forgot password?")}
                      </Link>
                    </div>
                    <Input id="password" type="password" autoComplete="current-password" {...register("password")} />
                    {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  {needsEmailVerification && (
                    <p className="text-sm">
                      {resendState === "sent" ? (
                        t("login.verificationResent", "Verification email sent — check your inbox.")
                      ) : (
                        <button
                          type="button"
                          className="font-medium text-primary hover:underline disabled:opacity-50"
                          disabled={resendState === "sending"}
                          onClick={onResendVerification}
                        >
                          {resendState === "sending"
                            ? t("login.resendingVerification", "Resending…")
                            : t("login.resendVerification", "Resend verification email")}
                        </button>
                      )}
                    </p>
                  )}
                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting ? t("login.signingIn", "Signing in…") : t("login.signIn", "Sign in")}
                  </Button>
                </form>
                {browserSupportsWebAuthn() && (
                  <>
                    <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
                      <div className="h-px flex-1 bg-border" />
                      {t("login.or", "or")}
                      <div className="h-px flex-1 bg-border" />
                    </div>
                    <Button type="button" variant="outline" className="w-full" disabled={passkeySubmitting} onClick={onPasskeySubmit}>
                      {passkeySubmitting ? t("login.passkeyWaiting", "Waiting for passkey…") : t("login.signInWithPasskey", "Sign in with a passkey")}
                    </Button>
                  </>
                )}
                <p className="mt-4 text-center text-sm text-muted-foreground">
                  {t("login.newHere", "New here?")}{" "}
                  <Link to="/portal/signup" className="font-medium text-primary hover:underline">
                    {t("login.createAccount", "Create an account")}
                  </Link>
                </p>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
