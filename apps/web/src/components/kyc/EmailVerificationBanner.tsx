import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MailWarning } from "lucide-react";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { publicApi, ApiError } from "@/lib/api-client";

/** Unlike KycStatusBanner, this is never dismissable — an unverified email can eventually block
 * login entirely (see PlatformSettings.requireEmailVerification), so it stays until resolved. */
export function EmailVerificationBanner() {
  const { user } = useCustomerAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  if (!user || user.emailVerifiedAt) return null;

  const resend = async () => {
    setSending(true);
    try {
      await publicApi.post("/portal/auth/resend-verification", { email: user.email });
      setSent(true);
    } catch (e) {
      toast({ variant: "destructive", title: t("email.banner.resendFailed", "Couldn't resend"), description: e instanceof ApiError ? e.message : undefined });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
      <MailWarning className="h-4 w-4 shrink-0" />
      <p className="flex-1">
        {sent
          ? t("email.banner.sent", "Verification email sent — check your inbox.")
          : t("email.banner.message", "Please verify your email address ({{email}}) to keep full access to your account.", { email: user.email })}
      </p>
      {!sent && (
        <Button size="sm" variant="outline" className="shrink-0 border-amber-300 bg-transparent hover:bg-amber-100" disabled={sending} onClick={resend}>
          {sending ? t("email.banner.sending", "Sending…") : t("email.banner.cta", "Resend email")}
        </Button>
      )}
    </div>
  );
}
