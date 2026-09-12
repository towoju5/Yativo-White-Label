import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PlatformProfitReport } from "@white-label/shared-types";
import { formatMinorAmount, LEDGER_TRANSACTION_TYPES } from "@white-label/shared-types";
import { TrendingUp } from "lucide-react";
import { staffApi } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

function humanizeType(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function defaultDateFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

function defaultDateTo(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ProfitPage() {
  const [dateFrom, setDateFrom] = useState(defaultDateFrom());
  const [dateTo, setDateTo] = useState(defaultDateTo());
  const [type, setType] = useState("ALL");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "dashboard", "profit", { dateFrom, dateTo }],
    queryFn: () =>
      staffApi.get<PlatformProfitReport>("/admin/dashboard/profit", {
        dateFrom: dateFrom ? new Date(`${dateFrom}T00:00:00.000Z`).toISOString() : undefined,
        dateTo: dateTo ? new Date(`${dateTo}T23:59:59.999Z`).toISOString() : undefined,
      }),
  });

  const rows = useMemo(() => {
    const byType = data?.byType ?? [];
    return type === "ALL" ? byType : byType.filter((r) => r.type === type);
  }, [data, type]);

  const clearFilters = () => {
    setDateFrom(defaultDateFrom());
    setDateTo(defaultDateTo());
    setType("ALL");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Platform profit</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Your own markup fee revenue — separate from whatever Yativo itself charges</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="profitDateFrom" className="text-xs text-muted-foreground">
            From
          </Label>
          <Input id="profitDateFrom" type="date" className="w-40" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="profitDateTo" className="text-xs text-muted-foreground">
            To
          </Label>
          <Input id="profitDateTo" type="date" className="w-40" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Transaction type</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All types</SelectItem>
              {LEDGER_TRANSACTION_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {humanizeType(t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
          Reset
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {(data?.totalsByCurrency ?? []).length === 0 ? (
              <Card className="sm:col-span-2 lg:col-span-3">
                <CardContent className="flex items-center justify-center p-8 text-sm text-muted-foreground">No platform fee revenue in this period</CardContent>
              </Card>
            ) : (
              data?.totalsByCurrency.map((t) => (
                <Card key={t.currencyCode}>
                  <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Total profit ({t.currencyCode})</CardTitle>
                    <TrendingUp className="h-4 w-4 text-success" />
                  </CardHeader>
                  <CardContent>
                    <p className="font-heading text-2xl font-semibold">
                      {formatMinorAmount(t.amountMinor, 2)} {t.currencyCode}
                    </p>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Breakdown by transaction type</CardTitle>
            </CardHeader>
            <CardContent>
              {rows.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No fee revenue matches these filters</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Transaction type</TableHead>
                      <TableHead>Currency</TableHead>
                      <TableHead className="text-right">Profit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={`${r.type}-${r.currencyCode}`}>
                        <TableCell className="text-xs uppercase text-muted-foreground">{humanizeType(r.type)}</TableCell>
                        <TableCell>{r.currencyCode}</TableCell>
                        <TableCell className="text-right font-mono text-success">
                          {formatMinorAmount(r.amountMinor, 2)} {r.currencyCode}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
