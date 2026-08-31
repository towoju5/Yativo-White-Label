import { cn } from "@/lib/utils";

type LogoBranding = {
  logoUrl?: string | null;
  logoUrlDark?: string | null;
  logoInvertOnDark?: boolean;
};

/**
 * Renders the admin-configured logo, swapped or CSS-inverted for dark mode. Tailwind's `dark:`
 * variant tracks the `dark` class TemplateProvider toggles on <html>, so no theme detection is
 * needed here. Returns null when no logo is configured — callers fall back to their own
 * letter-badge + product name in that case.
 */
export function BrandLogo({ branding, className }: { branding: LogoBranding | null | undefined; className?: string }) {
  if (!branding?.logoUrl) return null;

  if (branding.logoUrlDark) {
    return (
      <>
        <img src={branding.logoUrl} alt="" className={cn(className, "dark:hidden")} />
        <img src={branding.logoUrlDark} alt="" className={cn(className, "hidden dark:block")} />
      </>
    );
  }

  return <img src={branding.logoUrl} alt="" className={cn(className, branding.logoInvertOnDark && "dark:invert")} />;
}
