import type { BrandingConfig, StaticPageSummary } from "@white-label/shared-types";
import { publicApi } from "@/lib/api-client";

export const DEFAULT_BRANDING: BrandingConfig = {
  productName: "White Label",
  logoUrl: null,
  faviconUrl: null,
  templateId: "nova",
  primaryColor: "#6366f1",
  secondaryColor: "#0ea5e9",
  accentColor: "#22d3ee",
  supportEmail: null,
  adminLoginPath: "/admin/login",
  liveChatEnabled: false,
  liveChatCode: null,
  updatedAt: new Date().toISOString(),
};

export async function fetchBranding(): Promise<BrandingConfig> {
  try {
    return await publicApi.get<BrandingConfig>("/branding");
  } catch {
    return DEFAULT_BRANDING;
  }
}

/** Published pages flagged to appear in the marketing footer (Terms, Privacy, and any custom pages an admin adds). */
export async function fetchFooterPages(): Promise<StaticPageSummary[]> {
  try {
    return await publicApi.get<StaticPageSummary[]>("/pages/footer");
  } catch {
    return [];
  }
}

/** Published pages flagged to appear on the portal Support page as FAQ/help links. */
export async function fetchSupportPages(): Promise<StaticPageSummary[]> {
  try {
    return await publicApi.get<StaticPageSummary[]>("/pages/support");
  } catch {
    return [];
  }
}

/** Converts a `#rrggbb` hex color into an `"H S% L%"` triplet for CSS custom properties. */
export function hexToHslTriplet(hex: string): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h /= 6;
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** Perceived luminance heuristic to pick a legible foreground (near-black vs white) for a brand color. */
function foregroundFor(hex: string): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "222 39% 11%" : "0 0% 100%";
}

export function applyBrandingToDocument(branding: BrandingConfig) {
  document.title = branding.productName;

  const favicon = document.getElementById("app-favicon") as HTMLLinkElement | null;
  if (favicon && branding.faviconUrl) favicon.href = branding.faviconUrl;

  const root = document.documentElement.style;
  root.setProperty("--brand-primary", hexToHslTriplet(branding.primaryColor));
  root.setProperty("--brand-primary-foreground", foregroundFor(branding.primaryColor));
  root.setProperty("--brand-secondary", hexToHslTriplet(branding.secondaryColor));
  root.setProperty("--brand-secondary-foreground", foregroundFor(branding.secondaryColor));
  root.setProperty("--brand-accent", hexToHslTriplet(branding.accentColor));
  root.setProperty("--brand-accent-foreground", foregroundFor(branding.accentColor));
}
