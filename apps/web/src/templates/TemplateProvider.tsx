import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import type { TemplateId } from "@white-label/shared-types";
import type { TemplateComponents } from "./types";
import { novaTemplate } from "./nova";
import { atlasTemplate } from "./atlas";
import { meridianTemplate } from "./meridian";
import { primeTemplate } from "./prime";
import { auroraTemplate } from "./aurora";

const TEMPLATES: Record<TemplateId, TemplateComponents> = {
  nova: novaTemplate,
  atlas: atlasTemplate,
  meridian: meridianTemplate,
  prime: primeTemplate,
  aurora: auroraTemplate,
};

export const TEMPLATE_LIST = Object.values(TEMPLATES);

const TemplateContext = createContext<TemplateComponents | null>(null);

function colorSchemeStorageKey(templateId: TemplateId) {
  return `wl-color-scheme:${templateId}`;
}

/** Each template owns a default color scheme (Nova is dark-first, the rest light-first), but a
 * per-template, per-viewer override — set via a template's own theme toggle, e.g. Prime's — always
 * wins once one has been chosen. Keyed by template id so switching templates never leaks one
 * template's toggle state into another's default. */
export function getStoredColorScheme(templateId: TemplateId): "light" | "dark" | null {
  return (window.localStorage.getItem(colorSchemeStorageKey(templateId)) as "light" | "dark" | null) ?? null;
}

export function setStoredColorScheme(templateId: TemplateId, mode: "light" | "dark") {
  window.localStorage.setItem(colorSchemeStorageKey(templateId), mode);
  document.documentElement.classList.toggle("dark", mode === "dark");
}

export function TemplateProvider({ templateId, children }: { templateId: TemplateId; children: ReactNode }) {
  const template = useMemo(() => TEMPLATES[templateId] ?? TEMPLATES.nova, [templateId]);

  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty("--font-heading", template.tokens.fontHeading);
    root.setProperty("--font-body", template.tokens.fontBody);
    root.setProperty("--radius", template.tokens.radius);

    const stored = getStoredColorScheme(template.id);
    document.documentElement.classList.toggle("dark", stored ? stored === "dark" : template.id === "nova");
  }, [template]);

  return <TemplateContext.Provider value={template}>{children}</TemplateContext.Provider>;
}

export function useTemplate(): TemplateComponents {
  const ctx = useContext(TemplateContext);
  if (!ctx) throw new Error("useTemplate must be used within TemplateProvider");
  return ctx;
}
