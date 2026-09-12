import type { ReactNode } from "react";
import { BrandLogo } from "@/components/BrandLogo";

type ShellBranding = { productName?: string | null; logoUrl?: string | null; logoUrlDark?: string | null; logoInvertOnDark?: boolean } | null | undefined;

/**
 * Admin/staff counterpart of AuthShell — same two-column idea (brand panel + form on lg+,
 * single column below it), but keeps the deliberately distinct dark "ops console" look the admin
 * login already had (forced dark regardless of the app's light/dark setting) instead of reusing
 * the portal's light gradient panel.
 */
export function AdminAuthShell({ branding, children }: { branding: ShellBranding; children: ReactNode }) {
  return (
    <div className="dark relative flex min-h-screen bg-[#0b1120]">
      <div className="relative hidden w-1/2 shrink-0 flex-col justify-between overflow-hidden border-r border-white/10 bg-[#0d1424] p-12 text-white lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 25%, white 0, transparent 35%), radial-gradient(circle at 80% 70%, white 0, transparent 35%)",
          }}
        />
        <BrandLogo branding={branding} className="relative h-9" badgeClassName="rounded-xl text-sm" textClassName="text-lg text-white" />
        <div className="relative space-y-3">
          <h2 className="max-w-md font-heading text-3xl font-semibold leading-tight">Operator console</h2>
          <p className="max-w-sm text-sm text-slate-400">Staff &amp; operator access only — manage customers, payouts, and platform settings.</p>
        </div>
        <p className="relative text-xs text-slate-500">
          © {new Date().getFullYear()} {branding?.productName || "White Label"}
        </p>
      </div>

      <div className="flex w-full flex-1 items-center justify-center px-4 py-10">{children}</div>
    </div>
  );
}
