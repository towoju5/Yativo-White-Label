import { cn } from "@/lib/utils";

type LogoBranding = {
  productName?: string | null;
  logoUrl?: string | null;
  logoUrlDark?: string | null;
  logoInvertOnDark?: boolean;
};

/**
 * The one place brand identity renders. When a logo is configured, it's shown at its natural
 * aspect ratio — sized by `className`'s height, width left to flow naturally — instead of being
 * cropped into a fixed icon square. Only when no logo is set does this fall back to a letter
 * badge + the product name (defaulting to "White Label"); the two states are mutually exclusive,
 * the badge never renders alongside a real logo.
 */
export function BrandLogo({
  branding,
  className,
  badgeClassName,
  textClassName,
}: {
  branding: LogoBranding | null | undefined;
  /** Height of the logo image — width flows naturally. Also sets the fallback badge's height (the badge is a square, via aspect-square). E.g. "h-8". */
  className?: string;
  /** Extra classes for the fallback letter badge only (shape/rounding) — ignored once a logo is set. */
  badgeClassName?: string;
  /** Extra classes for the fallback product-name text only — ignored once a logo is set. */
  textClassName?: string;
}) {
  const productName = branding?.productName || "White Label";

  if (branding?.logoUrl) {
    if (branding.logoUrlDark) {
      return (
        <>
          <img src={branding.logoUrl} alt={productName} className={cn("w-auto object-contain", className, "dark:hidden")} />
          <img src={branding.logoUrlDark} alt={productName} className={cn("w-auto object-contain", className, "hidden dark:block")} />
        </>
      );
    }
    return <img src={branding.logoUrl} alt={productName} className={cn("w-auto object-contain", className, branding.logoInvertOnDark && "dark:invert")} />;
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <div
        className={cn(
          "flex aspect-square shrink-0 items-center justify-center bg-gradient-to-br from-primary to-accent font-bold text-primary-foreground",
          className,
          badgeClassName,
        )}
      >
        {productName.slice(0, 1)}
      </div>
      <span className={cn("truncate font-heading font-semibold tracking-tight", textClassName)}>{productName}</span>
    </div>
  );
}
