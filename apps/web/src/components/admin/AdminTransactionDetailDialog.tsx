import { useQuery } from "@tanstack/react-query";
import type { AdminTransactionDetail } from "@white-label/shared-types";
import { formatMinorAmount } from "@white-label/shared-types";
import { staffApi } from "@/lib/api-client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  POSTED: "success",
  PENDING: "warning",
  REVERSED: "destructive",
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="truncate text-right font-mono text-xs">{value}</dd>
    </div>
  );
}

/**
 * Admin-only — unlike the customer-facing TransactionDetailDialog, this shows every ledger entry
 * (including platform-side accounts) and the provider's own fee broken out separately from this
 * platform's markup. Never reuse this for a customer-visible surface.
 */
export function AdminTransactionDetailDialog({ transactionId, onClose }: { transactionId: string | null; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "transactions", transactionId],
    queryFn: () => staffApi.get<AdminTransactionDetail>(`/admin/transactions/${transactionId}`),
    enabled: !!transactionId,
  });

  return (
    <Dialog open={!!transactionId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
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
              <p className="font-heading text-lg font-semibold">{data.description ?? data.type}</p>
              <Badge variant={STATUS_VARIANT[data.status] ?? "secondary"}>{data.status}</Badge>
            </div>

            <dl className="divide-y divide-border rounded-lg border border-border text-sm">
              <Row label="Type" value={data.type} />
              <Row label="Idempotency key" value={data.idempotencyKey} />
              {data.externalRef && <Row label="External reference" value={data.externalRef} />}
              <Row label="Source" value={data.externalSource} />
              <Row label="Date" value={new Date(data.createdAt).toLocaleString()} />
              {data.postedAt && <Row label="Posted" value={new Date(data.postedAt).toLocaleString()} />}
              {data.reversedAt && <Row label="Reversed" value={new Date(data.reversedAt).toLocaleString()} />}
            </dl>

            {data.deposit && (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Deposit breakdown (provider: Yativo)</p>
                <dl className="divide-y divide-border rounded-lg border border-border text-sm">
                  <Row label="Yativo deposit ID" value={data.deposit.yativoDepositId} />
                  {data.deposit.grossAmountMinor !== null && (
                    <Row label="Gross amount (post-Yativo-fee)" value={`${formatMinorAmount(data.deposit.grossAmountMinor, 2)} ${data.deposit.currencyCode}`} />
                  )}
                  {data.deposit.yativoFeeMinor !== null && (
                    <Row label="Yativo fee (estimated)" value={`${formatMinorAmount(data.deposit.yativoFeeMinor, 2)} ${data.deposit.currencyCode}`} />
                  )}
                  <Row label="Platform fee" value={`${formatMinorAmount(data.deposit.platformFeeMinor, 2)} ${data.deposit.currencyCode}`} />
                  {data.deposit.exchangeRate && <Row label="Exchange rate" value={data.deposit.exchangeRate} />}
                  {data.deposit.localAmount && data.deposit.localCurrency && (
                    <Row label="Local amount paid" value={`${data.deposit.localAmount} ${data.deposit.localCurrency}`} />
                  )}
                </dl>
              </div>
            )}

            {data.payout && (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payout breakdown (provider: Yativo)</p>
                <dl className="divide-y divide-border rounded-lg border border-border text-sm">
                  <Row label="Recipient" value={data.payout.beneficiaryName} />
                  {data.payout.yativoPayoutId && <Row label="Yativo payout ID" value={data.payout.yativoPayoutId} />}
                  <Row label="Amount submitted to Yativo" value={`${formatMinorAmount(data.payout.amountMinor, 2)} ${data.payout.currencyCode}`} />
                  <Row label="Platform fee" value={`${formatMinorAmount(data.payout.platformFeeMinor, 2)} ${data.payout.currencyCode}`} />
                </dl>
              </div>
            )}

            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ledger entries (all accounts)</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.entries.map((e, i) => (
                    <TableRow key={`${e.accountId}-${i}`}>
                      <TableCell className="text-xs">{e.accountType}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{e.customerEmail ?? "Platform"}</TableCell>
                      <TableCell className="text-xs">{e.direction}</TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {formatMinorAmount(e.amountMinor, 2)} {e.currencyCode}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
