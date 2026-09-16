import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Menu, LogOut, Sun, Moon } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { findCurrentPageLabel } from "@/lib/currentPageLabel";
import { useTemplate } from "@/templates/useTemplate";
import { getStoredColorScheme, setStoredColorScheme } from "@/templates/TemplateProvider";
import type { NavSection } from "./Sidebar";

interface TopbarProps {
  sections: NavSection[];
  productName: string;
  onLogout: () => void;
}

/** Mobile-only header — the desktop nav lives in MeridianSidebar. */
export function MeridianTopbar({ sections, productName, onLogout }: TopbarProps) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const pageLabel = findCurrentPageLabel(sections.flatMap((s) => s.items), pathname, productName);
  const template = useTemplate();
  const [isDark, setIsDark] = useState(() => (getStoredColorScheme(template.id) ?? (template.id === "nova" ? "dark" : "light")) === "dark");

  function toggleTheme() {
    const next = !isDark;
    setStoredColorScheme(template.id, next ? "dark" : "light");
    setIsDark(next);
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-card px-4 lg:hidden">
      <span className="truncate font-heading text-sm font-semibold">{pageLabel}</span>
      <div className="flex items-center gap-2">
        <button
          onClick={toggleTheme}
          aria-label={isDark ? t("topbar.switchToLightMode", "Switch to light mode") : t("topbar.switchToDarkMode", "Switch to dark mode")}
          title={isDark ? t("topbar.switchToLightMode", "Switch to light mode") : t("topbar.switchToDarkMode", "Switch to dark mode")}
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger className="rounded-lg p-2 hover:bg-muted">
            <Menu className="h-5 w-5" />
          </SheetTrigger>
          <SheetContent side="left" className="w-72 space-y-4 overflow-y-auto p-4">
            <div className="flex h-10 items-center font-heading text-sm font-semibold">{productName}</div>
            {sections.map((section) => (
              <div key={section.heading} className="rounded-2xl border border-border bg-card p-2.5">
                <p className="mb-1.5 px-2 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{section.heading}</p>
                <div className="space-y-1">
                  {section.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      onClick={() => setOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium",
                          isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                        )
                      }
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
            <div className="rounded-2xl border border-border bg-card p-2.5">
              <LanguageSwitcher />
            </div>
            <button
              onClick={onLogout}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10"
            >
              <LogOut className="h-4 w-4" /> {t("nav.logout", "Log out")}
            </button>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
