import type { ReactNode } from "react";
import { LayoutDashboard, Wallet, Send, ArrowDownToLine, Coins, Landmark, Users, CreditCard, UserCheck, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { NovaSidebar, type NavSection } from "./Sidebar";
import { NovaTopbar } from "./Topbar";

export function NovaPortalShell({ children }: { children: ReactNode }) {
  const { user, logout } = useCustomerAuth();
  const { t } = useTranslation();
  const name = user?.fullName ?? user?.businessName ?? user?.email ?? t("nav.account", "Account");

  const sections: NavSection[] = [
    {
      heading: t("nav.section.account", "Account"),
      items: [
        { to: "/portal", label: t("nav.dashboard", "Dashboard"), icon: LayoutDashboard, end: true },
        { to: "/portal/wallets", label: t("nav.wallets", "Wallets"), icon: Wallet },
        { to: "/portal/send", label: t("nav.sendMoney", "Send money"), icon: Send },
        { to: "/portal/deposit", label: t("nav.deposit", "Deposit"), icon: ArrowDownToLine },
        { to: "/portal/crypto", label: t("nav.cryptoWallets", "Crypto wallets"), icon: Coins },
        { to: "/portal/virtual-accounts", label: t("nav.virtualAccounts", "Virtual accounts"), icon: Landmark },
      ],
    },
    {
      heading: t("nav.section.manage", "Manage"),
      items: [
        { to: "/portal/beneficiaries", label: t("nav.beneficiaries", "Beneficiaries"), icon: Users },
        { to: "/portal/cards", label: t("nav.cards", "Cards"), icon: CreditCard },
        { to: "/portal/profile", label: t("nav.profileKyc", "Profile & KYC"), icon: UserCheck },
        { to: "/portal/settings", label: t("nav.settings", "Settings"), icon: Settings },
      ],
    },
  ];

  return (
    <div className="flex min-h-screen bg-background">
      <NovaSidebar sections={sections} userLabel={name} userSubLabel={user?.email ?? ""} onLogout={logout} />
      <div className="flex min-w-0 flex-1 flex-col">
        <NovaTopbar sections={sections} productName={t("nav.portal", "Portal")} />
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
