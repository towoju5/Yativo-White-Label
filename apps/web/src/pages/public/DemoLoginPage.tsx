import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiFetch, portalTokenStore, ApiError } from "@/lib/api-client";
import { setDemoExpiresAt } from "@/components/demo/DemoExpiryBanner";
import DemoExpiredPage from "./DemoExpiredPage";

/**
 * Entry point for a one-time demo link (POST /admin/demo-sessions returns
 * `${DEMO_BASE_URL}/demo/<token>`). Exchanges the token for a portal access token via
 * POST /portal/demo/verify — same "redeem a one-time token" shape as the magic-link flow
 * (see MagicLinkPage) — then drops the visitor straight into the portal. Any failure (expired,
 * already used, revoked, or the backend rejecting for any other reason) renders
 * DemoExpiredPage instead of ever guessing a fallback destination.
 */
export default function DemoLoginPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!token) {
      setFailed(true);
      return;
    }
    (async () => {
      try {
        const result = await apiFetch<{ accessToken: string; expiresAt: string }>("/portal/demo/verify", {
          method: "POST",
          body: { token },
        });
        portalTokenStore.set(result.accessToken);
        setDemoExpiresAt(result.expiresAt);
        navigate("/portal", { replace: true });
      } catch (e) {
        // Fail closed — never navigate into the portal on any error shape.
        void (e instanceof ApiError ? e.message : undefined);
        setFailed(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (failed) return <DemoExpiredPage />;

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-muted-foreground">{t("demo.login.verifying", "Setting up your demo…")}</p>
    </div>
  );
}
