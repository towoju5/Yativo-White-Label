import { formatMinorAmount } from "@white-label/shared-types";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BalanceChart } from "@/components/charts/BalanceChart";
import { cn } from "@/lib/utils";
import type { DashboardLayoutProps } from "../types";
import { MeridianStatCard } from "./StatCard";
import { MeridianWalletBalanceCard } from "./WalletBalanceCard";

export function MeridianDashboardLayout({
  title,
  subtitle,
  heroLabel,
  chartData,
  stats,
  wallets,
  activity,
  activityTitle,
  actions,
  isLoading,
}: DashboardLayoutProps) {
  const { t } = useTranslation();
  const resolvedActivityTitle = activityTitle ?? t("dashboardLayout.meridian.recentActivity", "Recent activity");
  return (
    <div className="flex flex-col gap-6">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-r from-card to-muted/50 p-8 shadow-soft">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">{heroLabel ?? t("dashboardLayout.meridian.overview", "Overview")}</p>
        <h1 className="mt-2 font-heading text-3xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>}
        {actions && <div className="mt-6 flex flex-wrap gap-3">{actions}</div>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("dashboardLayout.meridian.overview", "Overview")}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {stats.map((s) => (
                <MeridianStatCard key={s.label} {...s} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {(isLoading || (chartData && chartData.length > 0)) && (
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboardLayout.meridian.balanceTrend", "Balance trend")}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-[220px] w-full" /> : <BalanceChart data={chartData!} showAxes />}
          </CardContent>
        </Card>
      )}

      {wallets && (
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboardLayout.meridian.wallets", "Wallets")}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Skeleton className="h-28" />
                <Skeleton className="h-28" />
              </div>
            ) : wallets.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {wallets.map((w) => (
                  <MeridianWalletBalanceCard key={w.currencyCode} {...w} />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                {t("dashboardLayout.meridian.noWalletsYet", "No wallets yet")}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{resolvedActivityTitle}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-6 pt-0">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : activity.length === 0 ? (
            <div className="p-8 pt-0 text-center text-sm text-muted-foreground">{t("dashboardLayout.meridian.nothingHereYet", "Nothing here yet")}</div>
          ) : (
            <div className="divide-y divide-border border-t border-border">
              {activity.map((item) => (
                <div key={item.id} className="flex items-center gap-3 px-6 py-3 text-sm">
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
        </CardContent>
      </Card>
    </div>
  );
}
