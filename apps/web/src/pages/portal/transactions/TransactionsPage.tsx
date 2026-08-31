import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CustomerTransactionListItem, WalletBalance } from "@white-label/shared-types";
import { formatMinorAmount, LEDGER_TRANSACTION_TYPES, LEDGER_TRANSACTION_STATUSES } from "@white-label/shared-types";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { portalApi } from "@/lib/api-client";
import type { Paginated } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TransactionDetailDialog } from "@/components/wallet/TransactionDetailDialog";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  POSTED: "success",
  PENDING: "warning",
  REVERSED: "destructive",
};

export default function PortalTransactionsPage() {
  const { t } = useTranslation();
  const [type, setType] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [currencyCode, setCurrencyCode] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);

  const { data: wallets } = useQuery({
    queryKey: ["portal", "wallets"],
    queryFn: () => portalApi.get<WalletBalance[]>("/portal/wallets"),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["portal", "transactions", { type, status, currencyCode, dateFrom, dateTo, page }],
    queryFn: () =>
      portalApi.get<Paginated<CustomerTransactionListItem>>("/portal/transactions", {
        type: type === "ALL" ? undefined : type,
        status: status === "ALL" ? undefined : status,
        currencyCode: currencyCode === "ALL" ? undefined : currencyCode,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{t("transactions.title", "Transaction history")}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{t("transactions.subtitle", "Every transaction across all of your wallets")}</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Select value={type} onValueChange={resetPage(setType)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t("transactions.type", "Type")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t("transactions.allTypes", "All types")}</SelectItem>
            {LEDGER_TRANSACTION_TYPES.map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={resetPage(setStatus)}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder={t("transactions.status", "Status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t("transactions.allStatuses", "All statuses")}</SelectItem>
            {LEDGER_TRANSACTION_STATUSES.map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {wallets && wallets.length > 1 && (
          <Select value={currencyCode} onValueChange={resetPage(setCurrencyCode)}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder={t("transactions.currency", "Currency")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t("transactions.allCurrencies", "All currencies")}</SelectItem>
              {wallets.map((w) => (
                <SelectItem key={w.walletId} value={w.currencyCode}>
                  {w.currencyCode}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="space-y-1">
          <Label htmlFor="dateFrom" className="text-xs text-muted-foreground">
            {t("transactions.from", "From")}
          </Label>
          <Input id="dateFrom" type="date" className="w-40" value={dateFrom} onChange={(e) => resetPage(setDateFrom)(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="dateTo" className="text-xs text-muted-foreground">
            {t("transactions.to", "To")}
          </Label>
          <Input id="dateTo" type="date" className="w-40" value={dateTo} onChange={(e) => resetPage(setDateTo)(e.target.value)} />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {t("transactions.empty", "No transactions match these filters")}
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("transactions.date", "Date")}</TableHead>
                <TableHead>{t("transactions.description", "Description")}</TableHead>
                <TableHead>{t("transactions.type", "Type")}</TableHead>
                <TableHead>{t("transactions.status", "Status")}</TableHead>
                <TableHead className="text-right">{t("transactions.amount", "Amount")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((tx) => (
                <TableRow key={tx.id} className="cursor-pointer" onClick={() => setSelectedTransactionId(tx.id)}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{new Date(tx.createdAt).toLocaleString()}</TableCell>
                  <TableCell className="max-w-[260px] truncate">{tx.description ?? tx.type}</TableCell>
                  <TableCell className="text-xs uppercase text-muted-foreground">{tx.type}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[tx.status] ?? "secondary"}>{tx.status}</Badge>
                  </TableCell>
                  <TableCell
                    className={cn("text-right font-mono", tx.direction === "CREDIT" ? "text-success" : tx.direction === "DEBIT" ? "text-foreground" : "text-muted-foreground")}
                  >
                    {tx.amountMinor !== null && tx.amountMinor !== undefined ? (
                      <>
                        {tx.direction === "CREDIT" ? "+" : tx.direction === "DEBIT" ? "-" : ""}
                        {formatMinorAmount(tx.amountMinor, 2)} {tx.currencyCode ?? ""}
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground">
              {t("transactions.pageOf", "Page {{page}} / {{totalPages}}", { page, totalPages })}
            </span>
            <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}

      <TransactionDetailDialog transactionId={selectedTransactionId} onClose={() => setSelectedTransactionId(null)} />
    </div>
  );
}
