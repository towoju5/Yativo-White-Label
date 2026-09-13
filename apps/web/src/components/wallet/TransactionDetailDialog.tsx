import { useQuery } from "@tanstack/react-query";
import type { TransactionDetail } from "@white-label/shared-types";
import { formatMinorAmount } from "@white-label/shared-types";
import { Printer, Share2, Download, Copy } from "lucide-react";
import { portalApi } from "@/lib/api-client";
import { fetchBranding } from "@/theme/branding";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { humanizeType, feeDetailRows, buildReceiptRows, renderReceiptPng, receiptFileName } from "./receiptImage";

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  POSTED: "success",
  PENDING: "warning",
  REVERSED: "destructive",
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Opens a dedicated print window with a minimal, self-contained receipt — sidesteps having to hide the rest of the app (nav, dialog chrome) via print CSS, and guarantees a clean printout regardless of the current theme. The browser's own "Save as PDF" print destination is this receipt's PDF path. */
function openReceiptWindow(data: TransactionDetail, productName: string, amountLabel: string) {
  const win = window.open("", "_blank", "width=680,height=860");
  if (!win) return;

  const rows = buildReceiptRows(data);

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

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function TransactionDetailDialog({ transactionId, onClose }: { transactionId: string | null; onClose: () => void }) {
  const { toast } = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ["portal", "transactions", transactionId],
    queryFn: () => portalApi.get<TransactionDetail>(`/portal/transactions/${transactionId}`),
    enabled: !!transactionId,
  });
  const { data: branding } = useQuery({ queryKey: ["branding"], queryFn: fetchBranding, staleTime: Infinity });

  // Every share/download/copy action below operates on the same rendered PNG — never plain text,
  // so whatever the receipt is handed off to (a chat app, an email attachment, a clipboard paste)
  // gets an actual image, not a wall of text it has to render itself.
  const getReceiptFile = async (txData: TransactionDetail, productName: string, primaryColor: string | null | undefined, amountLabel: string, isCredit: boolean) => {
    const blob = await renderReceiptPng(txData, { productName, primaryColor, amountLabel, isCredit });
    return new File([blob], receiptFileName(txData.id), { type: "image/png" });
  };

  const shareImage = async (txData: TransactionDetail, productName: string, primaryColor: string | null | undefined, amountLabel: string, isCredit: boolean) => {
    try {
      const file = await getReceiptFile(txData, productName, primaryColor, amountLabel, isCredit);
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Receipt · ${txData.id}` });
        return;
      }
      // No file-sharing support in this browser (common on desktop) — an image can't reach
      // another app without one, so fall back to a direct download instead of silently
      // degrading to a text share.
      downloadBlob(file, file.name);
      toast({ title: "Receipt downloaded", description: "This browser can't share files directly — attach the downloaded image instead." });
    } catch (err) {
      // AbortError just means the user closed the native share sheet — not a real failure.
      if (err instanceof Error && err.name !== "AbortError") {
        toast({ variant: "destructive", title: "Couldn't share", description: err.message });
      }
    }
  };

  const downloadImage = async (txData: TransactionDetail, productName: string, primaryColor: string | null | undefined, amountLabel: string, isCredit: boolean) => {
    try {
      const file = await getReceiptFile(txData, productName, primaryColor, amountLabel, isCredit);
      downloadBlob(file, file.name);
    } catch (err) {
      toast({ variant: "destructive", title: "Couldn't generate receipt image", description: err instanceof Error ? err.message : undefined });
    }
  };

  const copyImage = async (txData: TransactionDetail, productName: string, primaryColor: string | null | undefined, amountLabel: string, isCredit: boolean) => {
    try {
      const file = await getReceiptFile(txData, productName, primaryColor, amountLabel, isCredit);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": file })]);
      toast({ title: "Receipt image copied to clipboard" });
    } catch {
      toast({ variant: "destructive", title: "Couldn't copy image", description: "Try downloading it instead." });
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
                  <DropdownMenuItem
                    onClick={() => shareImage(data, branding?.productName ?? "Receipt", branding?.primaryColor, amountLabel, primaryEntry?.direction === "CREDIT")}
                  >
                    <Share2 className="mr-2 h-4 w-4" /> Share image
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => downloadImage(data, branding?.productName ?? "Receipt", branding?.primaryColor, amountLabel, primaryEntry?.direction === "CREDIT")}
                  >
                    <Download className="mr-2 h-4 w-4" /> Download image
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => copyImage(data, branding?.productName ?? "Receipt", branding?.primaryColor, amountLabel, primaryEntry?.direction === "CREDIT")}
                  >
                    <Copy className="mr-2 h-4 w-4" /> Copy image
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                className="flex-1"
                variant="outline"
                onClick={() => openReceiptWindow(data, branding?.productName ?? "Receipt", amountLabel)}
              >
                <Printer className="h-4 w-4" /> Print receipt (PDF)
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
