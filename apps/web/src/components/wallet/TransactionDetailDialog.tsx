import { useQuery } from "@tanstack/react-query";
import type { TransactionDetail } from "@white-label/shared-types";
import { formatMinorAmount } from "@white-label/shared-types";
import { Printer } from "lucide-react";
import { portalApi } from "@/lib/api-client";
import { fetchBranding } from "@/theme/branding";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  POSTED: "success",
  PENDING: "warning",
  REVERSED: "destructive",
};

function humanizeType(type: string) {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Opens a dedicated print window with a minimal, self-contained receipt — sidesteps having to hide the rest of the app (nav, dialog chrome) via print CSS, and guarantees a clean printout regardless of the current theme. */
function openReceiptWindow(data: TransactionDetail, productName: string, amountLabel: string) {
  const win = window.open("", "_blank", "width=680,height=860");
  if (!win) return;

  const rows: [string, string][] = [
    ["Type", humanizeType(data.type)],
    ["Status", data.status],
    ...(data.description ? ([["Description", data.description]] as [string, string][]) : []),
    ...(data.payout ? ([["Recipient", data.payout.beneficiaryName]] as [string, string][]) : []),
    ...(data.payout?.yativoPayoutId ? ([["Payout reference", data.payout.yativoPayoutId]] as [string, string][]) : []),
    ...(data.externalRef ? ([["Provider reference", data.externalRef]] as [string, string][]) : []),
    ["Transaction ID", data.id],
    ["Date", new Date(data.createdAt).toLocaleString()],
    ...(data.postedAt ? ([["Posted", new Date(data.postedAt).toLocaleString()]] as [string, string][]) : []),
    ...(data.reversedAt ? ([["Reversed", new Date(data.reversedAt).toLocaleString()]] as [string, string][]) : []),
  ];

  win.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Receipt · ${escapeHtml(data.id)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 480px; margin: 40px auto; color: #111; padding: 0 24px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .muted { color: #666; font-size: 13px; margin: 0; }
  .amount { font-size: 32px; font-weight: 700; margin: 24px 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  td { padding: 10px 0; border-bottom: 1px solid #eee; font-size: 14px; vertical-align: top; }
  td:first-child { color: #666; width: 40%; }
  td:last-child { text-align: right; font-weight: 500; word-break: break-word; }
  .footer { margin-top: 28px; font-size: 11px; color: #999; text-align: center; }
  @media print { body { margin: 0 auto; } }
</style>
</head>
<body>
  <h1>${escapeHtml(productName)}</h1>
  <p class="muted">Transaction receipt</p>
  <div class="amount">${escapeHtml(amountLabel)}</div>
  <table>
    ${rows.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`).join("")}
  </table>
  <p class="footer">Generated ${new Date().toLocaleString()}</p>
</body>
</html>`);
  win.document.close();
  win.focus();
  // Give the window a beat to finish laying out before invoking the print dialog.
  setTimeout(() => win.print(), 300);
}

export function TransactionDetailDialog({ transactionId, onClose }: { transactionId: string | null; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["portal", "transactions", transactionId],
    queryFn: () => portalApi.get<TransactionDetail>(`/portal/transactions/${transactionId}`),
    enabled: !!transactionId,
  });
  const { data: branding } = useQuery({ queryKey: ["branding"], queryFn: fetchBranding, staleTime: Infinity });

  const primaryEntry = data?.entries[0];
  const amountLabel = primaryEntry
    ? `${primaryEntry.direction === "CREDIT" ? "+" : "-"}${formatMinorAmount(primaryEntry.amountMinor, 2)} ${primaryEntry.currencyCode}`
    : "";

  return (
    <Dialog open={!!transactionId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transaction details</DialogTitle>
        </DialogHeader>
        {isLoading || !data ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className={`font-heading text-2xl font-semibold ${primaryEntry?.direction === "CREDIT" ? "text-success" : ""}`}>{amountLabel}</p>
                <p className="text-sm text-muted-foreground">{data.description ?? humanizeType(data.type)}</p>
              </div>
              <Badge variant={STATUS_VARIANT[data.status] ?? "secondary"}>{data.status}</Badge>
            </div>
            <dl className="divide-y divide-border rounded-lg border border-border text-sm">
              <Row label="Type" value={humanizeType(data.type)} />
              {data.payout && <Row label="Recipient" value={data.payout.beneficiaryName} />}
              {data.payout?.yativoPayoutId && <Row label="Payout reference" value={data.payout.yativoPayoutId} mono />}
              {data.externalRef && <Row label="Provider reference" value={data.externalRef} mono />}
              <Row label="Transaction ID" value={data.id} mono />
              <Row label="Date" value={new Date(data.createdAt).toLocaleString()} />
              {data.postedAt && <Row label="Posted" value={new Date(data.postedAt).toLocaleString()} />}
              {data.reversedAt && <Row label="Reversed" value={new Date(data.reversedAt).toLocaleString()} />}
            </dl>
            <Button
              className="w-full"
              variant="outline"
              onClick={() => openReceiptWindow(data, branding?.productName ?? "Receipt", amountLabel)}
            >
              <Printer className="h-4 w-4" /> Print receipt
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={mono ? "truncate font-mono text-xs" : "truncate"}>{value}</dd>
    </div>
  );
}
