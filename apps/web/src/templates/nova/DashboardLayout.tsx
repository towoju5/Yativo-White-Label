import { formatMinorAmount } from "@white-label/shared-types";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { BalanceChart } from "@/components/charts/BalanceChart";
import { cn } from "@/lib/utils";
import type { DashboardLayoutProps } from "../types";
import { NovaStatCard } from "./StatCard";
import { NovaWalletBalanceCard } from "./WalletBalanceCard";

export function NovaDashboardLayout({
  title,
  subtitle,
  chartData,
  stats,
  wallets,
  activity,
  activityTitle,
  actions,
  isLoading,
}: DashboardLayoutProps) {
  const { t } = useTranslation();
  const resolvedActivityTitle = activityTitle ?? t("dashboardLayout.nova.recentActivity", "Recent activity");
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {actions}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {stats.map((s) => (
            <NovaStatCard key={s.label} {...s} />
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-border bg-card/70 p-5 shadow-soft lg:col-span-2">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("dashboardLayout.nova.balanceTrend", "Balance trend")}</p>
          {isLoading ? (
            <Skeleton className="h-[220px] w-full" />
          ) : chartData && chartData.length > 0 ? (
            <BalanceChart data={chartData} showAxes />
          ) : (
            <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
              {t("dashboardLayout.nova.noActivityYet", "No activity yet")}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("dashboardLayout.nova.wallets", "Wallets")}</p>
          {isLoading ? (
            <>
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
            </>
          ) : wallets && wallets.length > 0 ? (
            <div className="grid gap-3">
              {wallets.map((w) => (
                <NovaWalletBalanceCard key={w.currencyCode} {...w} />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {t("dashboardLayout.nova.noWalletsYet", "No wallets yet")}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card/70 shadow-soft">
        <div className="border-b border-border px-5 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{resolvedActivityTitle}</p>
        </div>
        {isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : activity.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">{t("dashboardLayout.nova.nothingHereYet", "Nothing here yet")}</div>
        ) : (
          <div className="divide-y divide-border">
            {activity.map((item) => (
              <div key={item.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                    item.direction === "CREDIT" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
                  )}
                >
                  {item.direction === "CREDIT" ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{item.title}</p>
                  {item.subtitle && <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <p className={cn("font-mono font-medium", item.direction === "CREDIT" ? "text-success" : "text-foreground")}>
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
  );
}
