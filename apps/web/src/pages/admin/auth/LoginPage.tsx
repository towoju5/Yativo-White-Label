import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { staffLoginSchema, type StaffLoginInput } from "@white-label/shared-types";
import { fetchBranding } from "@/theme/branding";
import { useStaffAuth } from "@/hooks/useStaffAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api-client";
import { BrandLogo } from "@/components/BrandLogo";

export default function AdminLoginPage() {
  const { isAuthenticated, isLoading: authLoading, login, loginWithPasskey, verifyTwoFactor, verifyEmailStepUp } = useStaffAuth();
  const { data: branding } = useQuery({ queryKey: ["branding"], queryFn: fetchBranding, staleTime: Infinity });
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [passkeySubmitting, setPasskeySubmitting] = useState(false);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [challengeMode, setChallengeMode] = useState<"2fa" | "stepup">("2fa");
  const [code, setCode] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<StaffLoginInput>({ resolver: zodResolver(staffLoginSchema) });

  if (!authLoading && isAuthenticated) {
    const from = (location.state as { from?: string })?.from ?? "/admin";
    return <Navigate to={from} replace />;
  }

  const onSubmit = async (values: StaffLoginInput) => {
    setError(null);
    setSubmitting(true);
    try {
      const result = await login(values);
      if ("requiresTwoFactor" in result) {
        setChallengeMode("2fa");
        setChallengeToken(result.challengeToken);
        return;
      }
      if ("requiresEmailStepUp" in result) {
        setChallengeMode("stepup");
        setChallengeToken(result.challengeToken);
        return;
      }
      navigate("/admin", { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Unable to sign in. Check your credentials.");
    } finally {
      setSubmitting(false);
    }
  };

  const onVerifyChallenge = async () => {
    if (!challengeToken) return;
    setError(null);
    setSubmitting(true);
    try {
      if (challengeMode === "stepup") {
        await verifyEmailStepUp(challengeToken, code);
      } else {
        await verifyTwoFactor(challengeToken, code);
      }
      navigate("/admin", { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Invalid code. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const onPasskeySubmit = async () => {
    setError(null);
    setPasskeySubmitting(true);
    try {
      await loginWithPasskey();
      navigate("/admin", { replace: true });
    } catch (e) {
      // A cancelled/timed-out browser prompt throws a plain DOMException, not an ApiError.
      setError(e instanceof ApiError ? e.message : "Couldn't sign in with that passkey.");
    } finally {
      setPasskeySubmitting(false);
    }
  };

  return (
    // Forced dark regardless of the app's light/dark setting — this screen's background and Card
    // styling below are hardcoded for a dark surface, so `dark:` logo variants must match that.
    <div className="dark flex min-h-screen items-center justify-center bg-[#0b1120] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <BrandLogo branding={branding} className="h-10" badgeClassName="rounded-xl text-sm" textClassName="text-lg text-white" />
          <p className="text-xs text-slate-400">Staff &amp; operator access only</p>
        </div>
        <Card className="border-white/10 bg-white/[0.04] text-white backdrop-blur">
          {challengeToken ? (
            <>
              <CardHeader>
                <CardTitle className="text-white">Verify it's you</CardTitle>
                <CardDescription className="text-slate-400">
                  {challengeMode === "stepup"
                    ? "We noticed a sign-in from a new location. Enter the code we just emailed you."
                    : "Enter the 6-digit code from your authenticator app, or a backup code."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    onVerifyChallenge();
                  }}
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="challengeCode" className="text-slate-200">
                      Verification code
                    </Label>
                    <Input
                      id="challengeCode"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      autoFocus
                      className="border-white/10 bg-white/5 text-white"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                    />
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button type="submit" className="w-full" disabled={submitting || code.length < 6}>
                    {submitting ? "Verifying…" : "Verify"}
                  </Button>
                  <button
                    type="button"
                    className="w-full text-center text-xs text-slate-400 hover:underline"
                    onClick={() => {
                      setChallengeToken(null);
                      setCode("");
                      setError(null);
                    }}
                  >
                    ← Back to sign in
                  </button>
                </form>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader>
                <CardTitle className="text-white">Operator sign in</CardTitle>
                <CardDescription className="text-slate-400">Use your staff credentials</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-slate-200">
                      Email
                    </Label>
                    <Input id="email" type="email" autoComplete="email" className="border-white/10 bg-white/5 text-white" {...register("email")} />
                    {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password" className="text-slate-200">
                      Password
                    </Label>
                    <Input
                      id="password"
                      type="password"
                      autoComplete="current-password"
                      className="border-white/10 bg-white/5 text-white"
                      {...register("password")}
                    />
                    {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting ? "Signing in…" : "Sign in"}
                  </Button>
                </form>
                {browserSupportsWebAuthn() && (
                  <>
                    <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
                      <div className="h-px flex-1 bg-white/10" />
                      or
                      <div className="h-px flex-1 bg-white/10" />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full border-white/10 bg-white/5 text-white hover:bg-white/10"
                      disabled={passkeySubmitting}
                      onClick={onPasskeySubmit}
                    >
                      {passkeySubmitting ? "Waiting for passkey…" : "Sign in with a passkey"}
                    </Button>
                  </>
                )}
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
