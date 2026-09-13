import { useQuery } from "@tanstack/react-query";
import type { StatementLine, WalletBalance } from "@white-label/shared-types";
import { formatCurrencyAmount } from "@white-label/shared-types";
import { Wallet, Clock, ArrowLeftRight, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { portalApi } from "@/lib/api-client";
import type { Paginated } from "@/lib/types";
import { useTemplate } from "@/templates/useTemplate";
import type { ActivityItem, DashboardChartPoint } from "@/templates/types";

export default function PortalDashboardPage() {
  const T = useTemplate();
  const { t } = useTranslation();

  const walletsQuery = useQuery({
    queryKey: ["portal", "wallets"],
    queryFn: () => portalApi.get<WalletBalance[]>("/portal/wallets"),
  });

  const primary = walletsQuery.data?.[0];

  const statementQuery = useQuery({
    queryKey: ["portal", "wallets", primary?.walletId, "statement"],
    queryFn: () =>
      portalApi.get<Paginated<StatementLine>>(`/portal/wallets/${primary!.walletId}/statement`, { page: 1, pageSize: 12 }),
    enabled: !!primary,
  });

  const isLoading = walletsQuery.isLoading || (!!primary && statementQuery.isLoading);
  const lines = statementQuery.data?.items ?? [];

  const activity: ActivityItem[] = lines.map((l) => ({
    id: l.entryId,
    title: l.description ?? l.transactionType,
    subtitle: new Date(l.createdAt).toLocaleDateString(),
    amountMinor: l.amountMinor,
    decimals: primary?.decimals ?? 2,
    currencyCode: l.currencyCode,
    direction: l.direction,
    status: l.status,
    date: l.createdAt,
  }));

  const chartData: DashboardChartPoint[] = [...lines]
    .reverse()
    .filter((l) => l.runningBalanceMinor !== undefined)
    .map((l) => ({
      label: new Date(l.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      value: Number(l.runningBalanceMinor) / 10 ** (primary?.decimals ?? 2),
    }));

  const wallets = (walletsQuery.data ?? []).map((w) => ({
    currencyCode: w.currencyCode,
    decimals: w.decimals,
    symbol: w.symbol,
    availableMinor: w.availableMinor,
    pendingMinor: w.pendingMinor,
    label: t("dashboard.walletLabel", "Wallet"),
  }));

  const totalPending = (walletsQuery.data ?? []).reduce((sum, w) => sum + BigInt(w.pendingMinor || "0"), 0n);

  return (
    <T.DashboardLayout
      title={t("dashboard.title", "Welcome back")}
      subtitle={t("dashboard.subtitle", "Here's what's happening across your accounts")}
      heroLabel={t("dashboard.heroLabel", "Total balance")}
      heroAmountMinor={primary?.availableMinor}
      heroDecimals={primary?.decimals}
      heroCurrencyCode={primary?.currencyCode}
      heroSymbol={primary?.symbol}
      chartData={chartData}
      isLoading={isLoading}
      stats={[
        {
          label: t("dashboard.stats.available", "Available"),
          value: primary ? formatCurrencyAmount(primary.availableMinor, primary.decimals, primary.symbol, primary.currencyCode) : "—",
          icon: Wallet,
        },
        {
          label: t("dashboard.stats.pending", "Pending"),
          value: primary ? formatCurrencyAmount(totalPending.toString(), primary.decimals, primary.symbol, primary.currencyCode) : "—",
          icon: Clock,
        },
        { label: t("dashboard.stats.wallets", "Wallets"), value: String(walletsQuery.data?.length ?? 0), icon: ArrowLeftRight },
        { label: t("dashboard.stats.recentActivity", "Recent activity"), value: String(activity.length), icon: TrendingUp },
      ]}
      wallets={wallets}
      activity={activity}
      activityTitle={t("dashboard.activityTitle", "Recent activity")}
    />
  );
}
