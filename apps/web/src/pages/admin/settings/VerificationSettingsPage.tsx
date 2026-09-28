import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { WalletCurrencySettings, CustomerLoginMethod } from "@white-label/shared-types";
import { Users, MailCheck, KeyRound, MapPin } from "lucide-react";
import { staffApi, ApiError } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function VerificationSettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "settings", "wallet-currencies"],
    queryFn: () => staffApi.get<WalletCurrencySettings>("/admin/settings/wallet-currencies"),
  });

  const emailVerificationMutation = useMutation({
    mutationFn: (requireEmailVerification: boolean) => staffApi.patch("/admin/settings/email-verification", { requireEmailVerification }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "settings", "wallet-currencies"] }),
    onError: (e) => toast({ variant: "destructive", title: "Couldn't update", description: e instanceof ApiError ? e.message : undefined }),
  });

  const newLocationCheckMutation = useMutation({
    mutationFn: (newLocationLoginCheck: boolean) => staffApi.patch("/admin/settings/new-location-login-check", { newLocationLoginCheck }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "settings", "wallet-currencies"] }),
    onError: (e) => toast({ variant: "destructive", title: "Couldn't update", description: e instanceof ApiError ? e.message : undefined }),
  });

  const loginMethodMutation = useMutation({
    mutationFn: (customerLoginMethod: CustomerLoginMethod) => staffApi.patch("/admin/settings/customer-login-method", { customerLoginMethod }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "settings", "wallet-currencies"] }),
    onError: (e) => toast({ variant: "destructive", title: "Couldn't update", description: e instanceof ApiError ? e.message : undefined }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Verification requirements</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Access to every product is gated by Yativo's per-service endorsement checklist — there's no separate local KYC requirement to configure here.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MailCheck className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Email verification</CardTitle>
          </div>
          <CardDescription>A verification email is always sent at signup. Turning this on also blocks login until the customer verifies.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-10" />
          ) : (
            <div className="flex items-center justify-between py-1">
              <div>
                <p className="text-sm font-medium">Require email verification before login</p>
                <p className="text-xs text-muted-foreground">Off by default so existing customers aren't suddenly locked out.</p>
              </div>
              <Switch
                checked={data?.settings.requireEmailVerification ?? false}
                disabled={emailVerificationMutation.isPending}
                onCheckedChange={(checked) => emailVerificationMutation.mutate(checked)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">New-location sign-in check</CardTitle>
          </div>
          <CardDescription>
            When someone signs in from a country their account hasn't used before, they must enter a code sent to their email. Applies to staff and customers.
            Accounts with two-factor authentication get the authenticator prompt instead.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-10" />
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between py-1">
                <div>
                  <p className="text-sm font-medium">Email a code on sign-ins from a new country</p>
                  <p className="text-xs text-muted-foreground">Turn off only if email isn't delivering reliably. Without it, a stolen password alone is enough to sign in.</p>
                </div>
                <Switch
                  checked={data?.settings.newLocationLoginCheck ?? true}
                  disabled={newLocationCheckMutation.isPending || data?.settings.newLocationLoginCheckDisabledByEnv}
                  onCheckedChange={(checked) => newLocationCheckMutation.mutate(checked)}
                />
              </div>
              {data?.settings.newLocationLoginCheckDisabledByEnv && (
                <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                  Currently off for everyone because <code>DISABLE_NEW_LOCATION_LOGIN_CHECK=true</code> is set on the server. Remove it and restart the API to use this setting again.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Customer login method</CardTitle>
          </div>
          <CardDescription>Which sign-in form the portal login page shows by default. Password login always keeps working either way — this only changes what customers see first.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-10" />
          ) : (
            <Select
              value={data?.settings.customerLoginMethod ?? "PASSWORD"}
              disabled={loginMethodMutation.isPending}
              onValueChange={(v) => loginMethodMutation.mutate(v as CustomerLoginMethod)}
            >
              <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PASSWORD">Email & password (default)</SelectItem>
                <SelectItem value="MAGIC_LINK">Magic link (passwordless email)</SelectItem>
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Yativo customer registration</CardTitle>
          </div>
          <CardDescription>Every customer gets their own Yativo identity and must complete KYC — there is no pooled/shared-identity mode.</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
