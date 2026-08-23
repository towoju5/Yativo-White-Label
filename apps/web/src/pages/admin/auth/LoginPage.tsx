import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { staffLoginSchema, type StaffLoginInput } from "@white-label/shared-types";
import { fetchBranding } from "@/theme/branding";
import { useStaffAuth } from "@/hooks/useStaffAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api-client";

export default function AdminLoginPage() {
  const { isAuthenticated, isLoading: authLoading, login } = useStaffAuth();
  const { data: branding } = useQuery({ queryKey: ["branding"], queryFn: fetchBranding, staleTime: Infinity });
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      await login(values);
      navigate("/admin", { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Unable to sign in. Check your credentials.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0b1120] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-sm font-bold text-primary-foreground">
            {(branding?.productName ?? "W").slice(0, 1)}
          </div>
          <span className="font-heading text-lg font-semibold text-white">{branding?.productName ?? "White Label"} Console</span>
          <p className="text-xs text-slate-400">Staff &amp; operator access only</p>
        </div>
        <Card className="border-white/10 bg-white/[0.04] text-white backdrop-blur">
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
