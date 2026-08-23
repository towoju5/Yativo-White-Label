import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TwoFactorStatus, TwoFactorSetupResult } from "@white-label/shared-types";
import { Copy, ShieldAlert, ShieldCheck } from "lucide-react";
import { portalApi, ApiError } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

type SetupStep = "qr" | "confirm" | "backupCodes";

export default function PortalSettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [setupOpen, setSetupOpen] = useState(false);
  const [setupStep, setSetupStep] = useState<SetupStep>("qr");
  const [setupResult, setSetupResult] = useState<TwoFactorSetupResult | null>(null);
  const [confirmCode, setConfirmCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const [disableOpen, setDisableOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableError, setDisableError] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: ["portal", "2fa", "status"],
    queryFn: () => portalApi.get<TwoFactorStatus>("/portal/2fa/status"),
  });

  const setupMutation = useMutation({
    mutationFn: () => portalApi.post<TwoFactorSetupResult>("/portal/2fa/setup"),
    onSuccess: (result) => {
      setSetupResult(result);
      setSetupStep("qr");
      setSetupOpen(true);
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't start setup", description: e instanceof ApiError ? e.message : undefined }),
  });

  const enableMutation = useMutation({
    mutationFn: (code: string) => portalApi.post<{ backupCodes: string[] }>("/portal/2fa/enable", { code }),
    onSuccess: (result) => {
      setBackupCodes(result.backupCodes);
      setSetupStep("backupCodes");
      setConfirmError(null);
      queryClient.invalidateQueries({ queryKey: ["portal", "2fa", "status"] });
    },
    onError: (e) => setConfirmError(e instanceof ApiError ? e.message : "Couldn't verify that code."),
  });

  const disableMutation = useMutation({
    mutationFn: (password: string) => portalApi.post<TwoFactorStatus>("/portal/2fa/disable", { password }),
    onSuccess: () => {
      toast({ title: "Two-factor authentication disabled" });
      queryClient.invalidateQueries({ queryKey: ["portal", "2fa", "status"] });
      setDisableOpen(false);
      setDisablePassword("");
      setDisableError(null);
    },
    onError: (e) => setDisableError(e instanceof ApiError ? e.message : "Couldn't disable two-factor authentication."),
  });

  const closeSetup = () => {
    setSetupOpen(false);
    setSetupResult(null);
    setConfirmCode("");
    setConfirmError(null);
    setBackupCodes([]);
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: "Copied to clipboard" });
    } catch {
      toast({ variant: "destructive", title: "Couldn't copy" });
    }
  };

  const enabled = statusQuery.data?.enabled ?? false;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Manage your account security</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change password</CardTitle>
          <CardDescription>Choose a strong password you don't use elsewhere.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              toast({ title: "Not available yet", description: "Password changes aren't wired up in this build." });
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="current">Current password</Label>
              <Input id="current" type="password" autoComplete="current-password" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new">New password</Label>
              <Input id="new" type="password" autoComplete="new-password" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Confirm new password</Label>
              <Input id="confirm" type="password" autoComplete="new-password" />
            </div>
            <Button type="submit" className="w-full">
              Update password
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            {enabled ? <ShieldCheck className="h-4 w-4 text-success" /> : <ShieldAlert className="h-4 w-4 text-primary" />}
            <CardTitle className="text-base">Two-factor authentication</CardTitle>
          </div>
          <CardDescription>Add an extra layer of security to your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div>
              <p className="text-sm font-medium">Authenticator app</p>
              <p className="text-xs text-muted-foreground">
                {statusQuery.isLoading ? "Loading…" : enabled ? "Enabled" : "Not yet configured"}
              </p>
            </div>
            <Switch
              checked={enabled}
              disabled={statusQuery.isLoading || setupMutation.isPending}
              onCheckedChange={(v) => {
                if (v) setupMutation.mutate();
                else setDisableOpen(true);
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Dialog open={setupOpen} onOpenChange={(v) => !v && closeSetup()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {setupStep === "qr" && "Scan with your authenticator app"}
              {setupStep === "confirm" && "Enter the code"}
              {setupStep === "backupCodes" && "Save your backup codes"}
            </DialogTitle>
          </DialogHeader>

          {setupStep === "qr" && setupResult && (
            <div className="space-y-4">
              <div className="flex justify-center rounded-lg bg-white p-4">
                <img src={setupResult.qrCodeDataUrl} alt="2FA setup QR code" className="h-48 w-48" />
              </div>
              <div className="space-y-1.5">
                <Label>Can't scan? Enter this key manually</Label>
                <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/50 p-3 font-mono text-xs">
                  <span className="truncate">{setupResult.secret}</span>
                  <button onClick={() => copy(setupResult.secret)} className="shrink-0 text-muted-foreground hover:text-foreground">
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <Button className="w-full" onClick={() => setSetupStep("confirm")}>
                Continue
              </Button>
            </div>
          )}

          {setupStep === "confirm" && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                enableMutation.mutate(confirmCode);
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="confirmCode">6-digit code</Label>
                <Input
                  id="confirmCode"
                  inputMode="numeric"
                  autoFocus
                  value={confirmCode}
                  onChange={(e) => {
                    setConfirmCode(e.target.value);
                    setConfirmError(null);
                  }}
                />
                {confirmError && <p className="text-xs text-destructive">{confirmError}</p>}
              </div>
              <Button type="submit" className="w-full" disabled={confirmCode.length < 6 || enableMutation.isPending}>
                {enableMutation.isPending ? "Verifying…" : "Enable two-factor authentication"}
              </Button>
            </form>
          )}

          {setupStep === "backupCodes" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Store these somewhere safe — each one can be used once to sign in if you lose access to your authenticator app. They won't be
                shown again.
              </p>
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-muted/50 p-3 font-mono text-sm">
                {backupCodes.map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </div>
              <Button variant="outline" className="w-full" onClick={() => copy(backupCodes.join("\n"))}>
                <Copy className="h-4 w-4" /> Copy all
              </Button>
              <Button className="w-full" onClick={closeSetup}>
                Done
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={disableOpen}
        onOpenChange={(v) => {
          setDisableOpen(v);
          if (!v) {
            setDisablePassword("");
            setDisableError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disable two-factor authentication</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              disableMutation.mutate(disablePassword);
            }}
          >
            <p className="text-sm text-muted-foreground">Confirm your password to turn off two-factor authentication.</p>
            <div className="space-y-1.5">
              <Label htmlFor="disablePassword">Password</Label>
              <Input
                id="disablePassword"
                type="password"
                autoFocus
                autoComplete="current-password"
                value={disablePassword}
                onChange={(e) => {
                  setDisablePassword(e.target.value);
                  setDisableError(null);
                }}
              />
              {disableError && <p className="text-xs text-destructive">{disableError}</p>}
            </div>
            <Button type="submit" variant="destructive" className="w-full" disabled={!disablePassword || disableMutation.isPending}>
              {disableMutation.isPending ? "Disabling…" : "Disable two-factor authentication"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
