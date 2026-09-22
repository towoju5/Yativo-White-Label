import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Wallet, CreditCard, Coins, ArrowLeftRight, ShieldCheck, Webhook, Building2, Sparkles, ArrowRight } from "lucide-react";
import { fetchBranding } from "@/theme/branding";
import { BrandLogo } from "@/components/BrandLogo";
import { DemoRequestModal } from "./DemoRequestModal";
import "./MarketingLandingPage.css";

/**
 * "/" homepage when the public demo landing page is active (DEMO_ENABLED +
 * DEMO_PUBLIC_SIGNUP_ENABLED — see router.tsx's demoLandingActive). Standalone marketing page,
 * not the login form: introduces the platform and funnels every visitor toward requesting a demo,
 * since real login is deliberately unreachable at that point. Every "Generate a demo" CTA opens
 * DemoRequestModal in-page (matching the reference design) rather than navigating away; /demo
 * (DemoLandingPage.tsx) still exists separately as a standalone page for direct links/bookmarks.
 *
 * Visual design ported from demo.html (provided design reference), scoped under .marketing-landing
 * (see MarketingLandingPage.css) so its fixed light palette doesn't leak into the rest of the
 * dark-first app. The logo uses the actual BrandLogo/branding config rather than a static mark so
 * it reflects this deployment's real brand. The reference's fabricated client-logo strip and
 * invented coverage stats (specific counts this deployment can't actually verify) were replaced
 * with honest, qualitative highlights of what the codebase genuinely provides.
 */
const FEATURES = [
  {
    icon: Wallet,
    title: "Multi-currency wallets",
    description: "Fiat and crypto balances, funded and moved in real time, with full ledger-backed accounting behind every transaction.",
    tags: ["Fiat & crypto", "Real-time balances", "Ledger-backed"],
  },
  {
    icon: CreditCard,
    title: "Virtual & business cards",
    description: "Issue virtual cards instantly, set spend limits, and track usage — for individual customers or whole business teams.",
    tags: ["Instant issuance", "Spend limits"],
  },
  {
    icon: Coins,
    title: "Crypto wallets",
    description: "Accept and hold stablecoins and major assets, reconciled through the same ledger pipeline as fiat.",
    tags: ["Stablecoins", "Wallet balances"],
  },
  {
    icon: ArrowLeftRight,
    title: "Cross-currency transfers",
    description: "Move money between customers and currencies with transparent, configurable fees on every transaction.",
    tags: ["Transfers", "Configurable fees"],
  },
] as const;

const HIGHLIGHTS = [
  { icon: ShieldCheck, label: "Built-in KYC & compliance" },
  { icon: Webhook, label: "API-first, webhook-driven" },
  { icon: Building2, label: "Fully white-labeled" },
  { icon: Sparkles, label: "Full admin console" },
] as const;

const STEPS = [
  { n: "1", title: "Request a demo", desc: "Tell us your business name and email — no signup, no password." },
  { n: "2", title: "We provision it live", desc: "An isolated environment is created and seeded with sample data in seconds." },
  { n: "3", title: "Explore for real", desc: "Full portal and admin access — create records, test workflows, try the API." },
  { n: "4", title: "It expires safely", desc: "Everything is automatically and permanently deleted after 6 hours." },
] as const;

const CURL_EXAMPLE = `curl -X POST ${import.meta.env.VITE_API_BASE_URL ?? "https://api.example.com"}/demo/request \\
  -H "Content-Type: application/json" \\
  -d '{
    "businessName": "Acme Inc.",
    "email": "you@company.com"
  }'

200 OK
{ "ok": true }
# demo link + admin credentials sent to your email`;

export default function MarketingLandingPage() {
  const { t } = useTranslation();
  const { data: branding } = useQuery({ queryKey: ["branding"], queryFn: fetchBranding, staleTime: Infinity });
  const productName = branding?.productName ?? "this platform";
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="marketing-landing">
      <header className="ml-nav">
        <div className="ml-wrap ml-nav-inner">
          <Link to="/" style={{ textDecoration: "none" }}>
            <BrandLogo branding={branding} className="h-7" badgeClassName="rounded-md text-xs" textClassName="text-sm font-semibold" />
          </Link>
          <nav className="ml-nav-links">
            <a href="#features">{t("landing.nav.products", "Products")}</a>
            <a href="#how">{t("landing.nav.how", "How it works")}</a>
            <a href="#api">{t("landing.nav.api", "API")}</a>
          </nav>
          <button type="button" className="ml-nav-cta" onClick={() => setModalOpen(true)}>
            {t("landing.nav.tryDemo", "Get demo access")}
          </button>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="ml-hero">
          <div className="ml-wrap ml-hero-top">
            <span className="ml-badge">
              <span className="ml-dot" />
              {t("landing.hero.eyebrow", "A complete fintech platform, ready to launch under your brand")}
            </span>
            <h1>
              {t("landing.hero.titlePre", "Launch a branded fintech product on ")}
              <span>{t("landing.hero.titleHighlight", "infrastructure that already works")}</span>
            </h1>
            <p className="ml-hero-sub">
              {t(
                "landing.hero.subtitle",
                "{{productName}} wraps wallets, cards, transfers, and compliance in an API and dashboard you put your own name on — live in a demo in minutes, not the year it takes to build a ledger from scratch.",
                { productName },
              )}
            </p>
            <div className="ml-hero-actions">
              <button type="button" className="ml-btn-primary" onClick={() => setModalOpen(true)}>
                {t("landing.hero.cta", "Generate a demo link")}
                <ArrowRight className="h-4 w-4" />
              </button>
              <a href="#api" className="ml-btn-secondary">
                {t("landing.hero.secondaryCta", "View API preview")}
              </a>
            </div>
            <p className="ml-hero-note">{t("landing.hero.note", "No credit card. Demo access expires automatically after 6 hours.")}</p>
          </div>
        </section>

        {/* Product window (static illustration) */}
        <div className="ml-product-frame">
          <div className="ml-wrap">
            <div className="ml-window">
              <div className="ml-window-bar">
                <div className="ml-traffic">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="ml-path">app.{productName.toLowerCase().replace(/\s+/g, "")}.com/portal</div>
              </div>
              <div className="ml-window-body">
                <div className="ml-win-sidebar">
                  <div className="ml-org">
                    <span className="ml-sq" />
                    {t("landing.window.orgName", "Your Business")}
                  </div>
                  <div className="ml-win-nav">
                    <div className="active">{t("landing.window.nav.overview", "Overview")}</div>
                    <div>{t("landing.window.nav.wallets", "Wallets")}</div>
                    <div>{t("landing.window.nav.transactions", "Transactions")}</div>
                    <div>{t("landing.window.nav.cards", "Cards")}</div>
                    <div>{t("landing.window.nav.crypto", "Crypto")}</div>
                    <div>{t("landing.window.nav.settings", "Settings")}</div>
                  </div>
                </div>
                <div className="ml-win-main">
                  <div className="ml-win-head">
                    <h3>{t("landing.window.title", "Portal overview")}</h3>
                    <p>{t("landing.window.subtitle", "This is what a demo environment looks like once it's provisioned.")}</p>
                  </div>
                  <div className="ml-stat-row">
                    <div>
                      <div className="ml-label">{t("landing.window.stat1Label", "Wallet balance")}</div>
                      <div className="ml-value">
                        $5,000<small>USD</small>
                      </div>
                    </div>
                    <div>
                      <div className="ml-label">{t("landing.window.stat2Label", "Transactions")}</div>
                      <div className="ml-value">2</div>
                    </div>
                    <div>
                      <div className="ml-label">{t("landing.window.stat3Label", "Cards issued")}</div>
                      <div className="ml-value">0</div>
                    </div>
                    <div>
                      <div className="ml-label">{t("landing.window.stat4Label", "Expires in")}</div>
                      <div className="ml-value">6h</div>
                    </div>
                  </div>
                  <span className="ml-sample-tag">{t("landing.window.sampleTag", "Sample data shown in every generated demo")}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Features */}
        <section className="ml-block" id="features">
          <div className="ml-wrap">
            <div className="ml-section-head">
              <p className="ml-section-tag">{t("landing.features.tag", "Products")}</p>
              <h2>{t("landing.features.title", "Everything a modern financial product needs")}</h2>
              <p className="ml-section-desc">{t("landing.features.subtitle", "One codebase, every layer already wired together.")}</p>
            </div>
            <div className="ml-rails-grid">
              {FEATURES.map(({ icon: Icon, title, description, tags }) => (
                <div className="ml-rail-card" key={title}>
                  <div className="ml-icon">
                    <Icon className="h-[18px] w-[18px]" />
                  </div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                  <div className="ml-tags">
                    {tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="ml-block" id="how">
          <div className="ml-wrap">
            <div className="ml-section-head">
              <p className="ml-section-tag">{t("landing.how.tag", "Process")}</p>
              <h2>{t("landing.how.title", "From request to live product")}</h2>
              <p className="ml-section-desc">{t("landing.how.subtitle", "The demo mirrors the real product, so nothing changes when you launch your own instance.")}</p>
            </div>
            <div className="ml-steps-row">
              {STEPS.map((step) => (
                <div className="ml-step" key={step.n}>
                  <span className="ml-n">{step.n}</span>
                  <h3>{step.title}</h3>
                  <p>{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* API preview */}
        <section className="ml-block" id="api">
          <div className="ml-wrap ml-api-grid">
            <div className="ml-api-copy">
              <p className="ml-section-tag" style={{ marginBottom: 10 }}>
                {t("landing.api.tag", "API")}
              </p>
              <h3>{t("landing.api.title", "API-first, from the demo onward")}</h3>
              <p>{t("landing.api.description", "Even requesting a demo goes through the same public API this platform runs on — here's the actual call.")}</p>
              <ul>
                <li>{t("landing.api.point1", "Every workflow you click through is also a documented API call")}</li>
                <li>{t("landing.api.point2", "Webhooks for status changes across wallets, cards, and transfers")}</li>
                <li>{t("landing.api.point3", "Demo and production share the same API surface")}</li>
              </ul>
            </div>
            <div className="ml-terminal" style={{ overflowX: "auto" }}>
              <div className="ml-terminal-head">
                <span className="ml-traffic">
                  <span />
                  <span />
                  <span />
                </span>
                POST /demo/request
              </div>
              <pre>{CURL_EXAMPLE}</pre>
            </div>
          </div>
        </section>

        {/* Highlights */}
        <section className="ml-block">
          <div className="ml-wrap">
            <div className="ml-section-head">
              <p className="ml-section-tag">{t("landing.highlights.tag", "Foundation")}</p>
              <h2>{t("landing.highlights.title", "Production-grade by default")}</h2>
            </div>
            <div className="ml-highlights-grid">
              {HIGHLIGHTS.map(({ icon: Icon, label }) => (
                <div className="ml-highlight" key={label}>
                  <div className="ml-icon">
                    <Icon className="h-4 w-4" />
                  </div>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="ml-block ml-cta-final">
          <div className="ml-wrap">
            <div className="ml-cta-final-inner">
              <h2>{t("landing.cta.title", "Your product, running on this platform")}</h2>
              <p>
                {t(
                  "landing.cta.subtitle",
                  "See it with your own sample data before you commit to anything — a fully isolated environment, delivered to your inbox, gone automatically after 6 hours.",
                )}
              </p>
              <div className="ml-cta-final-actions">
                <button type="button" className="ml-btn-primary" onClick={() => setModalOpen(true)}>
                  {t("landing.cta.button", "Generate my demo")}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="ml-footer">
        <div className="ml-wrap ml-footer-grid">
          <div className="ml-footer-brand">
            <BrandLogo branding={branding} className="h-6" badgeClassName="rounded-md text-xs" textClassName="text-sm font-semibold" />
            <p>{t("landing.footer.tagline", "Demo credentials generated on this page are for evaluation only and expire automatically after 6 hours.")}</p>
          </div>
          <div className="ml-footer-links">
            <a href="#features">{t("landing.nav.products", "Products")}</a>
            <a href="#api">{t("landing.nav.api", "API")}</a>
            <a href="#how">{t("landing.nav.how", "How it works")}</a>
          </div>
        </div>
      </footer>

      <DemoRequestModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
