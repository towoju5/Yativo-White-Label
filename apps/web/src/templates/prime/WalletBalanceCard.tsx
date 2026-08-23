import { formatCurrencyAmount } from "@white-label/shared-types";
import { cn } from "@/lib/utils";
import type { WalletBalanceCardProps } from "../types";

export function PrimeWalletBalanceCard({ currencyCode, decimals, symbol, availableMinor, pendingMinor, label, onClick, className }: WalletBalanceCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50",
        onClick ? "cursor-pointer" : "cursor-default",
        className,
      )}
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted font-mono text-[10px] font-semibold uppercase text-muted-foreground">
          {currencyCode.slice(0, 2)}
        </span>
        <div>
          <p className="text-sm font-medium">{label ?? "Wallet"}</p>
          <p className="font-mono text-xs text-muted-foreground">{currencyCode}</p>
        </div>
      </div>
      <div className="text-right">
        <p className="font-mono text-sm font-semibold tabular-nums">{formatCurrencyAmount(availableMinor, decimals, symbol, currencyCode)}</p>
        {BigInt(pendingMinor || "0") !== 0n && (
          <p className="text-xs text-warning">+{formatCurrencyAmount(pendingMinor, decimals, symbol, currencyCode)} pending</p>
        )}
      </div>
    </button>
  );
}
