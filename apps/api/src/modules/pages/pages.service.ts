import type { PrismaClient, StaticPage } from "@prisma/client";
import sanitizeHtml from "sanitize-html";
import type { CreateStaticPageInput, UpdateStaticPageInput } from "@white-label/shared-types";
import { AppError, NotFoundError } from "../../lib/errors.js";

// Admin-authored HTML rendered directly on public pages — sanitized on every write so what's
// stored is already safe to render, regardless of how many places later read it back. No script,
// style, iframe, form, or event-handler attributes; links/images are allowed since real legal and
// marketing copy needs them.
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "h1", "h2", "h3", "h4", "h5", "h6", "p", "br", "hr", "strong", "b", "em", "i", "u", "s",
    "ul", "ol", "li", "a", "img", "blockquote", "code", "pre", "table", "thead", "tbody",
    "tr", "td", "th", "div", "span",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel", "class"],
    img: ["src", "alt", "width", "height", "class"],
    "*": ["class"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }, true),
  },
};

export function sanitizePageHtml(html: string): string {
  return sanitizeHtml(html, SANITIZE_OPTIONS);
}

function toDto(p: StaticPage) {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    contentHtml: p.contentHtml,
    kind: p.kind,
    isPublished: p.isPublished,
    showInFooter: p.showInFooter,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export async function listStaticPages(prisma: PrismaClient) {
  const pages = await prisma.staticPage.findMany({ orderBy: { createdAt: "asc" } });
  return pages.map(toDto);
}

export async function getStaticPageById(prisma: PrismaClient, id: string) {
  const page = await prisma.staticPage.findUnique({ where: { id } });
  if (!page) throw new NotFoundError("Page");
  return toDto(page);
}

/** Public-facing lookup — only ever returns a page a visitor is actually allowed to see. */
export async function getPublishedPageBySlug(prisma: PrismaClient, slug: string) {
  const page = await prisma.staticPage.findUnique({ where: { slug } });
  if (!page || !page.isPublished) throw new NotFoundError("Page");
  return toDto(page);
}

/** Footer/nav listing — published pages flagged to appear there, title + slug only. */
export async function listFooterPages(prisma: PrismaClient) {
  const pages = await prisma.staticPage.findMany({
    where: { isPublished: true, showInFooter: true },
    orderBy: { createdAt: "asc" },
    select: { slug: true, title: true },
  });
  return pages;
}

export async function createStaticPage(prisma: PrismaClient, input: CreateStaticPageInput) {
  const existing = await prisma.staticPage.findUnique({ where: { slug: input.slug } });
  if (existing) throw new AppError(`A page with slug "${input.slug}" already exists.`, 409, "SLUG_TAKEN");

  const page = await prisma.staticPage.create({
    data: {
      slug: input.slug,
      title: input.title,
      contentHtml: sanitizePageHtml(input.contentHtml),
      kind: "CUSTOM",
      isPublished: input.isPublished,
      showInFooter: input.showInFooter,
    },
  });
  return toDto(page);
}

export async function updateStaticPage(prisma: PrismaClient, id: string, input: UpdateStaticPageInput) {
  const existing = await prisma.staticPage.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Page");

  const page = await prisma.staticPage.update({
    where: { id },
    data: {
      title: input.title,
      contentHtml: input.contentHtml !== undefined ? sanitizePageHtml(input.contentHtml) : undefined,
      isPublished: input.isPublished,
      showInFooter: input.showInFooter,
    },
  });
  return toDto(page);
}

export async function deleteStaticPage(prisma: PrismaClient, id: string) {
  const existing = await prisma.staticPage.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Page");
  if (existing.kind === "SYSTEM") {
    throw new AppError(`"${existing.title}" is a built-in page and can't be deleted — you can still edit its content.`, 409, "SYSTEM_PAGE");
  }
  await prisma.staticPage.delete({ where: { id } });
}
