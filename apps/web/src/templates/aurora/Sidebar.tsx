import { NavLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { LucideIcon } from "lucide-react";
import { ChevronRight, LogOut } from "lucide-react";
import { fetchBranding } from "@/theme/branding";
import { cn } from "@/lib/utils";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
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
}

export function AuroraSidebar({ sections, userLabel, userSubLabel, onLogout, profileTo }: SidebarProps) {
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
      <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-card px-4 py-3.5 shadow-elevated">
        {branding?.logoUrl ? (
          <img src={branding.logoUrl} alt="" className="h-8 w-8 rounded-xl object-cover" />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-sm font-bold text-white shadow-soft">
            {(branding?.productName ?? "W").slice(0, 1)}
          </div>
        )}
        <span className="truncate font-heading text-sm font-semibold tracking-tight">{branding?.productName ?? t("nav.whiteLabel", "White Label")}</span>
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
                  <item.icon className="h-4 w-4 shrink-0" />
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
