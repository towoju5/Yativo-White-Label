import { useState } from "react";
import { useTranslation } from "react-i18next";
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
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

type SetupStep = "qr" | "confirm" | "backupCodes";

export default function PortalSettingsPage() {
  const { t } = useTranslation();
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
    onError: (e) => toast({ variant: "destructive", title: t("settings.twoFactor.toast.setupError", "Couldn't start setup"), description: e instanceof ApiError ? e.message : undefined }),
  });

  const enableMutation = useMutation({
    mutationFn: (code: string) => portalApi.post<{ backupCodes: string[] }>("/portal/2fa/enable", { code }),
    onSuccess: (result) => {
      setBackupCodes(result.backupCodes);
      setSetupStep("backupCodes");
      setConfirmError(null);
      queryClient.invalidateQueries({ queryKey: ["portal", "2fa", "status"] });
    },
    onError: (e) => setConfirmError(e instanceof ApiError ? e.message : t("settings.twoFactor.setup.verifyError", "Couldn't verify that code.")),
  });

  const disableMutation = useMutation({
    mutationFn: (password: string) => portalApi.post<TwoFactorStatus>("/portal/2fa/disable", { password }),
    onSuccess: () => {
      toast({ title: t("settings.twoFactor.toast.disabled", "Two-factor authentication disabled") });
      queryClient.invalidateQueries({ queryKey: ["portal", "2fa", "status"] });
      setDisableOpen(false);
      setDisablePassword("");
      setDisableError(null);
    },
    onError: (e) => setDisableError(e instanceof ApiError ? e.message : t("settings.twoFactor.disable.error", "Couldn't disable two-factor authentication.")),
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
      toast({ title: t("settings.copiedToClipboard", "Copied to clipboard") });
    } catch {
      toast({ variant: "destructive", title: t("settings.copyError", "Couldn't copy") });
    }
  };

  const enabled = statusQuery.data?.enabled ?? false;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{t("settings.title", "Settings")}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{t("settings.subtitle", "Manage your account security")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("common.language", "Language")}</CardTitle>
        </CardHeader>
        <CardContent>
          <LanguageSwitcher />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.changePassword.title", "Change password")}</CardTitle>
          <CardDescription>{t("settings.changePassword.description", "Choose a strong password you don't use elsewhere.")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              toast({ title: t("settings.changePassword.toastTitle", "Not available yet"), description: t("settings.changePassword.toastDescription", "Password changes aren't wired up in this build.") });
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="current">{t("settings.changePassword.currentPasswordLabel", "Current password")}</Label>
              <Input id="current" type="password" autoComplete="current-password" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new">{t("settings.changePassword.newPasswordLabel", "New password")}</Label>
              <Input id="new" type="password" autoComplete="new-password" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">{t("settings.changePassword.confirmPasswordLabel", "Confirm new password")}</Label>
              <Input id="confirm" type="password" autoComplete="new-password" />
            </div>
            <Button type="submit" className="w-full">
              {t("settings.changePassword.submit", "Update password")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            {enabled ? <ShieldCheck className="h-4 w-4 text-success" /> : <ShieldAlert className="h-4 w-4 text-primary" />}
            <CardTitle className="text-base">{t("settings.twoFactor.title", "Two-factor authentication")}</CardTitle>
          </div>
          <CardDescription>{t("settings.twoFactor.description", "Add an extra layer of security to your account.")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div>
              <p className="text-sm font-medium">{t("settings.twoFactor.authenticatorApp", "Authenticator app")}</p>
              <p className="text-xs text-muted-foreground">
                {statusQuery.isLoading ? t("settings.twoFactor.loading", "Loading…") : enabled ? t("settings.twoFactor.enabled", "Enabled") : t("settings.twoFactor.notConfigured", "Not yet configured")}
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
              {setupStep === "qr" && t("settings.twoFactor.setup.scanTitle", "Scan with your authenticator app")}
              {setupStep === "confirm" && t("settings.twoFactor.setup.enterCodeTitle", "Enter the code")}
              {setupStep === "backupCodes" && t("settings.twoFactor.setup.backupCodesTitle", "Save your backup codes")}
            </DialogTitle>
          </DialogHeader>

          {setupStep === "qr" && setupResult && (
            <div className="space-y-4">
              <div className="flex justify-center rounded-lg bg-white p-4">
                <img src={setupResult.qrCodeDataUrl} alt={t("settings.twoFactor.setup.qrAlt", "2FA setup QR code")} className="h-48 w-48" />
              </div>
              <div className="space-y-1.5">
                <Label>{t("settings.twoFactor.setup.manualKeyLabel", "Can't scan? Enter this key manually")}</Label>
                <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/50 p-3 font-mono text-xs">
                  <span className="truncate">{setupResult.secret}</span>
                  <button onClick={() => copy(setupResult.secret)} className="shrink-0 text-muted-foreground hover:text-foreground">
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <Button className="w-full" onClick={() => setSetupStep("confirm")}>
                {t("settings.twoFactor.setup.continueButton", "Continue")}
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
                <Label htmlFor="confirmCode">{t("settings.twoFactor.setup.codeLabel", "6-digit code")}</Label>
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
                {enableMutation.isPending ? t("settings.twoFactor.setup.verifying", "Verifying…") : t("settings.twoFactor.setup.enableButton", "Enable two-factor authentication")}
              </Button>
            </form>
          )}

          {setupStep === "backupCodes" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t(
                  "settings.twoFactor.setup.backupCodesDescription",
                  "Store these somewhere safe — each one can be used once to sign in if you lose access to your authenticator app. They won't be shown again."
                )}
              </p>
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-muted/50 p-3 font-mono text-sm">
                {backupCodes.map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </div>
              <Button variant="outline" className="w-full" onClick={() => copy(backupCodes.join("\n"))}>
                <Copy className="h-4 w-4" /> {t("settings.twoFactor.setup.copyAll", "Copy all")}
              </Button>
              <Button className="w-full" onClick={closeSetup}>
                {t("settings.twoFactor.setup.done", "Done")}
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
            <DialogTitle>{t("settings.twoFactor.disable.title", "Disable two-factor authentication")}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              disableMutation.mutate(disablePassword);
            }}
          >
            <p className="text-sm text-muted-foreground">{t("settings.twoFactor.disable.description", "Confirm your password to turn off two-factor authentication.")}</p>
            <div className="space-y-1.5">
              <Label htmlFor="disablePassword">{t("settings.twoFactor.disable.passwordLabel", "Password")}</Label>
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
              {disableMutation.isPending ? t("settings.twoFactor.disable.submitting", "Disabling…") : t("settings.twoFactor.disable.submit", "Disable two-factor authentication")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
