import { formatCurrencyAmount, formatMinorAmount } from "@white-label/shared-types";
import { Wallet } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { WalletBalanceCardProps } from "../types";

export function MeridianWalletBalanceCard({ currencyCode, decimals, symbol, availableMinor, pendingMinor, label, onClick, className }: WalletBalanceCardProps) {
  const { t } = useTranslation();
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full flex-col gap-3 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary/40",
        onClick ? "cursor-pointer" : "cursor-default",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Wallet className="h-3.5 w-3.5" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label ?? t("walletBalanceCard.wallet", "Wallet")}</p>
        </div>
        <span className="font-mono text-xs text-muted-foreground">{currencyCode}</span>
      </div>
      <div>
        <p className="font-heading text-xl font-bold tracking-tight">
          {symbol ? (
            formatCurrencyAmount(availableMinor, decimals, symbol, currencyCode)
          ) : (
            <>
              {formatMinorAmount(availableMinor, decimals)} <span className="text-sm font-medium text-muted-foreground">{currencyCode}</span>
            </>
          )}
        </p>
        {BigInt(pendingMinor || "0") !== 0n && (
          <p className="mt-0.5 text-xs text-warning">
            {t("walletBalanceCard.pending", "+{{amount}} pending", { amount: formatCurrencyAmount(pendingMinor, decimals, symbol, currencyCode) })}
          </p>
        )}
      </div>
    </button>
  );
}
