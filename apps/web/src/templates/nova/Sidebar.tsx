import { NavLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
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
}

export function NovaSidebar({ sections, userLabel, userSubLabel, onLogout }: SidebarProps) {
  const { data: branding } = useQuery({ queryKey: ["branding"], queryFn: fetchBranding, staleTime: Infinity });
  const { t } = useTranslation();

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-card/60 backdrop-blur-xl lg:flex">
      <div className="flex h-16 items-center gap-2 border-b border-border px-5">
        {branding?.logoUrl ? (
          <img src={branding.logoUrl} alt="" className="h-7 w-7 rounded-md object-cover" />
        ) : (
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-primary to-accent text-xs font-bold text-primary-foreground">
            {(branding?.productName ?? "W").slice(0, 1)}
          </div>
        )}
        <span className="truncate font-heading text-sm font-semibold tracking-tight">{branding?.productName ?? t("nav.whiteLabel", "White Label")}</span>
      </div>

      <nav className="scrollbar-thin flex-1 overflow-y-auto px-3 py-4">
        {sections.map((section) => (
          <div key={section.heading} className="mb-5">
            <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{section.heading}</p>
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary/15 text-primary shadow-[inset_0_0_0_1px_hsl(var(--brand-primary)/0.25)]"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
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

      <div className="border-t border-border px-4 py-3">
        <LanguageSwitcher />
      </div>

      <div className="flex items-center gap-2.5 border-t border-border px-4 py-3.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase">
          {userLabel.slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">{userLabel}</p>
          <p className="truncate text-[11px] text-muted-foreground">{userSubLabel}</p>
        </div>
        <button
          onClick={onLogout}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={t("nav.logout", "Log out")}
          title={t("nav.logout", "Log out")}
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
