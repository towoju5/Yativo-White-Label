import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowRight, Send, CreditCard, ShieldCheck, Wallet, Sparkles } from "lucide-react";
import { fetchBranding, fetchFooterPages } from "@/theme/branding";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { BrandLogo } from "@/components/BrandLogo";

export function AtlasLandingPage() {
  const { data: branding } = useQuery({ queryKey: ["branding"], queryFn: fetchBranding, staleTime: Infinity });
  const { data: footerPages } = useQuery({ queryKey: ["pages", "footer"], queryFn: fetchFooterPages, staleTime: Infinity });
  const { t } = useTranslation();
  const productName = branding?.productName ?? t("nav.whiteLabel", "White Label");

  const features = [
    { icon: Wallet, title: t("landing.atlas.feature1Title", "One balance, every currency"), desc: t("landing.atlas.feature1Desc", "Hold and move fiat and crypto side by side, with a balance you can always trust.") },
    { icon: Send, title: t("landing.atlas.feature2Title", "Send in seconds"), desc: t("landing.atlas.feature2Desc", "Pick a contact, get a live quote, confirm — money moves without the paperwork.") },
    { icon: CreditCard, title: t("landing.atlas.feature3Title", "Cards on demand"), desc: t("landing.atlas.feature3Desc", "Spin up a virtual card in a tap, freeze it just as fast.") },
    { icon: ShieldCheck, title: t("landing.atlas.feature4Title", "Bank-grade ledger"), desc: t("landing.atlas.feature4Desc", "Every transaction is written to an immutable, reconciled ledger behind the scenes.") },
  ];

  const plans = [
    { name: t("landing.atlas.planPersonalName", "Personal"), price: t("landing.atlas.planPersonalPrice", "Free"), blurb: t("landing.atlas.planPersonalBlurb", "Everyday spending & sending for individuals."), cta: t("landing.atlas.planPersonalCta", "Get started") },
    { name: t("landing.atlas.planBusinessName", "Business"), price: t("landing.atlas.planBusinessPrice", "Custom"), blurb: t("landing.atlas.planBusinessBlurb", "Multi-user access, higher limits, dedicated support."), cta: t("landing.atlas.planBusinessCta", "Talk to us"), highlighted: true },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            {branding?.logoUrl ? (
              <BrandLogo branding={branding} className="h-8 w-8 rounded-full object-cover" />
            ) : (
              <>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-sm font-bold text-primary-foreground">
                  {productName.slice(0, 1)}
                </div>
                <span className="font-heading text-base font-semibold">{productName}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Link to="/portal/login" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              {t("landing.atlas.logIn", "Log in")}
            </Link>
            <Button asChild size="sm" className="rounded-full">
              <Link to="/portal/signup">{t("landing.atlas.signUpFree", "Sign up free")}</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 top-40 h-72 w-72 rounded-full bg-secondary/20 blur-3xl" />
        <div className="mx-auto grid max-w-7xl gap-12 px-6 py-16 lg:grid-cols-2 lg:items-center lg:py-24">
          <div className="relative">
            <span className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Sparkles className="h-3 w-3" /> {t("landing.atlas.heroBadge", "Money, made simple")}
            </span>
            <h1 className="font-heading text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
              {t("landing.atlas.heroHeadlinePrefix", "Banking that feels")} <span className="text-primary">{t("landing.atlas.heroHeadlineHighlight", "effortless.")}</span>
            </h1>
            <p className="mt-5 max-w-md text-lg text-muted-foreground">
              {t("landing.atlas.heroSubheadline", "{{productName}} is a modern wallet for sending, holding, and spending your money — beautifully simple, seriously secure.", { productName })}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="rounded-full">
                <Link to="/portal/signup">
                  {t("landing.atlas.openAccountCta", "Open your account")} <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-sm">
            <div className="relative rounded-[2rem] border border-border bg-card p-6 shadow-elevated">
              <p className="text-sm text-muted-foreground">{t("landing.atlas.demoTotalBalance", "Total balance")}</p>
              <p className="mt-1 font-heading text-3xl font-semibold">$8,942.10</p>
              <div className="mt-6 flex gap-3">
                <div className="flex-1 rounded-2xl bg-primary/10 p-3 text-center">
                  <Send className="mx-auto mb-1 h-4 w-4 text-primary" />
                  <p className="text-xs font-medium">{t("landing.atlas.demoSend", "Send")}</p>
                </div>
                <div className="flex-1 rounded-2xl bg-secondary/10 p-3 text-center">
                  <Wallet className="mx-auto mb-1 h-4 w-4 text-secondary" />
                  <p className="text-xs font-medium">{t("landing.atlas.demoDeposit", "Deposit")}</p>
                </div>
                <div className="flex-1 rounded-2xl bg-accent/10 p-3 text-center">
                  <CreditCard className="mx-auto mb-1 h-4 w-4 text-accent" />
                  <p className="text-xs font-medium">{t("landing.atlas.demoCard", "Card")}</p>
                </div>
              </div>
              <div className="mt-6 space-y-3">
                {[
                  t("landing.atlas.demoTransaction1", "Coffee & co."),
                  t("landing.atlas.demoTransaction2", "Payroll"),
                  t("landing.atlas.demoTransaction3", "Design retainer"),
                ].map((label, i) => (
                  <div key={label} className="flex items-center justify-between rounded-xl bg-muted/60 px-3 py-2.5">
                    <span className="text-sm">{label}</span>
                    <span className={cnAmount(i)}>{amountFor(i)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="absolute -bottom-6 -left-6 h-24 w-24 rounded-full bg-gradient-to-br from-secondary to-accent opacity-80 blur-md" />
          </div>
        </div>
      </section>

      <section className="bg-card/40 py-20">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-12 max-w-xl">
            <h2 className="font-heading text-3xl font-semibold tracking-tight">{t("landing.atlas.featuresHeading", "Everything your money needs")}</h2>
            <p className="mt-3 text-muted-foreground">{t("landing.atlas.featuresSubheading", "No hidden fees, no confusing menus — just banking that works.")}</p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div key={f.title} className="rounded-2xl border border-border bg-card p-6 shadow-soft transition-transform hover:-translate-y-1">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="font-heading font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-5xl px-6">
          <div className="mb-10 text-center">
            <h2 className="font-heading text-3xl font-semibold tracking-tight">{t("landing.atlas.pricingHeading", "Simple pricing")}</h2>
            <p className="mt-3 text-muted-foreground">{t("landing.atlas.pricingSubheading", "Start free. Upgrade only when your business needs more.")}</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            {plans.map((p) => (
              <div
                key={p.name}
                className={cn2(
                  "rounded-[1.75rem] border p-8 shadow-soft",
                  p.highlighted ? "border-primary bg-primary/5" : "border-border bg-card",
                )}
              >
                <p className="font-heading text-lg font-semibold">{p.name}</p>
                <p className="mt-2 font-heading text-3xl font-semibold">{p.price}</p>
                <p className="mt-2 text-sm text-muted-foreground">{p.blurb}</p>
                <Button asChild className="mt-6 w-full rounded-full" variant={p.highlighted ? "default" : "outline"}>
                  <Link to="/portal/signup">{p.cta}</Link>
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-border/60 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-6 text-xs text-muted-foreground sm:flex-row sm:justify-between">
          <span>{t("landing.atlas.footerCopyright", "© {{year}} {{productName}}", { year: new Date().getFullYear(), productName })}</span>
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

function amountFor(i: number) {
  return ["-$4.50", "+$3,200.00", "-$820.00"][i];
}
function cnAmount(i: number) {
  return i === 1 ? "text-sm font-semibold text-success" : "text-sm font-semibold text-foreground";
}
function cn2(...args: Array<string | false | undefined>) {
  return args.filter(Boolean).join(" ");
}
