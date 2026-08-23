import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Wallet, Send, CreditCard, ShieldCheck, Sparkles } from "lucide-react";
import { fetchBranding, fetchFooterPages } from "@/theme/branding";
import { Button } from "@/components/ui/button";

const features = [
  { icon: Wallet, title: "One beautiful balance", desc: "Every wallet, every currency, always reconciled." },
  { icon: Send, title: "Send in seconds", desc: "Live quotes, instant confirmation, zero paperwork." },
  { icon: CreditCard, title: "Cards on demand", desc: "Issue a virtual card the moment you're verified." },
  { icon: ShieldCheck, title: "Bank-grade ledger", desc: "Every transaction, reconciled and auditable." },
];

export function AuroraLandingPage() {
  const { data: branding } = useQuery({ queryKey: ["branding"], queryFn: fetchBranding, staleTime: Infinity });
  const { data: footerPages } = useQuery({ queryKey: ["pages", "footer"], queryFn: fetchFooterPages, staleTime: Infinity });
  const productName = branding?.productName ?? "White Label";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-sm font-bold text-white">
              {productName.slice(0, 1)}
            </div>
            <span className="font-heading text-base font-semibold">{productName}</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/portal/login" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Log in
            </Link>
            <Button asChild size="sm" className="rounded-full">
              <Link to="/portal/signup">Sign up free</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 top-40 h-72 w-72 rounded-full bg-secondary/20 blur-3xl" />
        <div className="pointer-events-none absolute left-1/2 top-96 h-72 w-72 -translate-x-1/2 rounded-full bg-accent/10 blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-6 py-16 lg:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-primary shadow-soft">
              <Sparkles className="h-3 w-3" /> Beautifully simple money
            </span>
            <h1 className="font-heading text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl">
              Every account, <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">one gorgeous view.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-md text-lg text-muted-foreground">
              {productName} brings wallets, payouts, and cards together in a dashboard people actually enjoy opening.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg" className="rounded-full">
                <Link to="/portal/signup">
                  Open your account <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full">
                <Link to="/admin/login">Business login</Link>
              </Button>
            </div>
          </div>

          <div className="mx-auto mt-16 grid max-w-4xl gap-5 lg:grid-cols-3">
            <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-card to-secondary/10 p-6 shadow-elevated lg:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Total balance</p>
              <p className="mt-1 font-heading text-3xl font-bold">$8,942.10</p>
              <div className="mt-6 grid grid-cols-3 gap-3">
                {[
                  { icon: Send, label: "Send" },
                  { icon: Wallet, label: "Deposit" },
                  { icon: CreditCard, label: "Card" },
                ].map((a) => (
                  <div key={a.label} className="rounded-2xl border border-border bg-card p-3 text-center shadow-soft">
                    <a.icon className="mx-auto mb-1 h-4 w-4 text-primary" />
                    <p className="text-xs font-medium">{a.label}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-border bg-card p-6 shadow-elevated">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">This month</p>
              <p className="mt-2 font-heading text-2xl font-bold">+12.4%</p>
              <p className="mt-1 text-xs text-muted-foreground">vs. last month</p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-card/40 py-20">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-12 max-w-xl">
            <h2 className="font-heading text-3xl font-bold tracking-tight">Everything your money needs</h2>
            <p className="mt-3 text-muted-foreground">No hidden fees, no confusing menus — just banking that works.</p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div key={f.title} className="rounded-3xl border border-border bg-card p-6 shadow-elevated transition-transform hover:-translate-y-1">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-secondary/15 text-primary">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="font-heading font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-border/60 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-6 text-xs text-muted-foreground sm:flex-row sm:justify-between">
          <span>
            &copy; {new Date().getFullYear()} {productName}
          </span>
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
