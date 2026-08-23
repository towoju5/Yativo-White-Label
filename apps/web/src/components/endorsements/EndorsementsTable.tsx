import { useState } from "react";
import type { CustomerEndorsement } from "@white-label/shared-types";
import { ExternalLink, Loader2 } from "lucide-react";
import { ApiError } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const ENDORSEMENT_VARIANT: Record<string, "success" | "warning" | "secondary"> = {
  approved: "success",
  pending: "warning",
  not_started: "secondary",
};

function formatServiceName(service: string) {
  return service.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function EndorsementsTable({
  endorsements,
  isLoading,
  errorMessage,
  onGenerateLink,
}: {
  endorsements: CustomerEndorsement[] | undefined;
  isLoading: boolean;
  errorMessage?: string | null;
  /**
   * Fetches a fresh hosted verification link for one service and returns the customer's full,
   * updated endorsement list — Yativo never includes a usable link on the passive endorsements
   * fetch (confirmed live: always null/empty there), only from this dedicated regenerate call,
   * and calling it for one pending service tends to refresh every other pending service's link
   * too, which is why the whole list comes back rather than just one entry. Omit to render the
   * table read-only (no generate/view actions) — used where the caller hasn't wired a mutation.
   */
  onGenerateLink?: (service: string) => Promise<CustomerEndorsement[]>;
}) {
  const { toast } = useToast();
  const [overrides, setOverrides] = useState<Record<string, CustomerEndorsement>>({});
  const [generatingService, setGeneratingService] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ url: string; service: string } | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    );
  }

  if (errorMessage) {
    return <p className="text-sm text-muted-foreground">{errorMessage}</p>;
  }

  if (!endorsements || endorsements.length === 0) {
    return <p className="text-sm text-muted-foreground">No endorsement data yet.</p>;
  }

  const merged = endorsements.map((e) => overrides[e.service] ?? e);

  const handleGenerate = async (service: string) => {
    if (!onGenerateLink) return;
    setGeneratingService(service);
    try {
      const updated = await onGenerateLink(service);
      setOverrides((prev) => {
        const next = { ...prev };
        for (const e of updated) next[e.service] = e;
        return next;
      });
      const fresh = updated.find((e) => e.service === service);
      if (fresh?.hostedKycUrl) {
        setViewing({ url: fresh.hostedKycUrl, service });
      } else {
        toast({ title: "No verification link is available for this service yet." });
      }
    } catch (e) {
      toast({ variant: "destructive", title: "Couldn't generate link", description: e instanceof ApiError ? e.message : undefined });
    } finally {
      setGeneratingService(null);
    }
  };

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Service</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last updated</TableHead>
            <TableHead className="text-right">Verification link</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {merged.map((e) => (
            <TableRow key={e.service}>
              <TableCell className="font-medium">{formatServiceName(e.service)}</TableCell>
              <TableCell>
                <Badge variant={ENDORSEMENT_VARIANT[e.status] ?? "secondary"}>{formatServiceName(e.status)}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">{e.updated ?? "—"}</TableCell>
              <TableCell className="text-right">
                {e.status === "approved" ? (
                  <span className="text-muted-foreground">—</span>
                ) : e.hostedKycUrl ? (
                  <Button variant="ghost" size="sm" onClick={() => setViewing({ url: e.hostedKycUrl!, service: e.service })}>
                    View <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                ) : onGenerateLink ? (
                  <Button variant="ghost" size="sm" disabled={generatingService === e.service} onClick={() => handleGenerate(e.service)}>
                    {generatingService === e.service ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Generate link"}
                  </Button>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
        <DialogContent className="max-w-3xl overflow-hidden p-0 sm:max-h-[85vh]">
          <DialogHeader className="flex-row items-center justify-between border-b border-border px-4 py-3">
            <DialogTitle className="text-base">{viewing ? formatServiceName(viewing.service) : ""} verification</DialogTitle>
            {viewing && (
              <a
                href={viewing.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Open in new tab <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </DialogHeader>
          {viewing && (
            // The identity-verification provider Yativo hands these sessions off to (Noah) blocks
            // being framed client-side — confirmed live: no X-Frame-Options and only a
            // report-only CSP, yet the request still aborts inside an iframe (net::ERR_ABORTED)
            // while the exact same URL loads fine as a top-level navigation. That's the
            // provider's own anti-clickjacking protection on an identity flow, not something a
            // `sandbox`/`allow` tweak on our end can get around. We still attempt the iframe
            // below in case a given session behaves differently, but always keep the "Open in
            // new tab" link above as the reliable path.
            <iframe
              src={viewing.url}
              title={`${formatServiceName(viewing.service)} verification`}
              className="h-[75vh] w-full border-0"
              allow="camera; microphone; clipboard-write"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
