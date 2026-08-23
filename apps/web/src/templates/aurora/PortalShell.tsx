import type { ReactNode } from "react";
import { LayoutDashboard, Wallet, Send, ArrowDownToLine, Coins, Landmark, Users, CreditCard, UserCheck, Settings } from "lucide-react";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { AuroraSidebar, type NavSection } from "./Sidebar";
import { AuroraTopbar } from "./Topbar";

const sections: NavSection[] = [
  {
    heading: "Account",
    items: [
      { to: "/portal", label: "Dashboard", icon: LayoutDashboard, end: true },
      { to: "/portal/wallets", label: "Wallets", icon: Wallet },
      { to: "/portal/send", label: "Send money", icon: Send },
      { to: "/portal/deposit", label: "Deposit", icon: ArrowDownToLine },
      { to: "/portal/crypto", label: "Crypto wallets", icon: Coins },
      { to: "/portal/virtual-accounts", label: "Virtual accounts", icon: Landmark },
    ],
  },
  {
    heading: "Manage",
    items: [
      { to: "/portal/beneficiaries", label: "Beneficiaries", icon: Users },
      { to: "/portal/cards", label: "Cards", icon: CreditCard },
      { to: "/portal/profile", label: "Profile & KYC", icon: UserCheck },
      { to: "/portal/settings", label: "Settings", icon: Settings },
    ],
  },
];

const PROFILE_PATH = "/portal/profile";

export function AuroraPortalShell({ children }: { children: ReactNode }) {
  const { user, logout } = useCustomerAuth();
  const name = user?.fullName ?? user?.businessName ?? user?.email ?? "Account";

  return (
    <div className="flex min-h-screen bg-background">
      <AuroraSidebar sections={sections} userLabel={name} userSubLabel={user?.email ?? ""} onLogout={logout} profileTo={PROFILE_PATH} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AuroraTopbar sections={sections} productName="Portal" userLabel={name} onLogout={logout} profileTo={PROFILE_PATH} />
        <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">{children}</main>
      </div>
    </div>
  );
}
