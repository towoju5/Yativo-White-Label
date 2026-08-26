/**
 * Minimal `{{variable}}` interpolation — deliberately not a full templating engine, matching this
 * codebase's existing preference for plain HTML strings over heavier tooling (see StaticPage's
 * contentHtml). An unmatched variable is left as literal `{{text}}` rather than throwing, so a
 * template referencing a typo'd variable degrades visibly instead of failing the whole send.
 */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => (key in vars ? vars[key]! : match));
}
