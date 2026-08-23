import type { ReactNode } from "react";
import {
  LayoutDashboard,
  Users,
  ArrowLeftRight,
  Send,
  CreditCard,
  UserPlus,
  Webhook,
  Scale,
  Palette,
  KeyRound,
  Coins,
  Landmark,
  ShieldCheck,
  BadgeCheck,
  FileText,
  Lock,
} from "lucide-react";
import { useStaffAuth } from "@/hooks/useStaffAuth";
import { AtlasTopbar, type NavItem } from "./Topbar";

const items: NavItem[] = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/admin/customers", label: "Customers", icon: Users },
  { to: "/admin/endorsements", label: "Endorsements", icon: BadgeCheck },
  { to: "/admin/transactions", label: "Ledger", icon: ArrowLeftRight },
  { to: "/admin/payouts", label: "Payouts", icon: Send },
  { to: "/admin/cards", label: "Cards", icon: CreditCard },
  { to: "/admin/crypto", label: "Crypto wallets", icon: Coins },
  { to: "/admin/team", label: "Team", icon: UserPlus },
  { to: "/admin/roles", label: "Roles", icon: Lock },
  { to: "/admin/webhooks", label: "Webhooks", icon: Webhook },
  { to: "/admin/reconciliation", label: "Reconciliation", icon: Scale },
  { to: "/admin/pages", label: "Pages", icon: FileText },
  { to: "/admin/settings/branding", label: "Branding", icon: Palette },
  { to: "/admin/settings/api-keys", label: "API keys", icon: KeyRound },
  { to: "/admin/settings/wallet-currencies", label: "Wallet currencies", icon: Landmark },
  { to: "/admin/settings/verification", label: "Verification", icon: ShieldCheck },
];

export function AtlasAdminShell({ children }: { children: ReactNode }) {
  const { user, logout } = useStaffAuth();

  return (
    <div className="min-h-screen bg-background">
      <AtlasTopbar items={items} userLabel={user?.email ?? "Staff"} userSubLabel={user?.role ?? ""} onLogout={logout} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10">{children}</main>
    </div>
  );
}
