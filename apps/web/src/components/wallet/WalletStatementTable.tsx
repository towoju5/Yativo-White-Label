import { useState } from "react";
import type { StatementLine } from "@white-label/shared-types";
import { formatMinorAmount } from "@white-label/shared-types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { TransactionDetailDialog } from "./TransactionDetailDialog";
import { TransactionCardRow } from "./TransactionCardRow";

interface WalletStatementTableProps {
  lines: StatementLine[];
  decimals: number;
  isLoading?: boolean;
}

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  POSTED: "success",
  PENDING: "warning",
  REVERSED: "destructive",
};

export function WalletStatementTable({ lines, decimals, isLoading }: WalletStatementTableProps) {
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (lines.length === 0) {
    return <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No transactions yet</div>;
  }

  return (
    <>
    <div className="hidden sm:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right">Balance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line) => (
            <TableRow key={line.entryId} className="cursor-pointer" onClick={() => setSelectedTransactionId(line.transactionId)}>
              <TableCell className="whitespace-nowrap text-muted-foreground">{new Date(line.createdAt).toLocaleString()}</TableCell>
              <TableCell className="max-w-[220px] truncate">{line.description ?? line.transactionType}</TableCell>
              <TableCell className="text-xs uppercase text-muted-foreground">{line.transactionType}</TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[line.status] ?? "secondary"}>{line.status}</Badge>
              </TableCell>
              <TableCell className={cn("text-right font-mono", line.direction === "CREDIT" ? "text-success" : "text-foreground")}>
                {line.direction === "CREDIT" ? "+" : "-"}
                {formatMinorAmount(line.amountMinor, decimals)} {line.currencyCode}
              </TableCell>
              <TableCell className="text-right font-mono text-muted-foreground">
                {line.runningBalanceMinor !== undefined ? formatMinorAmount(line.runningBalanceMinor, decimals) : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>

    <div className="rounded-lg border border-border sm:hidden">
      {lines.map((line) => (
        <TransactionCardRow
          key={line.entryId}
          date={line.createdAt}
          description={line.description ?? line.transactionType}
          type={line.transactionType}
          status={line.status}
          direction={line.direction}
          amountMinor={line.amountMinor}
          decimals={decimals}
          currencyCode={line.currencyCode}
          balanceMinor={line.runningBalanceMinor}
          onClick={() => setSelectedTransactionId(line.transactionId)}
        />
      ))}
    </div>
    <TransactionDetailDialog transactionId={selectedTransactionId} onClose={() => setSelectedTransactionId(null)} />
    </>
  );
}
