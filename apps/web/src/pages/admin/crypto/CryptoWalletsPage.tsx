import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CryptoDeposit, CryptoWallet, PaginatedResponse } from "@white-label/shared-types";
import { AlertTriangle, Coins, Copy, Plus, Trash2 } from "lucide-react";
import { staffApi, ApiError } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";

function truncateAddress(address: string) {
  return address.length > 14 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;
}

export default function CryptoWalletsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [currency, setCurrency] = useState("");
  const [label, setLabel] = useState("");

  const currenciesQuery = useQuery({
    queryKey: ["admin", "crypto", "currencies"],
    queryFn: () => staffApi.get<string[]>("/admin/crypto/currencies"),
  });

  const walletsQuery = useQuery({
    queryKey: ["admin", "crypto", "wallets"],
    queryFn: () => staffApi.get<PaginatedResponse<CryptoWallet>>("/admin/crypto/wallets", { pageSize: 100 }),
  });

  const depositsQuery = useQuery({
    queryKey: ["admin", "crypto", "deposits"],
    queryFn: () => staffApi.get<PaginatedResponse<CryptoDeposit>>("/admin/crypto/deposits", { pageSize: 100 }),
  });

  const createMutation = useMutation({
    mutationFn: () => staffApi.post<CryptoWallet>("/admin/crypto/wallets", { currency, customerId: label.trim() || undefined }),
    onSuccess: (wallet) => {
      toast({ title: "Wallet ready", description: `${wallet.currency} · ${truncateAddress(wallet.address)}` });
      queryClient.invalidateQueries({ queryKey: ["admin", "crypto", "wallets"] });
      setCurrency("");
      setLabel("");
      setOpen(false);
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't create wallet", description: e instanceof ApiError ? e.message : undefined }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => staffApi.del(`/admin/crypto/wallets/${id}`),
    onSuccess: () => {
      toast({ title: "Wallet deleted" });
      queryClient.invalidateQueries({ queryKey: ["admin", "crypto", "wallets"] });
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't delete wallet", description: e instanceof ApiError ? e.message : undefined }),
  });

  const copyAddress = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      toast({ title: "Address copied" });
    } catch {
      toast({ variant: "destructive", title: "Couldn't copy address" });
    }
  };

  const wallets = walletsQuery.data?.items ?? [];
  const deposits = depositsQuery.data?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Crypto wallets</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Platform-level deposit addresses — shared across all customers, not isolated per account.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4" /> Create wallet
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create a crypto wallet</DialogTitle>
              <DialogDescription>Generates a deposit address for one currency/network. Calling this again for a currency you already have returns the existing wallet.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a currency" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {(currenciesQuery.data ?? []).map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="label">Label (optional)</Label>
                <Input id="label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. treasury, or a customer id" />
                <p className="text-xs text-muted-foreground">Filters this wallet in listings only — it doesn't isolate the address.</p>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => createMutation.mutate()} disabled={!currency || createMutation.isPending}>
                {createMutation.isPending ? "Creating…" : "Create wallet"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-foreground">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <p>
          Deleting a wallet is effectively permanent — funds sent to its address afterward can&apos;t be recovered. There&apos;s no on-chain balance shown
          here by design; Yativo&apos;s API only exposes deposit history, not live balances.
        </p>
      </div>

      <Tabs defaultValue="wallets">
        <TabsList>
          <TabsTrigger value="wallets">Wallets ({wallets.length})</TabsTrigger>
          <TabsTrigger value="deposits">Deposit history ({deposits.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="wallets">
          {walletsQuery.isLoading ? (
            <div className="space-y-2 pt-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : wallets.length === 0 ? (
            <div className="mt-2 rounded-lg border border-dashed border-border p-10 text-center">
              <Coins className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No crypto wallets yet. Create one to start accepting deposits.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Currency</TableHead>
                  <TableHead>Network</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {wallets.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="font-medium">{w.currency}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{w.network}</Badge>
                    </TableCell>
                    <TableCell>
                      <button onClick={() => copyAddress(w.address)} className="inline-flex items-center gap-1.5 font-mono text-xs hover:text-primary" title={w.address}>
                        {truncateAddress(w.address)}
                        <Copy className="h-3 w-3" />
                      </button>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{w.customerId ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{new Date(w.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(w.id)} disabled={deleteMutation.isPending}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="deposits">
          {depositsQuery.isLoading ? (
            <div className="space-y-2 pt-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : deposits.length === 0 ? (
            <div className="mt-2 rounded-lg border border-dashed border-border p-10 text-center">
              <p className="text-sm text-muted-foreground">No deposits yet. A deposit only appears once it&apos;s already been credited — there&apos;s no pending state.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Currency</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Transaction</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Received</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deposits.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.currency}</TableCell>
                    <TableCell className="font-mono">{d.amount}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground" title={d.address}>
                      {truncateAddress(d.address)}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground" title={d.transactionId ?? undefined}>
                      {d.transactionId ? truncateAddress(d.transactionId) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={d.status === "success" ? "success" : "outline"}>{d.status}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{new Date(d.createdAt).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
