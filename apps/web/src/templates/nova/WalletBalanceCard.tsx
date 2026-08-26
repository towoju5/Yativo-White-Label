import { formatCurrencyAmount, formatMinorAmount } from "@white-label/shared-types";
import { Wallet } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { WalletBalanceCardProps } from "../types";

export function NovaWalletBalanceCard({ currencyCode, decimals, symbol, availableMinor, pendingMinor, label, onClick, className }: WalletBalanceCardProps) {
  const { t } = useTranslation();
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative flex w-full flex-col gap-3 overflow-hidden rounded-lg border border-border bg-gradient-to-br from-card to-card/60 p-4 text-left shadow-soft transition-all hover:border-primary/40 hover:shadow-glow",
        onClick ? "cursor-pointer" : "cursor-default",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Wallet className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">{label ?? t("walletBalanceCard.wallet", "Wallet")}</p>
            <p className="font-mono text-xs text-muted-foreground">{currencyCode}</p>
          </div>
        </div>
      </div>
      <div>
        <p className="font-heading text-xl font-semibold tracking-tight">
          {symbol ? (
            <>
              {formatCurrencyAmount(availableMinor, decimals, symbol, currencyCode)}
            </>
          ) : (
            <>
              {formatMinorAmount(availableMinor, decimals)} <span className="text-sm text-muted-foreground">{currencyCode}</span>
            </>
          )}
        </p>
        {BigInt(pendingMinor || "0") !== 0n && (
          <p className="mt-0.5 text-xs text-warning">
            {t("walletBalanceCard.pending", "+{{amount}} pending", { amount: formatCurrencyAmount(pendingMinor, decimals, symbol, currencyCode) })}
          </p>
        )}
      </div>
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/10 blur-2xl transition-opacity group-hover:opacity-80" />
    </button>
  );
}
