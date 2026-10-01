import { useEffect, useRef, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { staffApi, ApiError } from "@/lib/api-client";
import { setStepUpHandler, type StepUpPrompt } from "@/lib/stepUp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Pending extends StepUpPrompt {
  resolve: (code: string | null) => void;
}

/**
 * Collects the per-action verification code that sensitive admin endpoints require (see
 * lib/stepUp.ts). Mounted once at the app root; apiFetch opens it on a 428 and retries the request
 * with whatever code is entered here, so individual pages don't need to know which actions are protected.
 */
export function StepUpDialogHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [code, setCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [emailState, setEmailState] = useState<{ sending: boolean; sentAt: number | null; cooldownUntil: number; error: string | null }>({
    sending: false,
    sentAt: null,
    cooldownUntil: 0,
    error: null,
  });
  const [now, setNow] = useState(Date.now());
  const pendingRef = useRef<Pending | null>(null);
  pendingRef.current = pending;

  useEffect(
    () =>
      setStepUpHandler(
        (prompt) =>
          new Promise<string | null>((resolve) => {
            setCode("");
            setPending({ ...prompt, resolve });
          }),
      ),
    [],
  );

  const sendEmailCode = async (action: string) => {
    setEmailState((s) => ({ ...s, sending: true, error: null }));
    try {
      const res = await staffApi.post<{ sent: boolean; retryAfterSeconds: number }>("/admin/step-up/email", { action });
      setEmailState((s) => ({
        sending: false,
        sentAt: res.sent ? Date.now() : s.sentAt,
        cooldownUntil: Date.now() + res.retryAfterSeconds * 1000,
        error: null,
      }));
    } catch (e) {
      setEmailState((s) => ({ ...s, sending: false, error: e instanceof ApiError ? e.message : "Couldn't send the code" }));
    }
  };

  // Email method: send a code as soon as the prompt opens — but not again when re-prompting after a
  // wrong code, since the earlier code is still valid until it's used or expires.
  useEffect(() => {
    if (pending?.method === "email" && !pending.error) void sendEmailCode(pending.action);
    if (!pending) setUseBackupCode(false);
  }, [pending]);

  const cooling = emailState.cooldownUntil > now;
  useEffect(() => {
    if (!cooling) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [cooling]);

  const finish = (value: string | null) => {
    pendingRef.current?.resolve(value);
    setPending(null);
    setCode("");
  };

  const trimmed = code.trim();
  const canSubmit = useBackupCode ? trimmed.length >= 6 : /^\d{6}$/.test(trimmed);

  return (
    <Dialog open={!!pending} onOpenChange={(open) => !open && finish(null)}>
      <DialogContent className="sm:max-w-md">
        {pending && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (canSubmit) finish(trimmed);
            }}
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" /> Confirm this action
              </DialogTitle>
              <DialogDescription>
                <span className="font-medium text-foreground">{pending.action}</span> is a protected action.{" "}
                {pending.method === "totp"
                  ? useBackupCode
                    ? "Enter one of your backup codes to continue — each code works once."
                    : "Enter the 6-digit code from your authenticator app to continue."
                  : "We've emailed you a 6-digit code to confirm it."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-1.5">
              <Label htmlFor="stepUpCode">{useBackupCode ? "Backup code" : "Verification code"}</Label>
              <Input
                id="stepUpCode"
                inputMode={useBackupCode ? "text" : "numeric"}
                autoComplete="one-time-code"
                autoFocus
                maxLength={useBackupCode ? 32 : 6}
                className="font-mono tracking-widest"
                value={code}
                onChange={(e) => setCode(useBackupCode ? e.target.value : e.target.value.replace(/\D/g, ""))}
              />
              {pending.error && <p className="text-sm text-destructive">{pending.error}</p>}
            </div>

            {pending.method === "totp" ? (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:underline"
                onClick={() => {
                  setUseBackupCode((v) => !v);
                  setCode("");
                }}
              >
                {useBackupCode ? "Use authenticator app instead" : "Use a backup code instead"}
              </button>
            ) : (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {emailState.sending
                    ? "Sending code…"
                    : emailState.error
                      ? <span className="text-destructive">{emailState.error}</span>
                      : emailState.sentAt
                        ? "Code sent — check your inbox. It expires in 10 minutes."
                        : null}
                </span>
                <button
                  type="button"
                  className="hover:underline disabled:opacity-50 disabled:hover:no-underline"
                  disabled={emailState.sending || cooling}
                  onClick={() => sendEmailCode(pending.action)}
                  title="Send a new code"
                >
                  {cooling ? `Resend in ${Math.ceil((emailState.cooldownUntil - now) / 1000)}s` : "Resend code"}
                </button>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => finish(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {emailState.sending && pending.method === "email" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Confirm
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
