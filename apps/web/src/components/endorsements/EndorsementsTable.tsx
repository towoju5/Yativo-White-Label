import { useState } from "react";
import type { CustomerEndorsement } from "@white-label/shared-types";
import { ExternalLink, Loader2, RotateCw } from "lucide-react";
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

/** errors/requirementsDue/futureRequirementsDue/metadata come back as a string, an array, an object, or null depending on the service — flatten whichever shape shows up into one readable line, or null if there's nothing worth showing. */
function formatFlexibleField(value: string | unknown[] | Record<string, unknown> | null): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    const parts = value.map((v) => (typeof v === "string" ? v : JSON.stringify(v))).filter(Boolean);
    return parts.length ? parts.join(", ") : null;
  }
  const parts = Object.values(value)
    .flatMap((v) => (Array.isArray(v) ? v : [v]))
    .map((v) => (typeof v === "string" ? v.replace(/_/g, " ") : JSON.stringify(v)))
    .filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

export function EndorsementsTable({
  endorsements,
  isLoading,
  errorMessage,
  onGenerateLink,
  onResubmit,
  showHiddenBadge,
}: {
  endorsements: CustomerEndorsement[] | undefined;
  isLoading: boolean;
  errorMessage?: string | null;
  /**
   * Fetches a fresh hosted verification link for one service and returns the customer's full,
   * updated endorsement list. Only shown for a service the passive endorsements fetch already
   * reports a hostedKycUrl for (services that don't need hosted verification, or that Yativo
   * hasn't set one up for, get no action at all) — calling it for one pending service tends to
   * refresh every other pending service's link too, which is why the whole list comes back
   * rather than just one entry. Omit to render the table read-only (no generate/view actions) —
   * used where the caller hasn't wired a mutation.
   */
  onGenerateLink?: (service: string) => Promise<CustomerEndorsement[]>;
  /**
   * Re-runs KYC verification for one endorsement (e.g. after the customer updated their ID/
   * selfie) and returns the customer's full, updated endorsement list. Only supported for
   * individual customers upstream — the caller decides whether to pass this at all based on the
   * selected customer's type, same as onGenerateLink's own gating by caller.
   */
  onResubmit?: (service: string) => Promise<CustomerEndorsement[]>;
  /** Admin-only: flags a service an admin has hidden from the customer-facing checklist. The portal never renders those rows at all (they're already filtered out server-side), so this only makes sense here. */
  showHiddenBadge?: boolean;
}) {
  const { toast } = useToast();
  const [overrides, setOverrides] = useState<Record<string, CustomerEndorsement>>({});
  const [generatingService, setGeneratingService] = useState<string | null>(null);
  const [resubmittingService, setResubmittingService] = useState<string | null>(null);
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

  const applyOverrides = (updated: CustomerEndorsement[]) => {
    setOverrides((prev) => {
      const next = { ...prev };
      for (const e of updated) next[e.service] = e;
      return next;
    });
  };

  const handleGenerate = async (service: string) => {
    if (!onGenerateLink) return;
    setGeneratingService(service);
    try {
      const updated = await onGenerateLink(service);
      applyOverrides(updated);
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

  const handleResubmit = async (service: string) => {
    if (!onResubmit) return;
    setResubmittingService(service);
    try {
      const updated = await onResubmit(service);
      applyOverrides(updated);
      toast({ title: `Resubmitted ${formatServiceName(service)} for verification` });
    } catch (e) {
      toast({ variant: "destructive", title: "Couldn't resubmit", description: e instanceof ApiError ? e.message : undefined });
    } finally {
      setResubmittingService(null);
    }
  };

  const labelFor = (e: CustomerEndorsement) => e.displayName || formatServiceName(e.service);

  const renderName = (e: CustomerEndorsement) => {
    const errorText = e.status !== "approved" ? formatFlexibleField(e.errors) : null;
    const requirementsText = e.status !== "approved" ? formatFlexibleField(e.requirementsDue) : null;
    return (
      <>
        <span>{labelFor(e)}</span>
        {showHiddenBadge && !e.isVisible && (
          <Badge variant="secondary" className="ml-2 align-middle text-[10px]">
            Hidden from customers
          </Badge>
        )}
        {e.description && <p className="mt-0.5 text-xs font-normal text-muted-foreground">{e.description}</p>}
        {errorText && <p className="mt-0.5 text-xs font-normal text-destructive">{errorText}</p>}
        {requirementsText && <p className="mt-0.5 text-xs font-normal text-muted-foreground">Needs: {requirementsText}</p>}
      </>
    );
  };

  const renderLinkAction = (e: CustomerEndorsement) =>
    e.status === "approved" || !e.hostedKycUrl ? (
      <span className="text-muted-foreground">—</span>
    ) : onGenerateLink ? (
      <Button variant="ghost" size="sm" disabled={generatingService === e.service} onClick={() => handleGenerate(e.service)}>
        {generatingService === e.service ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Generate link"}
      </Button>
    ) : (
      <Button variant="ghost" size="sm" onClick={() => setViewing({ url: e.hostedKycUrl!, service: e.service })}>
        View <ExternalLink className="h-3.5 w-3.5" />
      </Button>
    );

  const renderAction = (e: CustomerEndorsement) => (
    <div className="flex items-center justify-end gap-1">
      {onResubmit && (
        <Button
          variant="ghost"
          size="sm"
          disabled={resubmittingService === e.service}
          onClick={() => handleResubmit(e.service)}
          title={`Resubmit ${labelFor(e)} for verification`}
        >
          {resubmittingService === e.service ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
        </Button>
      )}
      {renderLinkAction(e)}
    </div>
  );

  return (
    <>
      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Service</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last updated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {merged.map((e) => (
              <TableRow key={e.service}>
                <TableCell className="font-medium">{renderName(e)}</TableCell>
                <TableCell>
                  <Badge variant={ENDORSEMENT_VARIANT[e.status] ?? "secondary"}>{formatServiceName(e.status)}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{e.updated ?? "—"}</TableCell>
                <TableCell className="text-right">{renderAction(e)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:hidden">
        {merged.map((e) => (
          <div key={e.service} className="rounded-lg border border-border bg-card p-4 shadow-soft">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">{renderName(e)}</p>
              <Badge variant={ENDORSEMENT_VARIANT[e.status] ?? "secondary"}>{formatServiceName(e.status)}</Badge>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">{e.updated ?? "—"}</span>
              {renderAction(e)}
            </div>
          </div>
        ))}
      </div>

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
