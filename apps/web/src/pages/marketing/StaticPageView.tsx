import { useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { StaticPage } from "@white-label/shared-types";
import { ArrowLeft, FileQuestion } from "lucide-react";
import { publicApi, ApiError } from "@/lib/api-client";
import { fetchBranding } from "@/theme/branding";
import { Skeleton } from "@/components/ui/skeleton";

export default function StaticPageView() {
  const { slug = "" } = useParams<{ slug: string }>();

  const { data: branding } = useQuery({ queryKey: ["branding"], queryFn: fetchBranding, staleTime: Infinity });
  const productName = branding?.productName ?? "White Label";

  const pageQuery = useQuery({
    queryKey: ["pages", slug],
    queryFn: () => publicApi.get<StaticPage>(`/pages/${slug}`),
    retry: (failureCount, error) => !(error instanceof ApiError && error.status === 404) && failureCount < 2,
  });

  useEffect(() => {
    if (pageQuery.data) document.title = `${pageQuery.data.title} — ${productName}`;
  }, [pageQuery.data, productName]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2">
            {branding?.logoUrl ? (
              <img src={branding.logoUrl} alt="" className="h-7 w-7 rounded-md object-cover" />
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
                {productName.slice(0, 1)}
              </div>
            )}
            <span className="font-heading text-sm font-semibold">{productName}</span>
          </Link>
          <Link to="/" className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Back home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        {pageQuery.isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/6" />
          </div>
        ) : !pageQuery.data ? (
          <div className="flex flex-col items-center py-16 text-center">
            <FileQuestion className="h-10 w-10 text-muted-foreground" />
            <h1 className="mt-4 font-heading text-xl font-semibold">Page not found</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">This page doesn't exist or is no longer published.</p>
            <Link to="/" className="mt-6 text-sm font-medium text-primary hover:underline">
              Return home
            </Link>
          </div>
        ) : (
          <article>
            <h1 className="font-heading text-3xl font-bold tracking-tight">{pageQuery.data.title}</h1>
            <p className="mt-1.5 text-xs text-muted-foreground">Last updated {new Date(pageQuery.data.updatedAt).toLocaleDateString()}</p>
            <div
              className="prose prose-sm sm:prose-base dark:prose-invert mt-8 max-w-none prose-headings:font-heading prose-headings:font-semibold prose-a:text-primary"
              // Content is sanitized server-side on every write (see apps/api/.../pages.service.ts)
              // before it's ever persisted — safe to render as-is here.
              dangerouslySetInnerHTML={{ __html: pageQuery.data.contentHtml }}
            />
          </article>
        )}
      </main>
    </div>
  );
}
