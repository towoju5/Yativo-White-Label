import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatMinorAmount, type AdminTransfer, type AdminTransferParty } from "@white-label/shared-types";
import { ArrowDown, ArrowRightLeft, ChevronLeft, ChevronRight, Copy, ExternalLink, Eye, Search, X } from "lucide-react";
import { staffApi } from "@/lib/api-client";
import type { Paginated } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminTransactionDetailDialog } from "@/components/admin/AdminTransactionDetailDialog";

const PAGE_SIZE = 25;

const LEDGER_STATUS: Record<AdminTransfer["ledgerStatus"], { label: string; variant: "success" | "warning" | "destructive" }> = {
  POSTED: { label: "Completed", variant: "success" },
  PENDING: { label: "Pending", variant: "warning" },
  REVERSED: { label: "Reversed", variant: "destructive" },
};

const LOOKUP_LABEL: Record<string, string> = { EMAIL: "Email", PHONE: "Phone number", ID: "Customer ID", QR: "QR code / payment link" };

/** Transfers are always 2-decimal fiat today; kept as a helper so a future non-2dp currency is one change. */
const money = (minor: string, currency: string) => `${formatMinorAmount(minor, 2)} ${currency}`;

function PartyCell({ party }: { party: AdminTransferParty }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-medium">{party.name ?? party.email}</p>
      <p className="truncate font-mono text-xs text-muted-foreground">{party.publicId}</p>
    </div>
  );
}

export default function AdminTransfersPage() {
  const [params, setParams] = useSearchParams();
  const customerId = params.get("customerId") ?? undefined;
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Debounced — search hits name/email/ID across both parties.
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin", "transfers", { page, search, customerId, dateFrom, dateTo }],
    queryFn: () =>
      staffApi.get<Paginated<AdminTransfer>>("/admin/transfers", {
        page,
        pageSize: PAGE_SIZE,
        search: search || undefined,
        customerId,
        // Inclusive whole days in the admin's local timezone.
        dateFrom: dateFrom ? new Date(`${dateFrom}T00:00:00`).toISOString() : undefined,
        dateTo: dateTo ? new Date(`${dateTo}T23:59:59.999`).toISOString() : undefined,
      }),
    placeholderData: (prev) => prev,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const filterCustomer = customerId && data?.items[0] ? [data.items[0].sender, data.items[0].recipient].find((p) => p.customerId === customerId) : undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Internal transfers</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Customer-to-customer transfers settled inside the platform ledger</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search name, email, customer ID or reference…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="from" className="text-xs text-muted-foreground">From</Label>
          <Input id="from" type="date" className="w-40" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to" className="text-xs text-muted-foreground">To</Label>
          <Input id="to" type="date" className="w-40" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
        </div>
      </div>

      {customerId && (
        <div className="flex items-center gap-2 text-sm">
          <Badge variant="secondary" className="gap-1.5 py-1">
            Customer: {filterCustomer ? (filterCustomer.name ?? filterCustomer.email) : customerId}
            <button
              type="button"
              title="Clear customer filter"
              aria-label="Clear customer filter"
              onClick={() => {
                params.delete("customerId");
                setParams(params, { replace: true });
                setPage(1);
              }}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          <ArrowRightLeft className="mx-auto mb-2 h-6 w-6" />
          {search || customerId || dateFrom || dateTo ? "No transfers match these filters" : "No internal transfers yet"}
        </div>
      ) : (
        <>
          <div className={isFetching ? "opacity-70 transition-opacity" : undefined}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Fee</TableHead>
                  <TableHead className="text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((tr) => (
                  <TableRow key={tr.id} className="cursor-pointer" onClick={() => setSelectedId(tr.id)}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{new Date(tr.createdAt).toLocaleString()}</TableCell>
                    <TableCell className="max-w-[14rem]"><PartyCell party={tr.sender} /></TableCell>
                    <TableCell className="max-w-[14rem]"><PartyCell party={tr.recipient} /></TableCell>
                    <TableCell>
                      <Badge variant={LEDGER_STATUS[tr.ledgerStatus].variant}>{LEDGER_STATUS[tr.ledgerStatus].label}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">{money(tr.amountMinor, tr.currencyCode)}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">{tr.feeMinor === "0" ? "—" : money(tr.feeMinor, tr.currencyCode)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" title="View details" aria-label="View details" onClick={(e) => { e.stopPropagation(); setSelectedId(tr.id); }}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{data.total} transfer{data.total === 1 ? "" : "s"}</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" title="Previous page" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {page} / {totalPages}
              </span>
              <Button variant="outline" size="icon" title="Next page" aria-label="Next page" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      <TransferDetailSheet transferId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}

function PartyCard({ label, party }: { label: string; party: AdminTransferParty }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-1 truncate font-medium">{party.name ?? "—"}</p>
          <p className="truncate text-sm text-muted-foreground">{party.email}</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {party.publicId} · {party.type === "BUSINESS" ? "Business" : "Individual"}
          </p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild>
          <Link to={`/admin/customers/${party.customerId}`} title="Open customer" aria-label="Open customer">
            <ExternalLink className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
}

function TransferDetailSheet({ transferId, onClose }: { transferId: string | null; onClose: () => void }) {
  const { toast } = useToast();
  const [ledgerTxId, setLedgerTxId] = useState<string | null>(null);
  const { data: tr, isLoading } = useQuery({
    queryKey: ["admin", "transfers", "detail", transferId],
    queryFn: () => staffApi.get<AdminTransfer>(`/admin/transfers/${transferId}`),
    enabled: !!transferId,
  });

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied" });
    } catch {
      toast({ variant: "destructive", title: "Couldn't copy" });
    }
  };

  return (
    <>
      <Sheet open={!!transferId} onOpenChange={(v) => !v && onClose()}>
        <SheetContent className="flex w-full flex-col gap-5 sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Transfer details</SheetTitle>
            <SheetDescription>Customer-to-customer transfer</SheetDescription>
          </SheetHeader>
          {isLoading || !tr ? (
            <div className="space-y-3">
              <Skeleton className="h-16" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          ) : (
            <>
              <div className="rounded-2xl bg-muted/40 p-5 text-center">
                <p className="font-heading text-3xl font-semibold tracking-tight">{money(tr.amountMinor, tr.currencyCode)}</p>
                <Badge variant={LEDGER_STATUS[tr.ledgerStatus].variant} className="mt-2">
                  {LEDGER_STATUS[tr.ledgerStatus].label}
                </Badge>
              </div>

              <div className="space-y-2">
                <PartyCard label="From" party={tr.sender} />
                <div className="flex justify-center text-muted-foreground">
                  <ArrowDown className="h-4 w-4" />
                </div>
                <PartyCard label="To" party={tr.recipient} />
              </div>

              <div>
                <DetailRow label="Amount received">{money(tr.amountMinor, tr.currencyCode)}</DetailRow>
                <DetailRow label="Fee (platform revenue)">{tr.feeMinor === "0" ? "None" : money(tr.feeMinor, tr.currencyCode)}</DetailRow>
                <DetailRow label="Total debited from sender">
                  <span className="font-medium">{money(tr.totalDebitMinor, tr.currencyCode)}</span>
                </DetailRow>
                <Separator className="my-2" />
                <DetailRow label="Note">{tr.note ?? <span className="text-muted-foreground">—</span>}</DetailRow>
                <DetailRow label="Recipient found by">{LOOKUP_LABEL[tr.lookupMethod] ?? tr.lookupMethod}</DetailRow>
                <DetailRow label="Date">{new Date(tr.createdAt).toLocaleString()}</DetailRow>
                <DetailRow label="Transfer ID">
                  <button type="button" className="inline-flex items-center gap-1 font-mono text-xs hover:text-primary" title="Copy transfer ID" onClick={() => copy(tr.id)}>
                    {tr.id} <Copy className="h-3 w-3" />
                  </button>
                </DetailRow>
                <DetailRow label="Ledger reference">
                  <button type="button" className="inline-flex items-center gap-1 font-mono text-xs hover:text-primary" title="Copy ledger reference" onClick={() => copy(tr.transactionId)}>
                    {tr.transactionId} <Copy className="h-3 w-3" />
                  </button>
                </DetailRow>
              </div>

              <Button variant="outline" onClick={() => setLedgerTxId(tr.transactionId)}>
                <Eye className="h-4 w-4" /> View ledger entries
              </Button>
            </>
          )}
        </SheetContent>
      </Sheet>
      <AdminTransactionDetailDialog transactionId={ledgerTxId} onClose={() => setLedgerTxId(null)} />
    </>
  );
}
