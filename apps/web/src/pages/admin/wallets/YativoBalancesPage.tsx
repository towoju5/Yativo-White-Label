import { useQuery } from "@tanstack/react-query";
import type { YativoWalletBalance } from "@white-label/shared-types";
import { RefreshCw, Wallet } from "lucide-react";
import { staffApi, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function formatBalance(balance: string, decimalPlaces: number): string {
  const amount = Number(balance);
  if (Number.isNaN(amount)) return balance;
  return amount.toLocaleString(undefined, { minimumFractionDigits: decimalPlaces, maximumFractionDigits: decimalPlaces });
}

export default function YativoBalancesPage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["admin", "wallets", "yativo-balances"],
    queryFn: () => staffApi.get<YativoWalletBalance[]>("/admin/wallets/yativo-balances"),
  });

  const balances = data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Yativo wallet balances</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Live balances held with Yativo across every wallet on this platform's account.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-dashed border-destructive/50 p-10 text-center text-sm">
          <p className="text-destructive">Couldn't load Yativo wallet balances{error instanceof ApiError ? `: ${error.message}` : ""}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : balances.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <Wallet className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No wallet balances reported by Yativo.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Wallet</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Currency</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {balances.map((b) => (
              <TableRow key={b.slug}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {b.logoUrl && <img src={b.logoUrl} alt="" className="h-4 w-4 rounded-full" />}
                    {b.name}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {b.slug}
                  {b.slug === "usdcc" && (
                    <Badge variant="outline" className="ml-2 align-middle">
                      Internal
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{b.currency}</TableCell>
                <TableCell className="text-right font-mono">
                  {b.symbol ? `${b.symbol} ` : ""}
                  {formatBalance(b.balance, b.decimalPlaces)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
