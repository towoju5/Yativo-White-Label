import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import type { CustomerTransactionListItem, StatementLine, WalletBalance } from "@white-label/shared-types";
import { formatCurrencyAmount } from "@white-label/shared-types";
import { Wallet, Clock, ArrowLeftRight, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { portalApi } from "@/lib/api-client";
import type { Paginated } from "@/lib/types";
import { useTemplate } from "@/templates/useTemplate";
import type { ActivityItem, DashboardChartPoint } from "@/templates/types";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";

export default function PortalDashboardPage() {
  const T = useTemplate();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useCustomerAuth();
  const displayName = user?.fullName?.split(" ")[0] || user?.businessName || user?.email || null;

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

  // Recent activity is customer-wide (every currency wallet, same source TransactionsPage.tsx
  // uses) — NOT scoped to `primary`, which is just whichever wallet's currency happens to sort
  // first alphabetically and can easily be an empty/unused one while the customer's real activity
  // sits in a different currency.
  const transactionsQuery = useQuery({
    queryKey: ["portal", "transactions", "recent"],
    queryFn: () => portalApi.get<Paginated<CustomerTransactionListItem>>("/portal/transactions", { page: 1, pageSize: 12 }),
  });

  const isLoading = walletsQuery.isLoading || (!!primary && statementQuery.isLoading) || transactionsQuery.isLoading;
  const lines = statementQuery.data?.items ?? [];
  const decimalsByCurrency = new Map((walletsQuery.data ?? []).map((w) => [w.currencyCode, w.decimals]));

  const activity: ActivityItem[] = (transactionsQuery.data?.items ?? [])
    .filter((tx) => tx.amountMinor !== null && tx.currencyCode !== null && tx.direction !== null)
    .map((tx) => ({
      id: tx.id,
      title: tx.description ?? tx.type,
      subtitle: new Date(tx.createdAt).toLocaleDateString(),
      amountMinor: tx.amountMinor!,
      decimals: decimalsByCurrency.get(tx.currencyCode!) ?? 2,
      currencyCode: tx.currencyCode!,
      direction: tx.direction!,
      status: tx.status,
      date: tx.createdAt,
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
    onClick: () => navigate(`/portal/wallets/${w.walletId}`),
  }));

  const totalPending = (walletsQuery.data ?? []).reduce((sum, w) => sum + BigInt(w.pendingMinor || "0"), 0n);

  return (
    <T.DashboardLayout
      title={displayName ? t("dashboard.titleNamed", "Welcome back, {{name}}", { name: displayName }) : t("dashboard.title", "Welcome back")}
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
