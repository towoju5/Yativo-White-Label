import { formatCurrencyAmount } from "@white-label/shared-types";
import { Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WalletBalanceCardProps } from "../types";

export function AuroraWalletBalanceCard({ currencyCode, decimals, symbol, availableMinor, pendingMinor, label, onClick, className }: WalletBalanceCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full flex-col gap-3 rounded-2xl border border-border bg-card p-4 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-elevated",
        onClick ? "cursor-pointer" : "cursor-default",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-secondary/15 text-primary">
          <Wallet className="h-4 w-4" />
        </div>
        <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">{currencyCode}</span>
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground">{label ?? "Wallet"}</p>
        <p className="font-heading text-lg font-bold tracking-tight">{formatCurrencyAmount(availableMinor, decimals, symbol, currencyCode)}</p>
        {BigInt(pendingMinor || "0") !== 0n && (
          <p className="mt-0.5 text-xs text-warning">+{formatCurrencyAmount(pendingMinor, decimals, symbol, currencyCode)} pending</p>
        )}
      </div>
    </button>
  );
}
