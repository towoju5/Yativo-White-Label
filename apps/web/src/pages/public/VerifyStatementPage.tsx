import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, Link as LinkIcon, ShieldAlert } from "lucide-react";
import { publicApi, ApiError } from "@/lib/api-client";
import { fetchBranding } from "@/theme/branding";
import { BrandLogo } from "@/components/BrandLogo";
import { Skeleton } from "@/components/ui/skeleton";

type VerifyResult = {
  productName: string;
  customerName: string;
  accountLabel: string;
  currencyCode: string;
  dateFrom: string;
  dateTo: string;
  closingBalance: string;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}

/** Public, unauthenticated page reached by scanning a statement's QR code — anyone holding a
 * printed/PDF statement can confirm it's genuine without logging in. Shows only the masked
 * summary the API returns (see publicStatements.routes.ts) — never full account numbers or
 * transaction history. */
export default function VerifyStatementPage() {
  const { token = "" } = useParams<{ token: string }>();

  const { data: branding } = useQuery({ queryKey: ["branding"], queryFn: fetchBranding, staleTime: Infinity });
  const productName = branding?.productName ?? "White Label";

  const query = useQuery({
    queryKey: ["verify-statement", token],
    queryFn: () => publicApi.get<VerifyResult>(`/public/statements/verify/${token}`),
    retry: (failureCount, error) => !(error instanceof ApiError && error.status === 404) && failureCount < 2,
  });

  useEffect(() => {
    document.title = `Verify statement — ${productName}`;
  }, [productName]);

  return (
    <div className="flex min-h-screen flex-col items-center bg-background px-6 py-16 text-foreground">
      <Link to="/" className="mb-10 flex items-center gap-2">
        {branding?.logoUrl ? (
          <BrandLogo branding={branding} className="h-7 w-7 rounded-md object-cover" />
        ) : (
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
            {productName.slice(0, 1)}
          </div>
        )}
        <span className="font-heading text-sm font-semibold">{productName}</span>
      </Link>

      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        {query.isLoading ? (
          <div className="space-y-4">
            <Skeleton className="mx-auto h-12 w-12 rounded-full" />
            <Skeleton className="h-5 w-40 mx-auto" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        ) : query.data ? (
          <div className="space-y-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400">
              <BadgeCheck className="h-7 w-7" />
            </div>
            <div>
              <h1 className="font-heading text-lg font-semibold">Statement verified</h1>
              <p className="mt-1 text-sm text-muted-foreground">This is a genuine statement of account issued by {query.data.productName}.</p>
            </div>
            <dl className="space-y-3 rounded-lg border border-border bg-muted/30 p-4 text-left text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Account holder</dt>
                <dd className="font-medium">{query.data.customerName}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Account</dt>
                <dd className="font-medium">{query.data.accountLabel}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Period</dt>
                <dd className="font-medium">
                  {formatDate(query.data.dateFrom)} – {formatDate(query.data.dateTo)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Closing balance</dt>
                <dd className="font-medium">
                  {query.data.closingBalance} {query.data.currencyCode}
                </dd>
              </div>
            </dl>
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <LinkIcon className="h-3 w-3" /> Balance reflects the live account ledger as of now.
            </p>
          </div>
        ) : (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <ShieldAlert className="h-7 w-7" />
            </div>
            <div>
              <h1 className="font-heading text-lg font-semibold">Couldn't verify this statement</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {query.error instanceof ApiError ? query.error.message : "This verification link is invalid, expired, or has been tampered with."}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
