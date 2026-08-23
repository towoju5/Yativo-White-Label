import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ShieldCheck, Zap, GitBranch, Globe, Lock, BarChart3 } from "lucide-react";
import { fetchBranding, fetchFooterPages } from "@/theme/branding";
import { Button } from "@/components/ui/button";

const features = [
  { icon: ShieldCheck, title: "Double-entry ledger", desc: "Every cent traced through immutable, auditable journal entries — never a naive balance column." },
  { icon: Zap, title: "Real-time settlement", desc: "Webhook-driven posting keeps customer balances current the moment funds move." },
  { icon: GitBranch, title: "Reconciled automatically", desc: "Scheduled jobs diff your ledger against upstream settlement and flag drift instantly." },
  { icon: Globe, title: "Multi-currency", desc: "Fiat and crypto rails under one chart of accounts, ready for global payout corridors." },
  { icon: Lock, title: "Two isolated auth domains", desc: "Customer and staff sessions never cross — separate tokens, separate blast radius." },
  { icon: BarChart3, title: "Full back office", desc: "KYC review, manual adjustments, payouts, cards and webhooks — one console." },
];

const codeSnippet = `POST /portal/payouts
{
  "beneficiaryId": "ben_8f2...",
  "currencyCode": "USD",
  "amountMinor": "42500",
  "quoteId": "qt_91ac..."
}

200 OK
{ "status": "PENDING", "transactionId": "tx_c81..." }`;

export function NovaLandingPage() {
  const { data: branding } = useQuery({ queryKey: ["branding"], queryFn: fetchBranding, staleTime: Infinity });
  const { data: footerPages } = useQuery({ queryKey: ["pages", "footer"], queryFn: fetchFooterPages, staleTime: Infinity });
  const productName = branding?.productName ?? "White Label";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-primary to-accent text-xs font-bold text-primary-foreground">
              {productName.slice(0, 1)}
            </div>
            <span className="font-heading text-sm font-semibold">{productName}</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/portal/login" className="text-sm text-muted-foreground hover:text-foreground">
              Sign in
            </Link>
            <Button asChild size="sm">
              <Link to="/portal/signup">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_hsl(var(--brand-primary)/0.18),_transparent_60%)]" />
        <div className="mx-auto grid max-w-7xl gap-12 px-6 py-20 lg:grid-cols-2 lg:py-28">
          <div className="relative flex flex-col justify-center">
            <span className="mb-4 inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-success" /> Ledger-verified &middot; Reconciled hourly
            </span>
            <h1 className="font-heading text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
              Fintech infrastructure,{" "}
              <span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
                run under your own brand.
              </span>
            </h1>
            <p className="mt-5 max-w-lg text-base text-muted-foreground">
              {productName} gives your business a white-labeled wallet, payouts, and card platform on a real double-entry
              ledger — deploy it, brand it, and run your own fintech business on it.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link to="/portal/signup">
                  Open an account <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/admin/login">Operator console</Link>
              </Button>
            </div>
          </div>

          <div className="relative flex items-center justify-center">
            <div className="w-full max-w-md overflow-hidden rounded-xl border border-border bg-card/80 shadow-elevated backdrop-blur">
              <div className="flex items-center gap-1.5 border-b border-border px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-warning/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-success/60" />
                <span className="ml-2 font-mono text-xs text-muted-foreground">payout.request.json</span>
              </div>
              <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-muted-foreground">
                <code>{codeSnippet}</code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-border/60 bg-card/30 py-20">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-12 max-w-xl">
            <h2 className="font-heading text-3xl font-semibold tracking-tight">Built like infrastructure, not a demo</h2>
            <p className="mt-3 text-muted-foreground">Everything a reseller needs to run real customer money, safely.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="rounded-lg border border-border bg-card p-5 shadow-soft transition-colors hover:border-primary/40">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-primary/15 text-primary">
                  <f.icon className="h-4.5 w-4.5" />
                </div>
                <h3 className="font-heading text-sm font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="font-heading text-3xl font-semibold tracking-tight">Ready to run your own rails?</h2>
          <p className="mt-3 text-muted-foreground">Your customers, your brand, your ledger — powered underneath by Yativo.</p>
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/portal/signup">
                Create your account <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/60 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-6 text-xs text-muted-foreground sm:flex-row sm:justify-between">
          <span>&copy; {new Date().getFullYear()} {productName}</span>
          {footerPages && footerPages.length > 0 && (
            <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
              {footerPages.map((p) => (
                <Link key={p.slug} to={`/${p.slug}`} className="hover:text-foreground">
                  {p.title}
                </Link>
              ))}
            </nav>
          )}
          {branding?.supportEmail && <span>{branding.supportEmail}</span>}
        </div>
      </footer>
    </div>
  );
}
