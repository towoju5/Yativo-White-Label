import { useQuery } from "@tanstack/react-query";
import type { TransactionDetail } from "@white-label/shared-types";
import { formatMinorAmount } from "@white-label/shared-types";
import { Printer, Share2, MessageCircle, Send, Mail, Copy, MoreHorizontal } from "lucide-react";
import { portalApi } from "@/lib/api-client";
import { fetchBranding } from "@/theme/branding";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

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

/**
 * Fee/rate breakdown rows shared by the on-screen detail list, the printed receipt, and the
 * share text. The headline amount (from the customer's own ledger entry) is always the NET
 * figure they actually received/paid — these rows only ever add a single combined "Fee" plus,
 * for deposits, the rate/local-amount context. Never split into provider-vs-platform pieces.
 */
function feeDetailRows(data: TransactionDetail): [string, string][] {
  const rows: [string, string][] = [];
  if (data.deposit) {
    const d = data.deposit;
    if (Number(d.totalFeeMinor) > 0) {
      rows.push(["Fee", `${formatMinorAmount(d.totalFeeMinor, 2)} ${d.currencyCode}`]);
    }
    if (d.exchangeRate) rows.push(["Exchange rate", d.exchangeRate]);
    if (d.localAmount && d.localCurrency) rows.push(["Amount paid", `${d.localAmount} ${d.localCurrency}`]);
  } else if (data.payout && Number(data.payout.platformFeeMinor) > 0) {
    rows.push(["Fee", `${formatMinorAmount(data.payout.platformFeeMinor, 2)} ${data.payout.currencyCode}`]);
  }
  return rows;
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
    ...feeDetailRows(data),
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

/** Plain-text summary for the Web Share API / clipboard fallback — same facts as the printed receipt, just without the HTML. */
function buildReceiptText(data: TransactionDetail, productName: string, amountLabel: string): string {
  const lines = [
    `${productName} — transaction receipt`,
    amountLabel,
    `Type: ${humanizeType(data.type)}`,
    `Status: ${data.status}`,
    ...(data.description ? [`Description: ${data.description}`] : []),
    ...(data.payout ? [`Recipient: ${data.payout.beneficiaryName}`] : []),
    ...feeDetailRows(data).map(([label, value]) => `${label}: ${value}`),
    `Transaction ID: ${data.id}`,
    `Date: ${new Date(data.createdAt).toLocaleString()}`,
  ];
  return lines.join("\n");
}

export function TransactionDetailDialog({ transactionId, onClose }: { transactionId: string | null; onClose: () => void }) {
  const { toast } = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ["portal", "transactions", transactionId],
    queryFn: () => portalApi.get<TransactionDetail>(`/portal/transactions/${transactionId}`),
    enabled: !!transactionId,
  });
  const { data: branding } = useQuery({ queryKey: ["branding"], queryFn: fetchBranding, staleTime: Infinity });

  const shareNative = async (txData: TransactionDetail, productName: string, amountLabel: string) => {
    const text = buildReceiptText(txData, productName, amountLabel);
    try {
      await navigator.share({ title: `Receipt · ${txData.id}`, text });
    } catch (err) {
      // AbortError just means the user closed the native share sheet — not a real failure.
      if (err instanceof Error && err.name !== "AbortError") {
        toast({ variant: "destructive", title: "Couldn't share", description: err.message });
      }
    }
  };

  const shareToWhatsApp = (txData: TransactionDetail, productName: string, amountLabel: string) => {
    const text = buildReceiptText(txData, productName, amountLabel);
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  const shareToTelegram = (txData: TransactionDetail, productName: string, amountLabel: string) => {
    const text = buildReceiptText(txData, productName, amountLabel);
    window.open(`https://t.me/share/url?url=&text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  const shareByEmail = (txData: TransactionDetail, productName: string, amountLabel: string) => {
    const text = buildReceiptText(txData, productName, amountLabel);
    window.location.href = `mailto:?subject=${encodeURIComponent(`Receipt · ${productName}`)}&body=${encodeURIComponent(text)}`;
  };

  const copyReceipt = async (txData: TransactionDetail, productName: string, amountLabel: string) => {
    const text = buildReceiptText(txData, productName, amountLabel);
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Receipt copied to clipboard" });
    } catch {
      toast({ variant: "destructive", title: "Couldn't copy receipt" });
    }
  };

  const primaryEntry = data?.entries[0];
  const amountLabel = primaryEntry
    ? `${primaryEntry.direction === "CREDIT" ? "+" : "-"}${formatMinorAmount(primaryEntry.amountMinor, 2)} ${primaryEntry.currencyCode}`
    : "";

  return (
    <Dialog open={!!transactionId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="scrollbar-hidden sm:max-w-xl">
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
              {feeDetailRows(data).map(([label, value]) => (
                <Row key={label} label={label} value={value} />
              ))}
              <Row label="Transaction ID" value={data.id} mono />
              <Row label="Date" value={new Date(data.createdAt).toLocaleString()} />
              {data.postedAt && <Row label="Posted" value={new Date(data.postedAt).toLocaleString()} />}
              {data.reversedAt && <Row label="Reversed" value={new Date(data.reversedAt).toLocaleString()} />}
            </dl>
            <div className="flex gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="flex-1" variant="outline">
                    <Share2 className="h-4 w-4" /> Share
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => shareToWhatsApp(data, branding?.productName ?? "Receipt", amountLabel)}>
                    <MessageCircle className="mr-2 h-4 w-4" /> WhatsApp
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => shareToTelegram(data, branding?.productName ?? "Receipt", amountLabel)}>
                    <Send className="mr-2 h-4 w-4" /> Telegram
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => shareByEmail(data, branding?.productName ?? "Receipt", amountLabel)}>
                    <Mail className="mr-2 h-4 w-4" /> Email
                  </DropdownMenuItem>
                  {typeof navigator !== "undefined" && !!navigator.share && (
                    <DropdownMenuItem onClick={() => shareNative(data, branding?.productName ?? "Receipt", amountLabel)}>
                      <MoreHorizontal className="mr-2 h-4 w-4" /> More apps…
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => copyReceipt(data, branding?.productName ?? "Receipt", amountLabel)}>
                    <Copy className="mr-2 h-4 w-4" /> Copy to clipboard
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                className="flex-1"
                variant="outline"
                onClick={() => openReceiptWindow(data, branding?.productName ?? "Receipt", amountLabel)}
              >
                <Printer className="h-4 w-4" /> Print receipt
              </Button>
            </div>
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
