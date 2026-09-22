import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, MailCheck } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api-client";

/**
 * Modal version of the demo request form (business name + email → POST /demo/request), matching
 * the reference design's in-page modal rather than navigating to a separate route. /demo
 * (DemoLandingPage.tsx) still exists as a standalone page for direct links/bookmarks — this is
 * just the in-page entry point used from MarketingLandingPage's CTAs.
 */
export function DemoRequestModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => nameInputRef.current?.focus(), 50);
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  }, [open, onClose]);

  // Reset to a fresh form each time the modal is reopened, rather than showing a stale
  // success/error state from a previous visit.
  useEffect(() => {
    if (open) {
      setBusinessName("");
      setEmail("");
      setError(null);
      setSubmitted(false);
    }
  }, [open]);

  if (!open) return null;

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

  return (
    <div
      className="ml-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ml-modal" role="dialog" aria-modal="true" aria-labelledby="demoModalTitle">
        {submitted ? (
          <div className="ml-modal-success">
            <div className="ml-check">
              <MailCheck className="h-5 w-5" />
            </div>
            <h3>{t("demo.landing.sentTitle", "Check your inbox")}</h3>
            <p>
              {t(
                "demo.landing.sentDescription",
                "We've emailed your demo link and admin panel credentials to {{email}}. They'll be ready in a moment.",
                { email },
              )}
            </p>
            <button type="button" className="ml-btn-secondary" onClick={onClose}>
              {t("demo.landing.done", "Done")}
            </button>
          </div>
        ) : (
          <>
            <div className="ml-modal-head">
              <h3 id="demoModalTitle">{t("demo.landing.title", "Try the platform")}</h3>
              <button type="button" className="ml-modal-close" aria-label={t("demo.landing.close", "Close")} onClick={onClose}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="ml-modal-sub">
              {t(
                "demo.landing.description",
                "Generate a live demo environment with sample data. We'll email you the link — it's fully isolated and expires automatically after 6 hours.",
              )}
            </p>
            <form onSubmit={handleSubmit}>
              <div className="ml-modal-field">
                <label htmlFor="modalBusinessName">{t("demo.landing.businessNameLabel", "Business name")}</label>
                <input
                  ref={nameInputRef}
                  id="modalBusinessName"
                  required
                  maxLength={200}
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder={t("demo.landing.businessNamePlaceholder", "Acme Inc.")}
                />
              </div>
              <div className="ml-modal-field">
                <label htmlFor="modalEmail">{t("demo.landing.emailLabel", "Work email")}</label>
                <input
                  id="modalEmail"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                />
              </div>
              {error && <p className="ml-modal-error">{error}</p>}
              <button type="submit" className="ml-modal-submit" disabled={loading}>
                {loading ? t("demo.landing.generating", "Setting up your demo…") : t("demo.landing.cta", "Email me a demo")}
              </button>
              <p className="ml-modal-fine">{t("demo.landing.modalFine", "Sandbox data only — no card required.")}</p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
