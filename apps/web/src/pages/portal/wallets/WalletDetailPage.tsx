import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { StatementLine, WalletBalance } from "@white-label/shared-types";
import { formatCurrencyAmount } from "@white-label/shared-types";
import { ArrowLeft, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { portalApi, ApiError } from "@/lib/api-client";
import type { Paginated } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { BalanceChart } from "@/components/charts/BalanceChart";
import { WalletStatementTable } from "@/components/wallet/WalletStatementTable";

const PAGE_SIZE = 15;

export default function PortalWalletDetailPage() {
  const { walletId } = useParams<{ walletId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: wallets } = useQuery({
    queryKey: ["portal", "wallets"],
    queryFn: () => portalApi.get<WalletBalance[]>("/portal/wallets"),
  });
  const wallet = wallets?.find((w) => w.walletId === walletId);

  const isEmpty = wallet ? BigInt(wallet.availableMinor) === 0n && BigInt(wallet.pendingMinor) === 0n : false;

  const removeMutation = useMutation({
    mutationFn: () => portalApi.del(`/portal/wallets/${walletId}`),
    onSuccess: () => {
      toast({ title: "Wallet removed" });
      queryClient.invalidateQueries({ queryKey: ["portal", "wallets"] });
      queryClient.invalidateQueries({ queryKey: ["portal", "wallets", "currencies"] });
      navigate("/portal/wallets", { replace: true });
    },
    onError: (e) => {
      toast({ variant: "destructive", title: "Couldn't remove wallet", description: e instanceof ApiError ? e.message : undefined });
      setConfirmOpen(false);
    },
  });

  const statementQuery = useQuery({
    queryKey: ["portal", "wallets", walletId, "statement", page],
    queryFn: () => portalApi.get<Paginated<StatementLine>>(`/portal/wallets/${walletId}/statement`, { page, pageSize: PAGE_SIZE }),
    enabled: !!walletId,
  });

  const lines = statementQuery.data?.items ?? [];
  const decimals = wallet?.decimals ?? 2;
  const chartData = [...lines]
    .reverse()
    .filter((l) => l.runningBalanceMinor !== undefined)
    .map((l) => ({
      label: new Date(l.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      value: Number(l.runningBalanceMinor) / 10 ** decimals,
    }));

  const totalPages = statementQuery.data ? Math.max(1, Math.ceil(statementQuery.data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-6">
      <Link to="/portal/wallets" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> All wallets
      </Link>

      {!wallet ? (
        <Skeleton className="h-24" />
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-semibold tracking-tight">{wallet.currencyCode} wallet</h1>
            <div className="mt-3 flex flex-wrap gap-6">
              <div>
                <p className="text-xs text-muted-foreground">Available</p>
                <p className="font-heading text-2xl font-semibold">{formatCurrencyAmount(wallet.availableMinor, decimals, wallet.symbol, wallet.currencyCode)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pending</p>
                <p className="font-heading text-2xl font-semibold text-warning">{formatCurrencyAmount(wallet.pendingMinor, decimals, wallet.symbol, wallet.currencyCode)}</p>
              </div>
            </div>
          </div>
          {isEmpty && (
            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4" /> Remove wallet
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Remove your {wallet.currencyCode} wallet?</DialogTitle>
                  <DialogDescription>
                    It's empty, so this is safe — you can add {wallet.currencyCode} back later if it's still offered.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setConfirmOpen(false)}>
                    Cancel
                  </Button>
                  <Button variant="destructive" disabled={removeMutation.isPending} onClick={() => removeMutation.mutate()}>
                    {removeMutation.isPending ? "Removing…" : "Remove wallet"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Balance over time</CardTitle>
        </CardHeader>
        <CardContent>
          {statementQuery.isLoading ? (
            <Skeleton className="h-[220px] w-full" />
          ) : chartData.length > 0 ? (
            <BalanceChart data={chartData} showAxes />
          ) : (
            <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">No activity yet</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm">Statement</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {page} / {totalPages}
            </span>
            <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <WalletStatementTable lines={lines} decimals={decimals} isLoading={statementQuery.isLoading} />
        </CardContent>
      </Card>
    </div>
  );
}
