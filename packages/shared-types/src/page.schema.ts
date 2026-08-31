import { z } from "zod";

export const STATIC_PAGE_KINDS = ["SYSTEM", "CUSTOM"] as const;
export const staticPageKindSchema = z.enum(STATIC_PAGE_KINDS);
export type StaticPageKind = z.infer<typeof staticPageKindSchema>;

export const staticPageSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  contentHtml: z.string(),
  kind: staticPageKindSchema,
  isPublished: z.boolean(),
  showInFooter: z.boolean(),
  showInSupport: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type StaticPage = z.infer<typeof staticPageSchema>;

/** Footer/nav listing — no HTML body, just enough to render a link. */
export const staticPageSummarySchema = z.object({
  slug: z.string(),
  title: z.string(),
});
export type StaticPageSummary = z.infer<typeof staticPageSummarySchema>;

const slugSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens only (e.g. \"about-us\")");

export const createStaticPageSchema = z.object({
  slug: slugSchema,
  title: z.string().min(1).max(200),
  contentHtml: z.string().max(500_000),
  isPublished: z.boolean().default(true),
  showInFooter: z.boolean().default(true),
  showInSupport: z.boolean().default(false),
});
export type CreateStaticPageInput = z.infer<typeof createStaticPageSchema>;

export const updateStaticPageSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  contentHtml: z.string().max(500_000).optional(),
  isPublished: z.boolean().optional(),
  showInFooter: z.boolean().optional(),
  showInSupport: z.boolean().optional(),
});
export type UpdateStaticPageInput = z.infer<typeof updateStaticPageSchema>;
