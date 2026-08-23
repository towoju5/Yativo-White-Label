import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { portalLoginSchema, type PortalLoginInput } from "@white-label/shared-types";
import { fetchBranding } from "@/theme/branding";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api-client";

export default function PortalLoginPage() {
  const { isAuthenticated, isLoading: authLoading, login, verifyTwoFactor } = useCustomerAuth();
  const { data: branding } = useQuery({ queryKey: ["branding"], queryFn: fetchBranding, staleTime: Infinity });
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [code, setCode] = useState("");

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
    setSubmitting(true);
    try {
      const result = await login(values);
      if ("requiresTwoFactor" in result) {
        setChallengeToken(result.challengeToken);
        return;
      }
      navigate("/portal", { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Unable to sign in. Check your credentials.");
    } finally {
      setSubmitting(false);
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
      setError(e instanceof ApiError ? e.message : "Invalid code. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-sm font-bold text-primary-foreground">
            {(branding?.productName ?? "W").slice(0, 1)}
          </div>
          <span className="font-heading text-lg font-semibold">{branding?.productName ?? "White Label"}</span>
        </div>
        <Card>
          {challengeToken ? (
            <>
              <CardHeader>
                <CardTitle>Verify it's you</CardTitle>
                <CardDescription>Enter the 6-digit code from your authenticator app, or a backup code.</CardDescription>
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
                    <Label htmlFor="twoFactorCode">Verification code</Label>
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
                    {submitting ? "Verifying…" : "Verify"}
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
                    &larr; Back to sign in
                  </button>
                </form>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader>
                <CardTitle>Welcome back</CardTitle>
                <CardDescription>Sign in to your account</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" autoComplete="email" {...register("email")} />
                    {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password">Password</Label>
                    <Input id="password" type="password" autoComplete="current-password" {...register("password")} />
                    {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting ? "Signing in…" : "Sign in"}
                  </Button>
                </form>
                <p className="mt-4 text-center text-sm text-muted-foreground">
                  New here?{" "}
                  <Link to="/portal/signup" className="font-medium text-primary hover:underline">
                    Create an account
                  </Link>
                </p>
              </CardContent>
            </>
          )}
        </Card>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link to="/" className="hover:underline">
            &larr; Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
