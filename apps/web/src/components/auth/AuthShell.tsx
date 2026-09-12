import type { ReactNode } from "react";
import { BrandLogo } from "@/components/BrandLogo";

type ShellBranding = { productName?: string | null; logoUrl?: string | null; logoUrlDark?: string | null; logoInvertOnDark?: boolean } | null | undefined;

/**
 * Shared two-column shell for every portal auth page (login, signup, forgot/reset password,
 * magic link, verify email, accept invite) — a brand panel on the left (lg+ only) and the page's
 * own form content on the right, replacing what used to be a single flat centered card on every
 * one of these pages. Below `lg` the brand panel disappears and this collapses back to the same
 * centered-column layout these pages always had.
 */
export function AuthShell({
  branding,
  tagline,
  blurb,
  topRight,
  children,
}: {
  branding: ShellBranding;
  tagline?: string;
  blurb?: string;
  topRight?: ReactNode;
  children: ReactNode;
}) {
  const productName = branding?.productName || "your account";

  return (
    <div className="relative flex min-h-screen bg-background">
      {topRight && <div className="absolute right-4 top-4 z-10">{topRight}</div>}

      <div className="relative hidden w-1/2 shrink-0 flex-col justify-between overflow-hidden bg-gradient-to-br from-primary to-accent p-12 text-primary-foreground lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.15]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 15% 20%, white 0, transparent 35%), radial-gradient(circle at 85% 75%, white 0, transparent 35%)",
          }}
        />
        <BrandLogo branding={branding} className="relative h-9" badgeClassName="rounded-xl text-sm" textClassName="text-lg text-white" />
        <div className="relative space-y-3">
          <h2 className="max-w-md font-heading text-3xl font-semibold leading-tight">{tagline ?? `Welcome to ${productName}`}</h2>
          <p className="max-w-sm text-sm text-primary-foreground/80">
            {blurb ?? "Manage balances, payouts, and cards from one secure dashboard."}
          </p>
        </div>
        <p className="relative text-xs text-primary-foreground/60">
          © {new Date().getFullYear()} {branding?.productName || "White Label"}
        </p>
      </div>

      <div className="flex w-full flex-1 items-center justify-center px-4 py-10">{children}</div>
    </div>
  );
}
