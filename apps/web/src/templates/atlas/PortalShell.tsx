import type { ReactNode } from "react";
import { LayoutDashboard, Wallet, Send, ArrowDownToLine, Coins, Landmark, Users, CreditCard, UserCheck, Settings, History, FileText, LifeBuoy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { AtlasTopbar, type NavItem } from "./Topbar";

export function AtlasPortalShell({ children }: { children: ReactNode }) {
  const { user, logout } = useCustomerAuth();
  const { t } = useTranslation();
  const name = user?.fullName ?? user?.businessName ?? user?.email ?? t("nav.account", "Account");

  const items: NavItem[] = [
    { to: "/portal", label: t("nav.atlas.home", "Home"), icon: LayoutDashboard, end: true },
    { to: "/portal/wallets", label: t("nav.wallets", "Wallets"), icon: Wallet },
    { to: "/portal/send", label: t("nav.atlas.send", "Send"), icon: Send },
    { to: "/portal/deposit", label: t("nav.deposit", "Deposit"), icon: ArrowDownToLine },
    { to: "/portal/crypto", label: t("nav.cryptoWallets", "Crypto wallets"), icon: Coins },
    { to: "/portal/virtual-accounts", label: t("nav.virtualAccounts", "Virtual accounts"), icon: Landmark },
    { to: "/portal/transactions", label: t("nav.transactions", "Transactions"), icon: History },
    { to: "/portal/statements", label: t("nav.statements", "Statements"), icon: FileText },
    { to: "/portal/beneficiaries", label: t("nav.atlas.contacts", "Contacts"), icon: Users },
    { to: "/portal/cards", label: t("nav.cards", "Cards"), icon: CreditCard },
    { to: "/portal/profile", label: t("nav.atlas.profile", "Profile"), icon: UserCheck },
    { to: "/portal/support", label: t("nav.support", "Support"), icon: LifeBuoy },
    { to: "/portal/settings", label: t("nav.settings", "Settings"), icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-background">
      <AtlasTopbar items={items} userLabel={name} userSubLabel={user?.email ?? ""} onLogout={logout} />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">{children}</main>
    </div>
  );
}
