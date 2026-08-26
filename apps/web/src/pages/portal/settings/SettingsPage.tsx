import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { startRegistration, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import type { TwoFactorStatus, TwoFactorSetupResult, PasskeyDto } from "@white-label/shared-types";
import { Copy, ShieldAlert, ShieldCheck, KeyRound, Trash2 } from "lucide-react";
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

function PasskeysCard() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [registering, setRegistering] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const { data: passkeys, isLoading } = useQuery({
    queryKey: ["portal", "passkeys"],
    queryFn: () => portalApi.get<PasskeyDto[]>("/portal/passkeys"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => portalApi.del(`/portal/passkeys/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["portal", "passkeys"] }),
    onError: (e) =>
      toast({ variant: "destructive", title: t("settings.passkeys.deleteError", "Couldn't remove passkey"), description: e instanceof ApiError ? e.message : undefined }),
  });

  const addPasskey = async () => {
    setAddError(null);
    setRegistering(true);
    try {
      const options = await portalApi.post<Record<string, unknown>>("/portal/passkeys/register/options");
      const response = await startRegistration({ optionsJSON: options as unknown as Parameters<typeof startRegistration>[0]["optionsJSON"] });
      await portalApi.post("/portal/passkeys/register/verify", { response, name: name.trim() || "Passkey" });
      queryClient.invalidateQueries({ queryKey: ["portal", "passkeys"] });
      setAddOpen(false);
      setName("");
    } catch (e) {
      // A cancelled prompt or an already-registered authenticator throws a plain DOMException, not an ApiError.
      setAddError(e instanceof ApiError ? e.message : t("settings.passkeys.addError", "Couldn't register that passkey."));
    } finally {
      setRegistering(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">{t("settings.passkeys.title", "Passkeys")}</CardTitle>
            <CardDescription>{t("settings.passkeys.description", "Sign in without a password using Face ID, Touch ID, Windows Hello, or a security key.")}</CardDescription>
          </div>
          {browserSupportsWebAuthn() && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setAddError(null);
                setAddOpen(true);
              }}
            >
              <KeyRound className="h-4 w-4" /> {t("settings.passkeys.add", "Add a passkey")}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-xs text-muted-foreground">{t("settings.twoFactor.loading", "Loading…")}</p>
        ) : passkeys && passkeys.length > 0 ? (
          <ul className="divide-y divide-border rounded-md border border-border">
            {passkeys.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("settings.passkeys.added", "Added {{date}}", { date: new Date(p.createdAt).toLocaleDateString() })}
                    {p.lastUsedAt ? ` · ${t("settings.passkeys.lastUsed", "last used {{date}}", { date: new Date(p.lastUsedAt).toLocaleDateString() })}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => deleteMutation.mutate(p.id)}
                  disabled={deleteMutation.isPending}
                  aria-label={t("settings.passkeys.remove", "Remove {{name}}", { name: p.name })}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">{t("settings.passkeys.empty", "No passkeys registered yet.")}</p>
        )}
      </CardContent>

      <Dialog open={addOpen} onOpenChange={(v) => !registering && setAddOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("settings.passkeys.add", "Add a passkey")}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              addPasskey();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="passkeyName">{t("settings.passkeys.nameLabel", "Name this device")}</Label>
              <Input
                id="passkeyName"
                autoFocus
                placeholder={t("settings.passkeys.namePlaceholder", "e.g. iPhone Face ID")}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              {addError && <p className="text-xs text-destructive">{addError}</p>}
            </div>
            <Button type="submit" className="w-full" disabled={registering}>
              {registering ? t("settings.passkeys.waiting", "Waiting for browser…") : t("settings.passkeys.continue", "Continue")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

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

      <PasskeysCard />

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
