import { formatCurrencyAmount, formatMinorAmount } from "@white-label/shared-types";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { BalanceChart } from "@/components/charts/BalanceChart";
import { cn } from "@/lib/utils";
import type { DashboardLayoutProps } from "../types";
import { AtlasStatCard } from "./StatCard";
import { AtlasWalletBalanceCard } from "./WalletBalanceCard";

export function AtlasDashboardLayout({
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
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {actions}
      </div>

      {heroAmountMinor !== undefined && (
        <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary via-primary to-secondary p-8 text-primary-foreground shadow-elevated">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-1/3 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium opacity-80">{heroLabel ?? "Total balance"}</p>
              {isLoading ? (
                <Skeleton className="mt-2 h-10 w-48 bg-white/20" />
              ) : (
                <p className="mt-1 font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
                  {heroSymbol ? (
                    formatCurrencyAmount(heroAmountMinor, heroDecimals ?? 2, heroSymbol, heroCurrencyCode ?? "")
                  ) : (
                    <>
                      {formatMinorAmount(heroAmountMinor, heroDecimals ?? 2)}{" "}
                      <span className="text-xl font-normal opacity-80">{heroCurrencyCode}</span>
                    </>
                  )}
                </p>
              )}
            </div>
            {chartData && chartData.length > 0 && (
              <div className="w-full sm:w-64">
                <BalanceChart data={chartData} color="rgba(255,255,255,0.9)" height={80} />
              </div>
            )}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {stats.map((s) => (
            <AtlasStatCard key={s.label} {...s} />
          ))}
        </div>
      )}

      {wallets && (
        <div>
          <p className="mb-3 font-heading text-sm font-semibold">Your wallets</p>
          {isLoading ? (
            <div className="flex gap-4">
              <Skeleton className="h-36 w-56 rounded-2xl" />
              <Skeleton className="h-36 w-56 rounded-2xl" />
            </div>
          ) : wallets.length > 0 ? (
            <div className="scrollbar-thin flex snap-x gap-4 overflow-x-auto pb-2">
              {wallets.map((w) => (
                <AtlasWalletBalanceCard key={w.currencyCode} {...w} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No wallets yet</div>
          )}
        </div>
      )}

      <div>
        <p className="mb-3 font-heading text-sm font-semibold">{activityTitle}</p>
        {isLoading ? (
          <div className="flex gap-4">
            <Skeleton className="h-24 w-64 rounded-2xl" />
            <Skeleton className="h-24 w-64 rounded-2xl" />
          </div>
        ) : activity.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nothing here yet</div>
        ) : (
          <div className="scrollbar-thin flex snap-x gap-4 overflow-x-auto pb-2">
            {activity.map((item) => (
              <div key={item.id} className="flex w-64 shrink-0 snap-start flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
                <div className="flex items-center justify-between">
                  <div
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full",
                      item.direction === "CREDIT" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {item.direction === "CREDIT" ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                  </div>
                  <span className="text-xs capitalize text-muted-foreground">{item.status.toLowerCase()}</span>
                </div>
                <div>
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  {item.subtitle && <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>}
                </div>
                <p className={cn("font-mono text-sm font-semibold", item.direction === "CREDIT" ? "text-success" : "text-foreground")}>
                  {item.direction === "CREDIT" ? "+" : "-"}
                  {formatMinorAmount(item.amountMinor, item.decimals)} {item.currencyCode}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
