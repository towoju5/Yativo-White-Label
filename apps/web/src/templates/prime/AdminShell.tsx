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
import { PrimeSidebar, type NavSection } from "./Sidebar";
import { PrimeTopbar } from "./Topbar";

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
      { to: "/admin/settings/wallet-currencies", label: "Wallet currencies", icon: Landmark },
      { to: "/admin/settings/verification", label: "Verification", icon: ShieldCheck },
    ],
  },
];

export function PrimeAdminShell({ children }: { children: ReactNode }) {
  const { user, logout } = useStaffAuth();

  return (
    <div className="flex min-h-screen bg-background">
      <PrimeSidebar sections={sections} />
      <div className="flex min-w-0 flex-1 flex-col">
        <PrimeTopbar sections={sections} productName="Admin" userLabel={user?.email ?? "Staff"} userSubLabel={user?.role ?? ""} onLogout={logout} />
        <main className="flex-1 p-6">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
