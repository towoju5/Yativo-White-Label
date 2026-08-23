import { formatMinorAmount, formatCurrencyAmount } from "@white-label/shared-types";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { BalanceChart } from "@/components/charts/BalanceChart";
import { cn } from "@/lib/utils";
import type { DashboardLayoutProps } from "../types";
import { AuroraStatCard } from "./StatCard";
import { AuroraWalletBalanceCard } from "./WalletBalanceCard";

export function AuroraDashboardLayout({
  title,
  subtitle,
  heroLabel,
  heroAmountMinor,
  heroDecimals,
  heroCurrencyCode,
  heroSymbol,
  chartData,
  stats,
  wallets,
  activity,
  activityTitle = "Recent activity",
  actions,
  isLoading,
}: DashboardLayoutProps) {
  const hasChart = isLoading || (chartData && chartData.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>

      {/* Row 1 — balance hero + trend, minimum two blocks side by side */}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-card to-secondary/10 p-8 shadow-elevated lg:col-span-2">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-1/4 h-64 w-64 rounded-full bg-secondary/20 blur-3xl" />
          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">{heroLabel ?? "Balance"}</p>
            {isLoading ? (
              <Skeleton className="mt-3 h-10 w-56" />
            ) : heroAmountMinor !== undefined ? (
              <p className="mt-2 font-heading text-4xl font-bold tracking-tight sm:text-5xl">
                {heroSymbol ? (
                  formatCurrencyAmount(heroAmountMinor, heroDecimals ?? 2, heroSymbol, heroCurrencyCode ?? "")
                ) : (
                  <>
                    {formatMinorAmount(heroAmountMinor, heroDecimals ?? 2)} <span className="text-xl font-normal text-muted-foreground">{heroCurrencyCode}</span>
                  </>
                )}
              </p>
            ) : (
              <p className="mt-2 font-heading text-3xl font-bold tracking-tight">{title}</p>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-card p-6 shadow-elevated lg:col-span-1">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Trend</p>
          {isLoading ? (
            <Skeleton className="h-[140px] w-full" />
          ) : hasChart ? (
            <BalanceChart data={chartData!} height={140} />
          ) : (
            <div className="flex h-[140px] items-center justify-center rounded-xl bg-muted/40 text-center text-xs text-muted-foreground">
              No trend data yet
            </div>
          )}
        </div>
      </div>

      {/* Row 2 — stat tiles, inherently multi-column */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {stats.map((s) => (
            <AuroraStatCard key={s.label} {...s} />
          ))}
        </div>
      )}

      {/* Row 3 — wallets + activity, minimum two blocks side by side */}
      <div className="grid gap-5 lg:grid-cols-2">
        {wallets && (
          <div className="rounded-3xl border border-border bg-card p-5 shadow-elevated">
            <p className="mb-4 text-sm font-semibold">Wallets</p>
            {isLoading ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Skeleton className="h-28 rounded-2xl" />
                <Skeleton className="h-28 rounded-2xl" />
              </div>
            ) : wallets.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {wallets.map((w) => (
                  <AuroraWalletBalanceCard key={w.currencyCode} {...w} />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No wallets yet</div>
            )}
          </div>
        )}

        <div className={cn("rounded-3xl border border-border bg-card p-5 shadow-elevated", !wallets && "lg:col-span-2")}>
          <p className="mb-4 text-sm font-semibold">{activityTitle}</p>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-xl" />
              ))}
            </div>
          ) : activity.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nothing here yet</div>
          ) : (
            <div className="space-y-1.5">
              {activity.map((item) => (
                <div key={item.id} className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted/50">
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                      item.direction === "CREDIT" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {item.direction === "CREDIT" ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    {item.subtitle && <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={cn("font-mono text-sm font-semibold", item.direction === "CREDIT" ? "text-success" : "text-foreground")}>
                      {item.direction === "CREDIT" ? "+" : "-"}
                      {formatMinorAmount(item.amountMinor, item.decimals)} {item.currencyCode}
                    </p>
                    <p className="text-xs capitalize text-muted-foreground">{item.status.toLowerCase()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
