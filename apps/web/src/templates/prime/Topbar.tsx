import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Menu, LogOut, Sun, Moon, Bell } from "lucide-react";
import { useTemplate } from "@/templates/useTemplate";
import { getStoredColorScheme, setStoredColorScheme } from "@/templates/TemplateProvider";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { NavSection } from "./Sidebar";

interface TopbarProps {
  sections: NavSection[];
  productName: string;
  userLabel: string;
  userSubLabel: string;
  onLogout: () => void;
}

export function PrimeTopbar({ sections, productName, userLabel, userSubLabel, onLogout }: TopbarProps) {
  const template = useTemplate();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [isDark, setIsDark] = useState(() => (getStoredColorScheme(template.id) ?? (template.id === "nova" ? "dark" : "light")) === "dark");

  function toggleTheme() {
    const next = !isDark;
    setStoredColorScheme(template.id, next ? "dark" : "light");
    setIsDark(next);
  }

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b border-border bg-background px-4 sm:px-6">
      <div className="flex items-center gap-3">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger className="rounded-md p-1.5 hover:bg-muted lg:hidden">
            <Menu className="h-5 w-5" />
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <div className="flex h-14 items-center border-b border-border px-4 text-sm font-semibold">{productName}</div>
            <nav className="p-3">
              {sections.map((section) => (
                <div key={section.heading} className="mb-4">
                  <p className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{section.heading}</p>
                  {section.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      onClick={() => setOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium",
                          isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted",
                        )
                      }
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              ))}
            </nav>
            <div className="border-t border-border px-3 py-3 lg:hidden">
              <LanguageSwitcher />
            </div>
          </SheetContent>
        </Sheet>
        <span className="text-sm font-medium text-muted-foreground lg:hidden">{productName}</span>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={toggleTheme}
          aria-label={isDark ? t("topbar.prime.switchToLightMode", "Switch to light mode") : t("topbar.prime.switchToDarkMode", "Switch to dark mode")}
          title={isDark ? t("topbar.prime.switchToLightMode", "Switch to light mode") : t("topbar.prime.switchToDarkMode", "Switch to dark mode")}
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <button
          aria-label={t("topbar.prime.notifications", "Notifications")}
          title={t("topbar.prime.notifications", "Notifications")}
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Bell className="h-4 w-4" />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger className="ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold uppercase text-primary hover:bg-primary/15">
            {userLabel.slice(0, 2)}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="truncate">{userSubLabel}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onLogout} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" /> {t("nav.logout", "Log out")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
