import type { ReactNode } from "react";
import { LayoutDashboard, Wallet, Send, ArrowDownToLine, Coins, Landmark, Users, CreditCard, UserCheck, Settings } from "lucide-react";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { AtlasTopbar, type NavItem } from "./Topbar";

const items: NavItem[] = [
  { to: "/portal", label: "Home", icon: LayoutDashboard, end: true },
  { to: "/portal/wallets", label: "Wallets", icon: Wallet },
  { to: "/portal/send", label: "Send", icon: Send },
  { to: "/portal/deposit", label: "Deposit", icon: ArrowDownToLine },
      { to: "/portal/crypto", label: "Crypto wallets", icon: Coins },
  { to: "/portal/virtual-accounts", label: "Virtual accounts", icon: Landmark },
  { to: "/portal/beneficiaries", label: "Contacts", icon: Users },
  { to: "/portal/cards", label: "Cards", icon: CreditCard },
  { to: "/portal/profile", label: "Profile", icon: UserCheck },
  { to: "/portal/settings", label: "Settings", icon: Settings },
];

export function AtlasPortalShell({ children }: { children: ReactNode }) {
  const { user, logout } = useCustomerAuth();
  const name = user?.fullName ?? user?.businessName ?? user?.email ?? "Account";

  return (
    <div className="min-h-screen bg-background">
      <AtlasTopbar items={items} userLabel={name} userSubLabel={user?.email ?? ""} onLogout={logout} />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">{children}</main>
    </div>
  );
}
