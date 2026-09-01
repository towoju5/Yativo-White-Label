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
  // Optional dedicated logo for dark mode. When unset, logoUrl is reused for both modes,
  // optionally CSS-inverted via logoInvertOnDark.
  logoUrlDark: z.string().url().nullable(),
  logoInvertOnDark: z.boolean(),
  faviconUrl: z.string().url().nullable(),
  // Official stamp/seal image printed on generated statements — set via the multipart upload
  // endpoint (POST /admin/branding/stamp-upload), never pasted as a raw URL like logoUrl.
  stampUrl: z.string().url().nullable(),
  templateId: z.enum(TEMPLATE_IDS),
  primaryColor: hexColor,
  secondaryColor: hexColor,
  accentColor: hexColor,
  supportEmail: z.string().email().nullable(),
  adminLoginPath: adminLoginPathSchema,
  // Raw admin-pasted embed snippet (e.g. tawk.to) — OWNER/ADMIN-only, not sanitized like
  // StaticPage content, since a chat widget needs a real <script> tag to function.
  liveChatEnabled: z.boolean(),
  liveChatCode: z.string().nullable(),
  updatedAt: z.string(),
});
export type BrandingConfig = z.infer<typeof brandingConfigSchema>;

export const updateBrandingSchema = brandingConfigSchema
  .omit({ updatedAt: true })
  .partial();
export type UpdateBrandingInput = z.infer<typeof updateBrandingSchema>;
