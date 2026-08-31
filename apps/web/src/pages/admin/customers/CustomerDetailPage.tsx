import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Customer, StatementLine, WalletBalance, CustomerEndorsement, Beneficiary } from "@white-label/shared-types";
import { formatCurrencyAmount } from "@white-label/shared-types";
import { ArrowLeft, RefreshCw, ShieldCheck, ShieldX, Snowflake, Sun, Wallet as WalletIcon } from "lucide-react";
import { staffApi, ApiError } from "@/lib/api-client";
import type { Paginated } from "@/lib/types";
import { useStaffAuth } from "@/hooks/useStaffAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WalletStatementTable } from "@/components/wallet/WalletStatementTable";
import { EndorsementsTable } from "@/components/endorsements/EndorsementsTable";

interface CustomerDetailResponse extends Customer {
  wallets?: WalletBalance[];
}

const KYC_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  APPROVED: "success",
  PENDING: "warning",
  REJECTED: "destructive",
  NOT_STARTED: "secondary",
};

export default function CustomerDetailPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const { user } = useStaffAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canAdjust = user?.role === "OWNER" || user?.role === "ADMIN";

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [activeWalletId, setActiveWalletId] = useState<string | undefined>();

  const detailQuery = useQuery({
    queryKey: ["admin", "customers", customerId],
    queryFn: () => staffApi.get<CustomerDetailResponse>(`/admin/customers/${customerId}`),
    enabled: !!customerId,
  });

  const wallets = detailQuery.data?.wallets ?? [];
  const currentWalletId = activeWalletId ?? wallets[0]?.walletId;
  const currentWallet = wallets.find((w) => w.walletId === currentWalletId);

  const statementQuery = useQuery({
    queryKey: ["admin", "customers", customerId, "wallets", currentWalletId, "statement"],
    queryFn: () =>
      staffApi.get<Paginated<StatementLine>>(`/admin/customers/${customerId}/wallets/${currentWalletId}/statement`, {
        page: 1,
        pageSize: 20,
      }),
    enabled: !!customerId && !!currentWalletId,
  });

  const endorsementsQuery = useQuery({
    queryKey: ["admin", "customers", customerId, "endorsements"],
    queryFn: () => staffApi.get<CustomerEndorsement[]>(`/admin/customers/${customerId}/endorsements`),
    enabled: !!customerId,
    // Only skip retries for the one genuinely non-transient case (customer not registered on
    // Yativo, 409) — everything else, including this endpoint's live upstream call to Yativo,
    // is worth a couple of retries rather than sticking on a one-off network blip.
    retry: (failureCount, error) => !(error instanceof ApiError && error.status === 409) && failureCount < 2,
  });

  const beneficiariesQuery = useQuery({
    queryKey: ["admin", "customers", customerId, "beneficiaries"],
    queryFn: () => staffApi.get<Beneficiary[]>(`/admin/customers/${customerId}/beneficiaries`),
    enabled: !!customerId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "customers", customerId] });
    queryClient.invalidateQueries({ queryKey: ["admin", "customers", customerId, "wallets"] });
  };

  const approveMutation = useMutation({
    mutationFn: () => staffApi.post(`/admin/customers/${customerId}/kyc/approve`),
    onSuccess: () => {
      toast({ title: "KYC approved" });
      invalidate();
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't approve", description: e instanceof ApiError ? e.message : undefined }),
  });

  const rejectMutation = useMutation({
    mutationFn: (reason: string) => staffApi.post(`/admin/customers/${customerId}/kyc/reject`, { reason }),
    onSuccess: () => {
      toast({ title: "KYC rejected" });
      setRejectOpen(false);
      setRejectReason("");
      invalidate();
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't reject", description: e instanceof ApiError ? e.message : undefined }),
  });

  const freezeMutation = useMutation({
    mutationFn: () => staffApi.post(`/admin/customers/${customerId}/${detailQuery.data?.status === "FROZEN" ? "unfreeze" : "freeze"}`),
    onSuccess: () => {
      toast({ title: detailQuery.data?.status === "FROZEN" ? "Customer unfrozen" : "Customer frozen" });
      invalidate();
    },
    onError: (e) => toast({ variant: "destructive", title: "Action failed", description: e instanceof ApiError ? e.message : undefined }),
  });

  const resubmitYativoMutation = useMutation({
    mutationFn: () => staffApi.post(`/admin/customers/${customerId}/yativo/resubmit`),
    onSuccess: () => {
      toast({ title: "Customer registered with Yativo" });
      invalidate();
    },
    onError: (e) => toast({ variant: "destructive", title: "Couldn't register with Yativo", description: e instanceof ApiError ? e.message : undefined }),
  });

  const [adjustDirection, setAdjustDirection] = useState<"CREDIT" | "DEBIT">("CREDIT");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

  const adjustMutation = useMutation({
    mutationFn: () =>
      staffApi.post(`/admin/customers/${customerId}/wallets/${currentWalletId}/adjust`, {
        direction: adjustDirection,
        amountMinor: adjustAmount,
        reason: adjustReason,
      }),
    onSuccess: () => {
      toast({ title: "Ledger adjustment posted" });
      setAdjustOpen(false);
      setAdjustAmount("");
      setAdjustReason("");
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["admin", "customers", customerId, "wallets", currentWalletId, "statement"] });
    },
    onError: (e) => toast({ variant: "destructive", title: "Adjustment failed", description: e instanceof ApiError ? e.message : undefined }),
  });

  if (detailQuery.isLoading || !detailQuery.data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const customer = detailQuery.data;

  return (
    <div className="space-y-6">
      <Link to="/admin/customers" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> All customers
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{customer.fullName ?? customer.businessName ?? customer.email}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{customer.email}</p>
          <div className="mt-2 flex gap-2">
            <Badge variant={KYC_VARIANT[customer.kycStatus] ?? "secondary"}>KYC: {customer.kycStatus.replace("_", " ")}</Badge>
            <Badge variant={customer.status === "ACTIVE" ? "success" : "destructive"}>{customer.status}</Badge>
            <Badge variant="outline">{customer.type}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {customer.kycStatus === "PENDING" && (
            <>
              <Button size="sm" onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}>
                <ShieldCheck className="h-4 w-4" /> Approve KYC
              </Button>
              <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline">
                    <ShieldX className="h-4 w-4" /> Reject KYC
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Reject KYC submission</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-1.5">
                    <Label htmlFor="reason">Reason</Label>
                    <Textarea id="reason" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
                  </div>
                  <DialogFooter>
                    <Button
                      variant="destructive"
                      disabled={!rejectReason || rejectMutation.isPending}
                      onClick={() => rejectMutation.mutate(rejectReason)}
                    >
                      Reject
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}
          {!customer.yativoCustomerId && (
            <Button size="sm" variant="outline" onClick={() => resubmitYativoMutation.mutate()} disabled={resubmitYativoMutation.isPending}>
              <RefreshCw className={resubmitYativoMutation.isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Resubmit to Yativo
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => freezeMutation.mutate()} disabled={freezeMutation.isPending}>
            {customer.status === "FROZEN" ? (
              <>
                <Sun className="h-4 w-4" /> Unfreeze
              </>
            ) : (
              <>
                <Snowflake className="h-4 w-4" /> Freeze
              </>
            )}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm">Wallets</CardTitle>
          {canAdjust && wallets.length > 0 && (
            <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <WalletIcon className="h-4 w-4" /> Manual adjustment
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Manual ledger adjustment — {currentWallet?.currencyCode}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Direction</Label>
                    <Select value={adjustDirection} onValueChange={(v) => setAdjustDirection(v as "CREDIT" | "DEBIT")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CREDIT">Credit (add funds)</SelectItem>
                        <SelectItem value="DEBIT">Debit (remove funds)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="amountMinor">Amount (minor units)</Label>
                    <Input id="amountMinor" placeholder="1000" value={adjustAmount} onChange={(e) => setAdjustAmount(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="adjustReason">Reason (required)</Label>
                    <Textarea id="adjustReason" value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} />
                  </div>
                </div>
                <DialogFooter>
                  <Button disabled={!adjustAmount || !adjustReason || adjustMutation.isPending} onClick={() => adjustMutation.mutate()}>
                    Post adjustment
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          {wallets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No wallets yet.</p>
          ) : (
            <Tabs value={currentWalletId} onValueChange={setActiveWalletId}>
              <TabsList>
                {wallets.map((w) => (
                  <TabsTrigger key={w.walletId} value={w.walletId}>
                    {w.currencyCode}
                  </TabsTrigger>
                ))}
              </TabsList>
              {wallets.map((w) => (
                <TabsContent key={w.walletId} value={w.walletId} className="space-y-4">
                  <div className="flex gap-6">
                    <div>
                      <p className="text-xs text-muted-foreground">Available</p>
                      <p className="font-heading text-xl font-semibold">{formatCurrencyAmount(w.availableMinor, w.decimals, w.symbol, w.currencyCode)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Pending</p>
                      <p className="font-heading text-xl font-semibold text-warning">{formatCurrencyAmount(w.pendingMinor, w.decimals, w.symbol, w.currencyCode)}</p>
                    </div>
                  </div>
                  <WalletStatementTable
                    lines={statementQuery.data?.items ?? []}
                    decimals={w.decimals}
                    isLoading={statementQuery.isLoading}
                  />
                </TabsContent>
              ))}
            </Tabs>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Endorsements</CardTitle>
        </CardHeader>
        <CardContent>
          <EndorsementsTable
            endorsements={endorsementsQuery.data}
            isLoading={endorsementsQuery.isLoading}
            errorMessage={endorsementsQuery.isError ? (endorsementsQuery.error instanceof ApiError ? endorsementsQuery.error.message : "Couldn't load endorsements.") : null}
            onGenerateLink={(service) => staffApi.post<CustomerEndorsement[]>(`/admin/customers/${customerId}/endorsements/${service}/link`)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Beneficiaries</CardTitle>
        </CardHeader>
        <CardContent>
          {beneficiariesQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : !beneficiariesQuery.data || beneficiariesQuery.data.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No beneficiaries yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {beneficiariesQuery.data.map((b) => (
                <details key={b.id} className="group py-2.5">
                  <summary className="flex cursor-pointer list-none items-center justify-between text-sm">
                    <span className="font-medium">{b.name}</span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline">{typeof b.details.currency === "string" ? b.details.currency : b.type.replace("_", " ")}</Badge>
                      {new Date(b.createdAt).toLocaleDateString()}
                    </span>
                  </summary>
                  <dl className="mt-2 space-y-1 rounded-lg border border-border bg-muted/30 p-3 text-xs">
                    {Object.entries((b.details.paymentData as Record<string, unknown>) ?? {})
                      .filter(([, v]) => v !== "" && v !== null && v !== undefined)
                      .map(([key, value]) => (
                        <div key={key} className="flex items-center justify-between gap-3">
                          <dt className="text-muted-foreground">{key}</dt>
                          <dd className="truncate font-mono">{String(value)}</dd>
                        </div>
                      ))}
                  </dl>
                </details>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
