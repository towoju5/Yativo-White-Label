import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Home, ArrowDownToLine, Settings, ArrowUpFromLine, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";

/** Bottom tab bar shown on mobile viewports, mirroring the primary shortcuts native banking
 * apps surface below the fold. Sits alongside each template's existing top bar / hamburger menu,
 * which still carries the full navigation list. */
export function MobileBottomNav() {
  const { t } = useTranslation();

  const items = [
    { to: "/portal", label: t("nav.home", "Home"), icon: Home, end: true },
    { to: "/portal/deposit", label: t("nav.deposit", "Deposit"), icon: ArrowDownToLine },
    { to: "/portal/send", label: t("nav.payout", "Payout"), icon: ArrowUpFromLine },
    { to: "/portal/cards", label: t("nav.cards", "Cards"), icon: CreditCard },
    { to: "/portal/settings", label: t("nav.settings", "Settings"), icon: Settings },
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg lg:hidden"
      aria-label={t("nav.portal", "Portal")}
    >
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            cn(
              "flex flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors",
              isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )
          }
        >
          {({ isActive }) => (
            <>
              <item.icon className={cn("h-5 w-5", isActive && "fill-primary/15")} strokeWidth={isActive ? 2.25 : 2} />
              <span className="leading-none">{item.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
