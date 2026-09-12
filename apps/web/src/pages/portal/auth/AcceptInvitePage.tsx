import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { fetchBranding } from "@/theme/branding";
import { publicApi, ApiError } from "@/lib/api-client";
import { BrandLogo } from "@/components/BrandLogo";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Reached from the invite email — sets a password for a pending CustomerTeamMember invite (see
 * POST /portal/team/accept-invite). Public: the token in the URL is itself the credential, the
 * same trust model as a password-reset link. */
export default function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const navigate = useNavigate();

  const { data: branding } = useQuery({ queryKey: ["branding"], queryFn: fetchBranding, staleTime: Infinity });

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const acceptMutation = useMutation({
    mutationFn: () => publicApi.post("/portal/team/accept-invite", { token, password }),
    onSuccess: () => setDone(true),
    onError: (e) => setError(e instanceof ApiError ? e.message : "Something went wrong — please try again."),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirmPassword) return setError("Passwords don't match.");
    acceptMutation.mutate();
  };

  return (
    <AuthShell branding={branding}>
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 flex justify-center lg:hidden">
          <BrandLogo branding={branding} className="h-7" badgeClassName="rounded-md bg-none bg-primary text-xs" textClassName="text-sm" />
        </Link>

        <Card className="w-full">
        {!token ? (
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">This invite link is missing its token — please use the link from your invite email.</CardContent>
        ) : done ? (
          <CardContent className="space-y-4 pt-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <h1 className="font-heading text-lg font-semibold">You're all set</h1>
              <p className="mt-1 text-sm text-muted-foreground">Your password has been set — you can now sign in.</p>
            </div>
            <Button className="w-full" onClick={() => navigate("/portal/login")}>
              Go to sign in
            </Button>
          </CardContent>
        ) : (
          <>
            <CardHeader>
              <CardTitle>Set your password</CardTitle>
              <CardDescription>Choose a password to finish joining the team.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword">Confirm password</Label>
                  <Input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={8} required />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={acceptMutation.isPending}>
                  {acceptMutation.isPending ? "Setting password…" : "Set password & continue"}
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
