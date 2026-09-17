import { z } from "zod";

export const navLabelOverrideSchema = z.object({
  key: z.string(),
  /** locale code (e.g. "en", "es") -> label text for that locale. A locale missing here keeps falling back to the shipped default translation for `key`. */
  translations: z.record(z.string(), z.string()),
  updatedAt: z.string(),
});
export type NavLabelOverride = z.infer<typeof navLabelOverrideSchema>;

export const upsertNavLabelOverrideSchema = z.object({
  translations: z.record(z.string(), z.string()),
});
export type UpsertNavLabelOverrideInput = z.infer<typeof upsertNavLabelOverrideSchema>;

export const navLabelOverridesResponseSchema = z.object({
  overrides: z.array(navLabelOverrideSchema),
  /** Every i18n key the customer portal's nav renders, across all visual templates — see KNOWN_NAV_LABEL_KEYS in the API's navLabels module. */
  knownKeys: z.array(z.string()),
});
export type NavLabelOverridesResponse = z.infer<typeof navLabelOverridesResponseSchema>;
