import { useEffect, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { useStaffAuth } from "@/hooks/useStaffAuth";

/**
 * Public self-service demo request form (GET /demo) — gated server-side by
 * DEMO_PUBLIC_SIGNUP_ENABLED (checked via GET /demo/config on mount). When the flag is off this
 * renders a "not available" state rather than a broken form; the real enforcement is still on the
 * backend (POST /demo/request 404s if the flag is off), this is just so visitors don't see one.
 *
 * Unlike the earlier one-click version, this never receives the demo link or credentials directly
 * — POST /demo/request only ever responds {ok:true}. Everything (portal link, admin panel URL,
 * admin email + temporary password) is delivered by email instead, so this just shows a
 * "check your inbox" confirmation on success.
 *
 * Only for signed-out visitors: an already-authenticated staff or portal user (including someone
 * mid-demo-session, since demo auth reuses the normal portal session) is sent straight to their
 * own dashboard instead of being offered a fresh demo.
 */
export default function DemoLandingPage() {
  const { t } = useTranslation();
  const { isAuthenticated: staffAuthenticated, isLoading: staffLoading } = useStaffAuth();
  const { isAuthenticated: customerAuthenticated, isLoading: customerLoading } = useCustomerAuth();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const config = await apiFetch<{ publicSignupEnabled: boolean }>("/demo/config");
        setEnabled(config.publicSignupEnabled);
      } catch {
        setEnabled(false);
      }
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await apiFetch("/demo/request", { method: "POST", body: { businessName, email } });
      setSubmitted(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("demo.landing.error", "Couldn't start a demo right now. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  if (staffLoading || customerLoading) return null;
  if (staffAuthenticated) return <Navigate to="/admin" replace />;
  if (customerAuthenticated) return <Navigate to="/portal" replace />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-sm">
        {submitted ? (
          <>
            <CardHeader className="items-center text-center">
              <MailCheck className="mb-2 h-10 w-10 text-primary" />
              <CardTitle>{t("demo.landing.sentTitle", "Check your inbox")}</CardTitle>
              <CardDescription>
                {t(
                  "demo.landing.sentDescription",
                  "We've emailed your demo link and admin panel credentials to {{email}}. They'll be ready in a moment.",
                  { email },
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link to="/" className="block text-center text-sm font-medium text-primary hover:underline">
                {t("demo.landing.backHome", "Back to home")}
              </Link>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle>{t("demo.landing.title", "Try the platform")}</CardTitle>
              <CardDescription>
                {t(
                  "demo.landing.description",
                  "Generate a live demo environment with sample data. We'll email you the link — it's fully isolated and expires automatically after 6 hours.",
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {enabled === false && (
                <p className="text-sm text-muted-foreground">{t("demo.landing.disabled", "Self-service demos aren't available right now.")}</p>
              )}
              {enabled === true && (
                <form className="space-y-4" onSubmit={handleSubmit}>
                  <div className="space-y-1.5">
                    <Label htmlFor="businessName">{t("demo.landing.businessNameLabel", "Business name")}</Label>
                    <Input
                      id="businessName"
                      required
                      maxLength={200}
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder={t("demo.landing.businessNamePlaceholder", "Acme Inc.")}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email">{t("demo.landing.emailLabel", "Work email")}</Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                    />
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? t("demo.landing.generating", "Setting up your demo…") : t("demo.landing.cta", "Email me a demo")}
                  </Button>
                </form>
              )}
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
