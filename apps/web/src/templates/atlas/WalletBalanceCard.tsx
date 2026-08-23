import { formatCurrencyAmount } from "@white-label/shared-types";
import { cn } from "@/lib/utils";
import type { WalletBalanceCardProps } from "../types";

export function AtlasWalletBalanceCard({ currencyCode, decimals, symbol, availableMinor, pendingMinor, label, onClick, className }: WalletBalanceCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-56 shrink-0 snap-start flex-col justify-between gap-4 rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-card to-card p-5 text-left shadow-soft transition-transform hover:-translate-y-0.5",
        onClick ? "cursor-pointer" : "cursor-default",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-card px-2.5 py-1 font-mono text-xs font-semibold text-foreground shadow-soft">{currencyCode}</span>
        <span className="text-xs text-muted-foreground">{label ?? "Wallet"}</span>
      </div>
      <div>
        <p className="font-heading text-xl font-semibold tracking-tight">{formatCurrencyAmount(availableMinor, decimals, symbol, currencyCode)}</p>
        {BigInt(pendingMinor || "0") !== 0n && (
          <p className="mt-0.5 text-xs text-warning">+{formatCurrencyAmount(pendingMinor, decimals, symbol, currencyCode)} pending</p>
        )}
      </div>
    </button>
  );
}
