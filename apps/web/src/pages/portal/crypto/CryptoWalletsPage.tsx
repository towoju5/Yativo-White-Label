import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CryptoWallet, CryptoDeposit } from "@white-label/shared-types";
import { AlertTriangle, Coins, Copy, ExternalLink } from "lucide-react";
import { portalApi, ApiError } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function truncateAddress(address: string) {
  return address.length > 14 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;
}

const EXPLORER_TX_BASE: Record<string, string> = {
  ETH: "https://etherscan.io/tx/",
  POL: "https://polygonscan.com/tx/",
  ARB: "https://arbiscan.io/tx/",
  OP: "https://optimistic.etherscan.io/tx/",
  BASE: "https://basescan.org/tx/",
  AVAX: "https://snowtrace.io/tx/",
  BSC: "https://bscscan.com/tx/",
  SOL: "https://solscan.io/tx/",
  XLM: "https://stellar.expert/explorer/public/tx/",
};

/** currency codes are COIN_NETWORK, e.g. "USDC_POL" — the suffix picks the right block explorer. */
function explorerTxUrl(currency: string, txId: string): string | null {
  const network = currency.split("_").at(-1);
  const base = network ? EXPLORER_TX_BASE[network] : undefined;
  return base ? `${base}${txId}` : null;
}

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  success: "success",
  successful: "success",
  completed: "success",
  pending: "warning",
  processing: "warning",
  failed: "destructive",
  rejected: "destructive",
};

export default function CryptoWalletsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currency, setCurrency] = useState("");

  const currenciesQuery = useQuery({
    queryKey: ["portal", "crypto", "currencies"],
    queryFn: () => portalApi.get<string[]>("/portal/crypto/currencies"),
  });

  const walletsQuery = useQuery({
    queryKey: ["portal", "crypto", "wallets"],
    queryFn: () => portalApi.get<CryptoWallet[]>("/portal/crypto/wallets"),
  });

  const depositsQuery = useQuery({
    queryKey: ["portal", "crypto", "deposits"],
    queryFn: () => portalApi.get<CryptoDeposit[]>("/portal/crypto/deposits"),
  });

  const generateMutation = useMutation({
    mutationFn: () => portalApi.post<CryptoWallet>("/portal/crypto/wallets", { currency }),
    onSuccess: () => {
      toast({ title: "Deposit address ready" });
      queryClient.invalidateQueries({ queryKey: ["portal", "crypto", "wallets"] });
      setCurrency("");
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't generate address", description: e instanceof ApiError ? e.message : undefined }),
  });

  const copy = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      toast({ title: "Address copied" });
    } catch {
      toast({ variant: "destructive", title: "Couldn't copy address" });
    }
  };

  const wallets = walletsQuery.data ?? [];
  const deposits = depositsQuery.data ?? [];
  const availableCurrencies = (currenciesQuery.data ?? []).filter((c) => !wallets.some((w) => w.currency === c));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Crypto wallets</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Deposit addresses and on-chain deposit history for supported assets.</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Your wallets</CardTitle>
          </div>
          <CardDescription>Generate a deposit address for any supported chain.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
            <p>This address may be shared with other users for the same asset. Deposits are matched to your account and confirmed by our team before your balance updates.</p>
          </div>

          {walletsQuery.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          ) : wallets.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No crypto wallets yet — generate an address below to get started.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {wallets.map((w) => (
                <div key={w.id} className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm">
                  <div className="flex items-center gap-1.5 font-medium">
                    {w.currency} <Badge variant="outline">{w.network}</Badge>
                  </div>
                  <button
                    onClick={() => copy(w.address)}
                    className="flex items-center gap-1.5 self-start font-mono text-xs text-muted-foreground hover:text-primary"
                    title={w.address}
                  >
                    {truncateAddress(w.address)}
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {availableCurrencies.length > 0 && (
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <div className="min-w-[12rem] flex-1">
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an asset" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {availableCurrencies.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => generateMutation.mutate()} disabled={!currency || generateMutation.isPending}>
                {generateMutation.isPending ? "Generating…" : "Generate address"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Crypto transactions</CardTitle>
          <CardDescription>Every on-chain deposit matched to your account.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {depositsQuery.isLoading ? (
            <div className="space-y-2 p-6 pt-0">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : deposits.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No crypto deposits yet</div>
          ) : (
            <div className="divide-y divide-border">
              {deposits.map((d) => (
                <div key={d.id} className="flex items-center gap-3 px-6 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{d.currency}</span>
                      <Badge variant={STATUS_VARIANT[d.status.toLowerCase()] ?? "secondary"} className="capitalize">
                        {d.status}
                      </Badge>
                    </div>
                    <button
                      onClick={() => copy(d.address)}
                      className="mt-0.5 flex items-center gap-1.5 font-mono text-xs text-muted-foreground hover:text-primary"
                      title={d.address}
                    >
                      {truncateAddress(d.address)}
                    </button>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono font-medium">
                      {d.amount} {d.currency}
                    </p>
                    <p className="text-xs text-muted-foreground">{new Date(d.createdAt).toLocaleDateString()}</p>
                  </div>
                  {d.transactionId &&
                    (() => {
                      const url = explorerTxUrl(d.currency, d.transactionId);
                      return url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 text-muted-foreground hover:text-primary"
                          title="View on block explorer"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : null;
                    })()}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
