import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  ArrowLeftRight,
  Send,
  CreditCard,
  UserPlus,
  Webhook,
  LifeBuoy,
  Scale,
  Palette,
  KeyRound,
  Coins,
  Landmark,
  DollarSign,
  Banknote,
  ShieldCheck,
  Gauge,
  BadgeCheck,
  FileText,
  Lock,
  Fingerprint,
  Bell,
  MessageCircle,
  Mail,
  Plug,
  HardDrive,
  History,
  TrendingUp,
  Type,
} from "lucide-react";
import { useStaffAuth } from "@/hooks/useStaffAuth";
import { AuroraSidebar, type NavSection } from "./Sidebar";
import { AuroraTopbar } from "./Topbar";

const sections: NavSection[] = [
  {
    heading: "Overview",
    items: [{ to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true }],
  },
  {
    heading: "Operations",
    items: [
      { to: "/admin/customers", label: "Customers", icon: Users },
      { to: "/admin/endorsements", label: "Endorsements", icon: BadgeCheck },
      { to: "/admin/transactions", label: "Ledger", icon: ArrowLeftRight },
      { to: "/admin/payouts", label: "Payouts", icon: Send },
      { to: "/admin/profit", label: "Platform profit", icon: TrendingUp },
      { to: "/admin/cards", label: "Virtual Cards", icon: CreditCard },
      { to: "/admin/business-spend-cards", label: "Business Cards", icon: CreditCard },
      { to: "/admin/crypto", label: "Crypto wallets", icon: Coins },
      { to: "/admin/virtual-accounts", label: "Virtual accounts", icon: Landmark },
    ],
  },
  {
    heading: "Platform",
    items: [
      { to: "/admin/team", label: "Team", icon: UserPlus },
      { to: "/admin/roles", label: "Roles", icon: Lock },
      { to: "/admin/webhooks", label: "Webhooks", icon: Webhook },
      { to: "/admin/audit-log", label: "Audit log", icon: History },
      { to: "/admin/support", label: "Support tickets", icon: LifeBuoy },
      { to: "/admin/reconciliation", label: "Reconciliation", icon: Scale },
      { to: "/admin/pages", label: "Pages", icon: FileText },
    ],
  },
  {
    heading: "Settings",
    items: [
      { to: "/admin/settings/branding", label: "Branding", icon: Palette },
      { to: "/admin/settings/api-keys", label: "API keys", icon: KeyRound },
      { to: "/admin/settings/authentication", label: "Authentication", icon: Fingerprint },
      { to: "/admin/settings/notifications", label: "Notifications", icon: Bell },
      { to: "/admin/settings/notification-channels", label: "Notification channels", icon: MessageCircle },
      { to: "/admin/settings/email-templates", label: "Email templates", icon: Mail },
      { to: "/admin/settings/wallet-currencies", label: "Wallet currencies", icon: Landmark },
      { to: "/admin/settings/pricing", label: "Pricing", icon: DollarSign },
      { to: "/admin/settings/payment-gateways", label: "Payment gateways", icon: Banknote },
      { to: "/admin/settings/verification", label: "Verification", icon: ShieldCheck },
      { to: "/admin/settings/limits", label: "Withdrawal limits", icon: Gauge },
      { to: "/admin/settings/integrations", label: "Integrations", icon: Plug },
      { to: "/admin/settings/storage", label: "Storage", icon: HardDrive },
      { to: "/admin/settings/endorsements", label: "Endorsements display", icon: BadgeCheck },
      { to: "/admin/settings/nav-labels", label: "Customer menu", icon: Type },
    ],
  },
];

export function AuroraAdminShell({ children, fullWidth }: { children: ReactNode; fullWidth?: boolean }) {
  const { user, logout } = useStaffAuth();

  return (
    <div className="flex min-h-screen bg-background">
      <AuroraSidebar sections={sections} userLabel={user?.email ?? "Staff"} userSubLabel={user?.role ?? ""} onLogout={logout} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AuroraTopbar sections={sections} productName="Admin" userLabel={user?.email ?? "Staff"} onLogout={logout} />
        <main className={cn("mx-auto flex w-full flex-col gap-6 overflow-x-hidden p-6", fullWidth ? "max-w-none" : "max-w-7xl")}>{children}</main>
      </div>
    </div>
  );
}
