import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { LayoutDashboard, Wallet, Send, ArrowDownToLine, Coins, Landmark, Users, CreditCard, UserCheck, UserCog, Settings, History, FileText, LifeBuoy } from "lucide-react";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { AuroraSidebar, type NavSection } from "./Sidebar";
import { AuroraTopbar } from "./Topbar";

const PROFILE_PATH = "/portal/profile";

export function AuroraPortalShell({ children }: { children: ReactNode }) {
  const { user, logout } = useCustomerAuth();
  const { t } = useTranslation();
  const name = user?.fullName ?? user?.businessName ?? user?.email ?? t("nav.account", "Account");
  const canManageTeam = user?.type === "BUSINESS" && (user.principalType !== "member" || (user.permissions?.includes("team.manage") ?? false));

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
        { to: "/portal/transactions", label: t("nav.transactions", "Transactions"), icon: History },
        { to: "/portal/statements", label: t("nav.statements", "Statements"), icon: FileText },
      ],
    },
    {
      heading: t("nav.section.manage", "Manage"),
      items: [
        { to: "/portal/beneficiaries", label: t("nav.beneficiaries", "Beneficiaries"), icon: Users },
        { to: "/portal/cards", label: t("nav.cards", "Cards"), icon: CreditCard },
        { to: "/portal/profile", label: t("nav.profileKyc", "Profile & KYC"), icon: UserCheck },
        { to: "/portal/support", label: t("nav.support", "Support"), icon: LifeBuoy },
        ...(canManageTeam ? [{ to: "/portal/team", label: t("nav.team", "Team"), icon: UserCog }] : []),
        { to: "/portal/settings", label: t("nav.settings", "Settings"), icon: Settings },
      ],
    },
  ];

  return (
    <div className="flex min-h-screen bg-background">
      <AuroraSidebar sections={sections} userLabel={name} userSubLabel={user?.email ?? ""} onLogout={logout} profileTo={PROFILE_PATH} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AuroraTopbar sections={sections} productName={t("nav.portal", "Portal")} userLabel={name} onLogout={logout} profileTo={PROFILE_PATH} />
        <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6 pb-24 lg:pb-6">{children}</main>
      </div>
      <MobileBottomNav />
    </div>
  );
}
