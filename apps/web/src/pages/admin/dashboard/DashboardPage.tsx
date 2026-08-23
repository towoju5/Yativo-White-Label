import { useQuery } from "@tanstack/react-query";
import { formatCurrencyAmount, type DashboardSummary } from "@white-label/shared-types";
import { Activity, Clock, ShieldQuestion, Users } from "lucide-react";
import { staffApi } from "@/lib/api-client";
import type { AdminTransactionRow, Paginated } from "@/lib/types";
import { useTemplate } from "@/templates/useTemplate";
import type { ActivityItem } from "@/templates/types";

export default function AdminDashboardPage() {
  const T = useTemplate();

  const summaryQuery = useQuery({
    queryKey: ["admin", "dashboard", "summary"],
    queryFn: () => staffApi.get<DashboardSummary>("/admin/dashboard/summary"),
  });

  const txQuery = useQuery({
    queryKey: ["admin", "transactions", "recent"],
    queryFn: () => staffApi.get<Paginated<AdminTransactionRow>>("/admin/transactions", { page: 1, pageSize: 10 }),
  });

  const summary = summaryQuery.data;
  const primary = summary?.balancesByCurrency?.[0];
  const volume30d = primary ? summary?.postedVolumeLast30Days.find((v) => v.currencyCode === primary.currencyCode) : undefined;
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
          value: volume30d ? formatCurrencyAmount(volume30d.totalMinor, primary?.decimals ?? 2, primary?.symbol, primary?.currencyCode ?? "") : "—",
          icon: Activity,
        },
        { label: "Pending payouts", value: String(summary?.pendingPayoutsCount ?? 0), icon: Clock },
        { label: "KYC queue", value: String(kycQueueCount), icon: ShieldQuestion },
        { label: "Customers", value: String(summary?.customerCount ?? 0), icon: Users },
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
  );
}
