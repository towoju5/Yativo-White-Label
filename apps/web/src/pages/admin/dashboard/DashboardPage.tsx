import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  formatCurrencyAmount,
  type DashboardSummary,
} from "@white-label/shared-types";
import {
  Activity,
  AlertTriangle,
  Clock,
  ShieldQuestion,
  Users,
  X,
} from "lucide-react";
import { staffApi } from "@/lib/api-client";
import type { AdminTransactionRow, Paginated } from "@/lib/types";
import { useTemplate } from "@/templates/useTemplate";
import type { ActivityItem } from "@/templates/types";

/** Session-only dismissal — a reminder for something still unconfigured reappears next visit rather than being permanently silenceable, since the underlying gap hasn't actually been fixed. */
function ConfigRemindersBanner({
  reminders,
}: {
  reminders: DashboardSummary["configReminders"];
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const visible = reminders.filter((r) => !dismissed.has(r.key));
  if (visible.length === 0) return null;

  return (
    <div className="space-y-2">
      {visible.map((r) => (
        <div
          key={r.key}
          className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{r.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {r.description}
            </p>
          </div>
          <Link
            to={r.actionPath}
            className="shrink-0 whitespace-nowrap text-xs font-medium text-warning underline-offset-2 hover:underline"
          >
            Set up
          </Link>
          <button
            onClick={() => setDismissed((prev) => new Set(prev).add(r.key))}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

export default function AdminDashboardPage() {
  const T = useTemplate();

  const summaryQuery = useQuery({
    queryKey: ["admin", "dashboard", "summary"],
    queryFn: () => staffApi.get<DashboardSummary>("/admin/dashboard/summary"),
  });

  const txQuery = useQuery({
    queryKey: ["admin", "transactions", "recent"],
    queryFn: () =>
      staffApi.get<Paginated<AdminTransactionRow>>("/admin/transactions", {
        page: 1,
        pageSize: 10,
      }),
  });

  const summary = summaryQuery.data;
  const primary = summary?.balancesByCurrency?.[0];
  const volume30d = primary
    ? summary?.postedVolumeLast30Days.find(
        (v) => v.currencyCode === primary.currencyCode,
      )
    : undefined;
  const kycQueueCount = summary?.customersByKycStatus.PENDING ?? 0;

  const activity: ActivityItem[] = (txQuery.data?.items ?? []).map((tx) => ({
    id: tx.id,
    title: tx.description ?? tx.type,
    subtitle: tx.customerEmail ?? tx.externalSource,
    amountMinor: tx.amountMinor ?? "0",
    decimals: primary?.decimals ?? 2,
    currencyCode: tx.currencyCode ?? primary?.currencyCode ?? "USD",
    direction: tx.direction ?? "CREDIT",
    status: tx.status,
    date: tx.createdAt,
  }));

  return (
    <div className="space-y-4">
      {summary && <ConfigRemindersBanner reminders={summary.configReminders} />}
      <T.DashboardLayout
        title="Platform overview"
        subtitle="Balances, volume and operational queues across your business"
        heroLabel="Platform balance"
        heroAmountMinor={primary?.totalAvailableMinor}
        heroDecimals={primary?.decimals}
        heroCurrencyCode={primary?.currencyCode}
        heroSymbol={primary?.symbol}
        isLoading={summaryQuery.isLoading}
        stats={[
          {
            label: "30d volume",
            value: volume30d
              ? formatCurrencyAmount(
                  volume30d.totalMinor,
                  primary?.decimals ?? 2,
                  primary?.symbol,
                  primary?.currencyCode ?? "",
                )
              : "—",
            icon: Activity,
          },
          {
            label: "Pending payouts",
            value: String(summary?.pendingPayoutsCount ?? 0),
            icon: Clock,
          },
          {
            label: "KYC queue",
            value: String(kycQueueCount),
            icon: ShieldQuestion,
          },
          {
            label: "Customers",
            value: String(summary?.customerCount ?? 0),
            icon: Users,
          },
        ]}
        wallets={(summary?.balancesByCurrency ?? []).map((b) => ({
          currencyCode: b.currencyCode,
          decimals: b.decimals,
          symbol: b.symbol,
          availableMinor: b.totalAvailableMinor,
          pendingMinor: b.totalPendingMinor,
          label: "Platform",
        }))}
        activity={activity}
        activityTitle="Recent transactions"
      />
    </div>
  );
}
