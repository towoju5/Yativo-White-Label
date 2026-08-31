import { NavLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { LucideIcon } from "lucide-react";
import { fetchBranding } from "@/theme/branding";
import { cn } from "@/lib/utils";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { BrandLogo } from "@/components/BrandLogo";

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
}

export function PrimeSidebar({ sections }: SidebarProps) {
  const { data: branding } = useQuery({ queryKey: ["branding"], queryFn: fetchBranding, staleTime: Infinity });
  const { t } = useTranslation();

  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-card lg:flex">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        {branding?.logoUrl ? (
          <BrandLogo branding={branding} className="h-6 w-6 rounded object-cover" />
        ) : (
          <>
            <div className="flex h-6 w-6 items-center justify-center rounded bg-primary text-xs font-bold text-primary-foreground">
              {(branding?.productName ?? "W").slice(0, 1)}
            </div>
            <span className="truncate text-sm font-semibold tracking-tight">{branding?.productName ?? t("nav.whiteLabel", "White Label")}</span>
          </>
        )}
      </div>

      <nav className="scrollbar-thin flex-1 overflow-y-auto px-3 py-4">
        {sections.map((section) => (
          <div key={section.heading} className="mb-5">
            <p className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{section.heading}</p>
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      "relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                      isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && <span className="absolute -left-1 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary" />}
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-border px-3 py-3">
        <LanguageSwitcher />
      </div>
    </aside>
  );
}
