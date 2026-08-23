import { z } from "zod";
import { TEMPLATE_IDS } from "./enums.js";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be a hex color like #1a2b3c");

export const brandingConfigSchema = z.object({
  productName: z.string().min(1),
  logoUrl: z.string().url().nullable(),
  faviconUrl: z.string().url().nullable(),
  templateId: z.enum(TEMPLATE_IDS),
  primaryColor: hexColor,
  secondaryColor: hexColor,
  accentColor: hexColor,
  supportEmail: z.string().email().nullable(),
  updatedAt: z.string(),
});
export type BrandingConfig = z.infer<typeof brandingConfigSchema>;

export const updateBrandingSchema = brandingConfigSchema
  .omit({ updatedAt: true })
  .partial();
export type UpdateBrandingInput = z.infer<typeof updateBrandingSchema>;
