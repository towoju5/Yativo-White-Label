import { formatMinorAmount } from "@white-label/shared-types";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BalanceChart } from "@/components/charts/BalanceChart";
import { cn } from "@/lib/utils";
import type { ActivityItem, DashboardLayoutProps } from "../types";
import { PrimeStatCard } from "./StatCard";
import { PrimeWalletBalanceCard } from "./WalletBalanceCard";

const STATUS_VARIANT: Record<string, BadgeProps["variant"]> = {
  POSTED: "success",
  APPROVED: "success",
  SUCCEEDED: "success",
  PENDING: "warning",
  UNDER_REVIEW: "warning",
  REVERSED: "destructive",
  FAILED: "destructive",
  REJECTED: "destructive",
};

function StatusBadge({ status }: { status: ActivityItem["status"] }) {
  return (
    <Badge variant={STATUS_VARIANT[status.toUpperCase()] ?? "secondary"} className="capitalize">
      {status.toLowerCase()}
    </Badge>
  );
}

export function PrimeDashboardLayout({
  title,
  subtitle,
  chartData,
  stats,
  wallets,
  activity,
  activityTitle = "Recent activity",
  actions,
  isLoading,
}: DashboardLayoutProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {stats.map((s) => (
            <PrimeStatCard key={s.label} {...s} />
          ))}
        </div>
      )}

      {(isLoading || (chartData && chartData.length > 0)) && (
        <div className="rounded-lg border border-border bg-card p-5">
          <p className="mb-4 text-sm font-medium">Balance trend</p>
          {isLoading ? <Skeleton className="h-[200px] w-full" /> : <BalanceChart data={chartData!} height={200} showAxes />}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {wallets && (
          <div className="rounded-lg border border-border bg-card lg:col-span-1">
            <div className="border-b border-border px-4 py-3">
              <p className="text-sm font-medium">Wallets</p>
            </div>
            {isLoading ? (
              <div className="space-y-2 p-4">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            ) : wallets.length > 0 ? (
              <div className="divide-y divide-border">
                {wallets.map((w) => (
                  <PrimeWalletBalanceCard key={w.currencyCode} {...w} />
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-muted-foreground">No wallets yet</div>
            )}
          </div>
        )}

        <div className={cn("rounded-lg border border-border bg-card", wallets ? "lg:col-span-2" : "lg:col-span-3")}>
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-medium">{activityTitle}</p>
          </div>
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : activity.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Nothing here yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] table-fixed text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Description</th>
                    <th className="w-28 px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Status</th>
                    <th className="w-44 px-4 py-2 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {activity.map((item) => (
                    <tr key={item.id} className="transition-colors hover:bg-muted/40">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={cn(
                              "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                              item.direction === "CREDIT" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
                            )}
                          >
                            {item.direction === "CREDIT" ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{item.title}</p>
                            {item.subtitle && <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={item.status} />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={cn("font-mono tabular-nums", item.direction === "CREDIT" ? "text-success" : "text-foreground")}>
                          {item.direction === "CREDIT" ? "+" : "-"}
                          {formatMinorAmount(item.amountMinor, item.decimals)} {item.currencyCode}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
