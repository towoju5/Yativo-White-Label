import { NavLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { LogOut } from "lucide-react";
import { fetchBranding } from "@/theme/branding";
import { cn } from "@/lib/utils";

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

export function MeridianSidebar({ sections, userLabel, userSubLabel, onLogout }: SidebarProps) {
  const { data: branding } = useQuery({ queryKey: ["branding"], queryFn: fetchBranding, staleTime: Infinity });

  return (
    <aside className="hidden w-72 shrink-0 flex-col gap-4 bg-muted/40 p-4 lg:flex">
      <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-card px-4 py-3.5 shadow-soft">
        {branding?.logoUrl ? (
          <img src={branding.logoUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            {(branding?.productName ?? "W").slice(0, 1)}
          </div>
        )}
        <span className="truncate font-heading text-sm font-semibold tracking-tight">{branding?.productName ?? "White Label"}</span>
      </div>

      <nav className="scrollbar-thin flex-1 space-y-4 overflow-y-auto">
        {sections.map((section) => (
          <div key={section.heading} className="rounded-2xl border border-border bg-card p-2.5 shadow-soft">
            <p className="mb-1.5 px-2 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{section.heading}</p>
            <div className="space-y-1">
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium transition-colors",
                      isActive ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:bg-muted",
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

      <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-card px-3.5 py-3 shadow-soft">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold uppercase text-primary">
          {userLabel.slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">{userLabel}</p>
          <p className="truncate text-[11px] text-muted-foreground">{userSubLabel}</p>
        </div>
        <button
          onClick={onLogout}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Log out"
          title="Log out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
