import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { StatementFormat, StatementLine, WalletBalance } from "@white-label/shared-types";
import { formatMinorAmount } from "@white-label/shared-types";
import { Download, Mail } from "lucide-react";
import { useTranslation } from "react-i18next";
import { portalApi, portalDownload, ApiError } from "@/lib/api-client";
import type { Paginated } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

function defaultDateFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

function defaultDateTo(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function StatementsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();

  const [walletId, setWalletId] = useState(searchParams.get("walletId") ?? "");
  const [dateFrom, setDateFrom] = useState(defaultDateFrom());
  const [dateTo, setDateTo] = useState(defaultDateTo());
  const [emailFormat, setEmailFormat] = useState<StatementFormat>("PDF");

  const { data: wallets, isLoading: walletsLoading } = useQuery({
    queryKey: ["portal", "wallets"],
    queryFn: () => portalApi.get<WalletBalance[]>("/portal/wallets"),
  });

  useEffect(() => {
    const first = wallets?.[0];
    if (!walletId && first) setWalletId(first.walletId);
  }, [wallets, walletId]);

  const wallet = wallets?.find((w) => w.walletId === walletId);

  const range = useMemo(() => {
    if (!dateFrom || !dateTo) return null;
    return { dateFrom: new Date(`${dateFrom}T00:00:00.000Z`).toISOString(), dateTo: new Date(`${dateTo}T23:59:59.999Z`).toISOString() };
  }, [dateFrom, dateTo]);

  const downloadMutation = useMutation({
    mutationFn: async (format: StatementFormat) => {
      if (!walletId || !range) throw new Error("Pick a wallet and date range first");
      const blob = await portalDownload(`/portal/wallets/${walletId}/statement/export`, { format, ...range });
      return { blob, format };
    },
    onSuccess: ({ blob, format }) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `statement-${wallet?.currencyCode ?? ""}-${dateFrom}-to-${dateTo}.${format === "PDF" ? "pdf" : "xlsx"}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    onError: (e) => toast({ variant: "destructive", title: t("statements.downloadError", "Couldn't download statement"), description: e instanceof ApiError ? e.message : undefined }),
  });

  const emailMutation = useMutation({
    mutationFn: () => {
      if (!range) throw new Error("Pick a date range first");
      return portalApi.post<{ sent: boolean; to: string }>(`/portal/wallets/${walletId}/statement/email`, { format: emailFormat, ...range });
    },
    onSuccess: (result) => toast({ title: t("statements.emailed", "Statement sent to {{email}}", { email: result.to }) }),
    onError: (e) => toast({ variant: "destructive", title: t("statements.emailError", "Couldn't email statement"), description: e instanceof ApiError ? e.message : undefined }),
  });

  const decimals = wallet?.decimals ?? 2;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{t("statements.title", "Statement of account")}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{t("statements.subtitle", "Every credit, debit, and balance after each transaction, for a period you choose")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("statements.parameters", "Choose a wallet and period")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label>{t("statements.wallet", "Wallet")}</Label>
              {walletsLoading ? (
                <Skeleton className="h-9 w-40" />
              ) : (
                <Select value={walletId} onValueChange={setWalletId}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder={t("statements.wallet", "Wallet")} />
                  </SelectTrigger>
                  <SelectContent>
                    {wallets?.map((w) => (
                      <SelectItem key={w.walletId} value={w.walletId}>
                        {w.currencyCode}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="stmtFrom">{t("statements.from", "From")}</Label>
              <Input id="stmtFrom" type="date" className="w-40" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="stmtTo">{t("statements.to", "To")}</Label>
              <Input id="stmtTo" type="date" className="w-40" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3 border-t border-border pt-4">
            <Button variant="outline" disabled={!walletId || downloadMutation.isPending} onClick={() => downloadMutation.mutate("PDF")}>
              <Download className="h-4 w-4" /> {t("statements.downloadPdf", "Download PDF")}
            </Button>
            <Button variant="outline" disabled={!walletId || downloadMutation.isPending} onClick={() => downloadMutation.mutate("EXCEL")}>
              <Download className="h-4 w-4" /> {t("statements.downloadExcel", "Download Excel")}
            </Button>
            <div className="ml-auto flex items-end gap-2">
              <div className="space-y-1.5">
                <Label>{t("statements.emailFormat", "Email as")}</Label>
                <Select value={emailFormat} onValueChange={(v) => setEmailFormat(v as StatementFormat)}>
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PDF">PDF</SelectItem>
                    <SelectItem value="EXCEL">Excel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button disabled={!walletId || emailMutation.isPending} onClick={() => emailMutation.mutate()}>
                <Mail className="h-4 w-4" /> {emailMutation.isPending ? t("statements.sending", "Sending…") : t("statements.emailMe", "Email me this statement")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <StatementPreview walletId={walletId} range={range} decimals={decimals} currencyCode={wallet?.currencyCode ?? ""} />
    </div>
  );
}

function StatementPreview({ walletId, range, decimals, currencyCode }: { walletId: string; range: { dateFrom: string; dateTo: string } | null; decimals: number; currencyCode: string }) {
  const { t } = useTranslation();
  // The export endpoint returns a rendered file, not JSON — the on-screen preview reuses the
  // same read-side statement data via the wallet's ordinary (paginated) statement endpoint,
  // filtered client-side to the chosen dates, so no separate "preview" backend route is needed.
  const { data, isLoading } = useQuery({
    queryKey: ["portal", "wallets", walletId, "statement", "all"],
    queryFn: () => portalApi.get<Paginated<StatementLine>>(`/portal/wallets/${walletId}/statement`, { page: 1, pageSize: 100 }),
    enabled: !!walletId,
  });

  const lines = (data?.items ?? []).filter((l) => !range || (l.createdAt >= range.dateFrom && l.createdAt <= range.dateTo));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{t("statements.preview", "Preview (most recent 100 rows)")}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : lines.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{t("statements.empty", "No transactions in this period")}</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("statements.date", "Date")}</TableHead>
                <TableHead>{t("statements.description", "Description")}</TableHead>
                <TableHead>{t("statements.direction", "Credit/Debit")}</TableHead>
                <TableHead className="text-right">{t("statements.amount", "Amount")}</TableHead>
                <TableHead className="text-right">{t("statements.balanceAfter", "Balance after")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => (
                <TableRow key={line.entryId}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{new Date(line.createdAt).toLocaleString()}</TableCell>
                  <TableCell className="max-w-[220px] truncate">{line.description ?? line.transactionType}</TableCell>
                  <TableCell className={line.direction === "CREDIT" ? "text-success" : "text-foreground"}>{line.direction === "CREDIT" ? t("statements.credit", "Credit") : t("statements.debit", "Debit")}</TableCell>
                  <TableCell className={cn("text-right font-mono", line.direction === "CREDIT" ? "text-success" : "text-foreground")}>
                    {line.direction === "CREDIT" ? "+" : "-"}
                    {formatMinorAmount(line.amountMinor, decimals)} {currencyCode}
                  </TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">{line.runningBalanceMinor !== undefined ? formatMinorAmount(line.runningBalanceMinor, decimals) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
