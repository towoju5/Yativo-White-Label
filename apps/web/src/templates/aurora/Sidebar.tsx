import { NavLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { LucideIcon } from "lucide-react";
import { ChevronRight, LogOut } from "lucide-react";
import { fetchBranding } from "@/theme/branding";
import { cn } from "@/lib/utils";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { BrandLogo } from "@/components/BrandLogo";
import { NotificationBell } from "@/components/notifications/NotificationBell";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  /** Small attention dot on the icon, e.g. to flag an incomplete KYC submission. */
  showDot?: boolean;
}

export interface NavSection {
  heading: string;
  items: NavItem[];
}

interface SidebarProps {
  sections: NavSection[];
  userLabel: string;
  userSubLabel: string;
  onLogout: () => void;
  /** Route the bottom user row links to — when omitted, the row is static (e.g. staff have no profile page). */
  profileTo?: string;
  /** Only the portal shell passes this — the admin console has no customer session for the bell's /portal/notifications calls to work against. */
  showNotifications?: boolean;
}

export function AuroraSidebar({ sections, userLabel, userSubLabel, onLogout, profileTo, showNotifications }: SidebarProps) {
  const { data: branding } = useQuery({ queryKey: ["branding"], queryFn: fetchBranding, staleTime: Infinity });
  const { t } = useTranslation();

  const userRowContent = (
    <>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary text-xs font-semibold uppercase text-white shadow-soft">
        {userLabel.slice(0, 2)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{userLabel}</p>
        <p className="truncate text-xs text-muted-foreground">{userSubLabel}</p>
      </div>
    </>
  );

  return (
    <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col gap-5 bg-muted/30 p-4 lg:flex">
      <div className="flex items-center justify-between gap-2.5 rounded-2xl border border-border bg-card px-4 py-3.5 shadow-elevated">
        <BrandLogo
          branding={branding}
          className="h-8"
          badgeClassName="rounded-xl from-primary to-secondary text-sm text-white shadow-soft"
          textClassName="text-sm"
        />
        {showNotifications && <NotificationBell />}
      </div>

      <nav className="scrollbar-thin flex-1 space-y-4 overflow-y-auto">
        {sections.map((section) => (
          <div key={section.heading} className="rounded-2xl border border-border bg-card p-2.5 shadow-elevated">
            <p className="mb-1.5 px-2.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{section.heading}</p>
            <div className="space-y-1">
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium transition-all",
                      isActive
                        ? "bg-gradient-to-r from-primary to-secondary text-white shadow-soft"
                        : "text-muted-foreground hover:bg-muted",
                    )
                  }
                >
                  <span className="relative shrink-0">
                    <item.icon className="h-4 w-4" />
                    {item.showDot && <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-destructive" />}
                  </span>
                  <span className="truncate">{item.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="rounded-2xl border border-border bg-card px-3.5 py-3 shadow-elevated">
        <LanguageSwitcher />
      </div>

      <div className="flex items-center gap-1.5 rounded-2xl border border-border bg-card px-2 py-2 pl-3.5 shadow-elevated">
        {profileTo ? (
          <NavLink to={profileTo} className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-xl py-1 transition-opacity hover:opacity-80">
            {userRowContent}
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </NavLink>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2.5">{userRowContent}</div>
        )}
        <button
          onClick={onLogout}
          className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={t("nav.logout", "Log out")}
          title={t("nav.logout", "Log out")}
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
