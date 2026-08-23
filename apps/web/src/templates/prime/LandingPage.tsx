import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Wallet, Send, CreditCard, ShieldCheck } from "lucide-react";
import { fetchBranding, fetchFooterPages } from "@/theme/branding";
import { Button } from "@/components/ui/button";

const features = [
  { icon: Wallet, title: "Unified ledger", desc: "Every wallet, every currency, reconciled to a single source of truth." },
  { icon: Send, title: "Global payouts", desc: "Quote, confirm, and settle cross-border transfers in a few clicks." },
  { icon: CreditCard, title: "Card issuing", desc: "Issue virtual cards to customers the moment they're verified." },
  { icon: ShieldCheck, title: "Built-in compliance", desc: "KYC, endorsements, and audit trails wired in from day one." },
];

export function PrimeLandingPage() {
  const { data: branding } = useQuery({ queryKey: ["branding"], queryFn: fetchBranding, staleTime: Infinity });
  const { data: footerPages } = useQuery({ queryKey: ["pages", "footer"], queryFn: fetchFooterPages, staleTime: Infinity });
  const productName = branding?.productName ?? "White Label";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-primary text-xs font-bold text-primary-foreground">
              {productName.slice(0, 1)}
            </div>
            <span className="text-sm font-semibold tracking-tight">{productName}</span>
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

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="max-w-2xl">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">Payments infrastructure for the internet.</h1>
          <p className="mt-4 text-lg text-muted-foreground">
            {productName} gives you one API and one dashboard for wallets, payouts, cards, and compliance.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/portal/signup">
                Start now <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/admin/login">Dashboard login</Link>
            </Button>
          </div>
        </div>

        <div className="mt-16 rounded-lg border border-border bg-card p-6 shadow-soft">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <p className="text-sm font-medium">Balance</p>
            <p className="font-mono text-2xl font-semibold tabular-nums">$128,942.10</p>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
            {["Payouts", "Deposits", "Refunds"].map((label) => (
              <div key={label} className="rounded-md border border-border p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 font-mono font-semibold tabular-nums">
                  {label === "Payouts" ? "1,204" : label === "Deposits" ? "3,821" : "42"}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-2xl font-semibold tracking-tight">Everything operations needs</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div key={f.title} className="rounded-lg border border-border bg-card p-5">
                <f.icon className="h-5 w-5 text-primary" />
                <h3 className="mt-3 text-sm font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 text-xs text-muted-foreground sm:flex-row sm:justify-between">
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
