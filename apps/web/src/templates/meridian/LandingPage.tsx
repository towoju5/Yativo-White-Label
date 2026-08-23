import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Send, CreditCard, ShieldCheck, Wallet, Activity, Users } from "lucide-react";
import { fetchBranding, fetchFooterPages } from "@/theme/branding";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const stats = [
  { label: "Uptime", value: "99.98%" },
  { label: "Currencies", value: "40+" },
  { label: "Avg. payout time", value: "< 2 min" },
];

const features = [
  { icon: Wallet, title: "Unified ledger", desc: "Every wallet, every currency, reconciled to a single source of truth." },
  { icon: Send, title: "Global payouts", desc: "Quote, confirm, and settle cross-border transfers in a few clicks." },
  { icon: CreditCard, title: "Card issuing", desc: "Issue virtual cards to customers the moment they're verified." },
  { icon: ShieldCheck, title: "Built-in compliance", desc: "KYC, endorsements, and audit trails wired in from day one." },
];

export function MeridianLandingPage() {
  const { data: branding } = useQuery({ queryKey: ["branding"], queryFn: fetchBranding, staleTime: Infinity });
  const { data: footerPages } = useQuery({ queryKey: ["pages", "footer"], queryFn: fetchFooterPages, staleTime: Infinity });
  const productName = branding?.productName ?? "White Label";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            {branding?.logoUrl ? (
              <img src={branding.logoUrl} alt="" className="h-7 w-7 rounded-md object-cover" />
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
                {productName.slice(0, 1)}
              </div>
            )}
            <span className="font-heading text-base font-semibold tracking-tight">{productName}</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/portal/login" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Log in
            </Link>
            <Button asChild size="sm">
              <Link to="/portal/signup">Sign up</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-16 lg:py-24">
        <div className="rounded-2xl border border-border bg-gradient-to-r from-card to-muted/50 p-8 shadow-soft sm:p-12">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Operations platform</p>
          <h1 className="mt-3 max-w-2xl font-heading text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            Run money movement like an operator, not a spreadsheet.
          </h1>
          <p className="mt-4 max-w-xl text-base text-muted-foreground">
            {productName} gives your team one console for wallets, payouts, cards, and compliance — backed by a ledger you can trust.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/portal/signup">
                Open an account <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/admin/login">Operator login</Link>
            </Button>
          </div>

          <div className="mt-10 grid grid-cols-3 gap-4 border-t border-border pt-6">
            {stats.map((s) => (
              <div key={s.label}>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{s.label}</p>
                <p className="mt-1 font-heading text-2xl font-bold tracking-tight">{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-20">
        <div className="mb-8">
          <h2 className="font-heading text-2xl font-bold tracking-tight">Everything operations needs</h2>
          <p className="mt-2 text-sm text-muted-foreground">A single platform for the whole money-movement stack.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <Card key={f.title}>
              <CardHeader>
                <f.icon className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">{f.title}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-sm text-muted-foreground">{f.desc}</CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-t border-border bg-muted/30 py-16">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <Activity className="h-5 w-5 text-primary" />
                <CardTitle>Reconciled by default</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-sm text-muted-foreground">
                Every posted transaction is double-entry, idempotent, and matched against provider records automatically.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <Users className="h-5 w-5 text-primary" />
                <CardTitle>Built for teams</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-sm text-muted-foreground">
                Role-based access for owners, admins, and operators, with a full audit trail on every action.
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-8">
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
