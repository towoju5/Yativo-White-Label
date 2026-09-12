import type { BrandingConfig } from "@white-label/shared-types";

let manifestObjectUrl: string | null = null;

/**
 * This is a static-file SPA (no per-tenant server render), but branding — including the app
 * name/icon/colors an installed PWA needs — is admin-configurable at runtime, not build time. So
 * the manifest can't be a static public/manifest.json: it's built client-side from the same
 * branding config the rest of the app already fetches, then exposed as a Blob URL so the browser
 * can still fetch it like a normal manifest resource for the install prompt / "Add to Home Screen".
 */
export function applyPwaManifest(branding: BrandingConfig) {
  const icon = branding.faviconUrl ?? branding.logoUrl;
  const manifest = {
    name: branding.productName,
    short_name: branding.pwaShortName ?? branding.productName.slice(0, 30),
    start_url: "/portal",
    scope: "/",
    display: "standalone",
    theme_color: branding.primaryColor,
    background_color: branding.pwaBackgroundColor,
    icons: icon
      ? [
          { src: icon, sizes: "192x192", type: guessImageType(icon) },
          { src: icon, sizes: "512x512", type: guessImageType(icon) },
        ]
      : [],
  };

  const blob = new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" });
  const nextUrl = URL.createObjectURL(blob);

  let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "manifest";
    document.head.appendChild(link);
  }
  link.href = nextUrl;

  // Revoke the previous blob URL only after the new one is attached, so there's never a moment
  // with no valid manifest URL — and so repeated branding updates (e.g. live-editing in the admin
  // preview) don't leak one blob per change.
  if (manifestObjectUrl) URL.revokeObjectURL(manifestObjectUrl);
  manifestObjectUrl = nextUrl;

  setMetaTag("theme-color", branding.primaryColor);
  setMetaTag("apple-mobile-web-app-title", manifest.short_name);
  setMetaTag("apple-mobile-web-app-capable", "yes");
  if (icon) setLinkTag("apple-touch-icon", icon);
}

function guessImageType(url: string): string {
  if (url.endsWith(".png")) return "image/png";
  if (url.endsWith(".svg")) return "image/svg+xml";
  if (url.endsWith(".webp")) return "image/webp";
  if (url.endsWith(".jpg") || url.endsWith(".jpeg")) return "image/jpeg";
  return "image/png";
}

function setMetaTag(name: string, content: string) {
  let tag = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.name = name;
    document.head.appendChild(tag);
  }
  tag.content = content;
}

function setLinkTag(rel: string, href: string) {
  let tag = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!tag) {
    tag = document.createElement("link");
    tag.rel = rel;
    document.head.appendChild(tag);
  }
  tag.href = href;
}

/** Registers the app-shell service worker once. A failed registration (unsupported browser,
 * dev server without HTTPS) is silently ignored — the site still works fully without it, just
 * without offline/installable behavior. */
export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Not supported in this context (e.g. plain HTTP in local dev) — not a real error.
    });
  });
}
