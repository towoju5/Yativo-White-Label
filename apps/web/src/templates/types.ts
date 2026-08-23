import type { ComponentType, FC, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/** A generic ledger-flavored activity row — statement lines, payouts, transactions all fit this shape. */
export interface ActivityItem {
  id: string;
  title: string;
  subtitle?: string;
  amountMinor: string;
  decimals: number;
  currencyCode: string;
  direction: "DEBIT" | "CREDIT";
  status: string;
  date: string;
}

export interface WalletBalanceCardProps {
  currencyCode: string;
  decimals: number;
  /** e.g. "$", "₦" — shown instead of the currency code when known. */
  symbol?: string | null;
  availableMinor: string;
  pendingMinor: string;
  label?: string;
  onClick?: () => void;
  className?: string;
}

export interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  trend?: { value: string; direction: "up" | "down" | "flat" };
  className?: string;
}

export interface DashboardChartPoint {
  label: string;
  value: number;
}

export interface DashboardLayoutProps {
  title: string;
  subtitle?: string;
  heroLabel?: string;
  heroAmountMinor?: string;
  heroDecimals?: number;
  heroCurrencyCode?: string;
  heroSymbol?: string | null;
  chartData?: DashboardChartPoint[];
  stats: StatCardProps[];
  wallets?: WalletBalanceCardProps[];
  activity: ActivityItem[];
  activityTitle?: string;
  actions?: ReactNode;
  isLoading?: boolean;
}

export interface TemplateTokens {
  fontHeading: string;
  fontBody: string;
  radius: string;
  shadow: string;
  density: "compact" | "comfortable";
  defaultPalette: {
    primary: string;
    secondary: string;
    accent: string;
  };
}

export interface TemplateComponents {
  id: "nova" | "atlas" | "meridian" | "prime" | "aurora";
  name: string;
  description: string;
  PortalShell: FC<{ children: ReactNode }>;
  AdminShell: FC<{ children: ReactNode }>;
  DashboardLayout: FC<DashboardLayoutProps>;
  WalletBalanceCard: FC<WalletBalanceCardProps>;
  StatCard: FC<StatCardProps>;
  LandingPage: FC;
  /** A small self-contained illustration used by the branding template picker — no external assets. */
  PreviewThumbnail: ComponentType<{ className?: string }>;
  tokens: TemplateTokens;
}
