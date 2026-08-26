import { z } from "zod";
import { TEMPLATE_IDS } from "./enums.js";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be a hex color like #1a2b3c");

// Paths that route to something else already — allowing one of these as the admin login
// path would either 404 the real page or make the login page unreachable.
const RESERVED_ADMIN_LOGIN_PATHS = new Set(["/", "/admin", "/portal", "/portal/login", "/portal/signup", "/portal/verify"]);

export const adminLoginPathSchema = z
  .string()
  .regex(/^\/[a-z0-9][a-z0-9\-_/]*$/i, "must start with / and contain only letters, numbers, - _ /")
  .refine((path) => !path.endsWith("/"), "must not end with /")
  .refine((path) => !RESERVED_ADMIN_LOGIN_PATHS.has(path), "this path is reserved");

export const brandingConfigSchema = z.object({
  productName: z.string().min(1),
  logoUrl: z.string().url().nullable(),
  faviconUrl: z.string().url().nullable(),
  templateId: z.enum(TEMPLATE_IDS),
  primaryColor: hexColor,
  secondaryColor: hexColor,
  accentColor: hexColor,
  supportEmail: z.string().email().nullable(),
  adminLoginPath: adminLoginPathSchema,
  updatedAt: z.string(),
});
export type BrandingConfig = z.infer<typeof brandingConfigSchema>;

export const updateBrandingSchema = brandingConfigSchema
  .omit({ updatedAt: true })
  .partial();
export type UpdateBrandingInput = z.infer<typeof updateBrandingSchema>;
