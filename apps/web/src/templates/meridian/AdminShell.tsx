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
  Fingerprint,
} from "lucide-react";
import { useStaffAuth } from "@/hooks/useStaffAuth";
import { MeridianSidebar, type NavSection } from "./Sidebar";
import { MeridianTopbar } from "./Topbar";

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
      { to: "/admin/cards", label: "Cards", icon: CreditCard },
      { to: "/admin/crypto", label: "Crypto wallets", icon: Coins },
    ],
  },
  {
    heading: "Platform",
    items: [
      { to: "/admin/team", label: "Team", icon: UserPlus },
      { to: "/admin/roles", label: "Roles", icon: Lock },
      { to: "/admin/webhooks", label: "Webhooks", icon: Webhook },
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
      { to: "/admin/settings/wallet-currencies", label: "Wallet currencies", icon: Landmark },
      { to: "/admin/settings/verification", label: "Verification", icon: ShieldCheck },
    ],
  },
];

export function MeridianAdminShell({ children }: { children: ReactNode }) {
  const { user, logout } = useStaffAuth();

  return (
    <div className="flex min-h-screen bg-background">
      <MeridianSidebar sections={sections} userLabel={user?.email ?? "Staff"} userSubLabel={user?.role ?? ""} onLogout={logout} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MeridianTopbar sections={sections} productName="Admin" onLogout={logout} />
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-6">{children}</main>
      </div>
    </div>
  );
}
