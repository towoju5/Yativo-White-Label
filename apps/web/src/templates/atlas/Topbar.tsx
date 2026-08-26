import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { LucideIcon } from "lucide-react";
import { Menu, LogOut, ChevronDown } from "lucide-react";
import { fetchBranding } from "@/theme/branding";
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

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

interface TopbarProps {
  items: NavItem[];
  userLabel: string;
  userSubLabel: string;
  onLogout: () => void;
}

export function AtlasTopbar({ items, userLabel, userSubLabel, onLogout }: TopbarProps) {
  const { data: branding } = useQuery({ queryKey: ["branding"], queryFn: fetchBranding, staleTime: Infinity });
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const productName = branding?.productName ?? t("nav.whiteLabel", "White Label");

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2">
          {branding?.logoUrl ? (
            <img src={branding.logoUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-sm font-bold text-primary-foreground">
              {productName.slice(0, 1)}
            </div>
          )}
          <span className="font-heading text-base font-semibold tracking-tight">{productName}</span>
        </div>

        <nav className="scrollbar-thin hidden max-w-xl items-center gap-1 overflow-x-auto rounded-full border border-border bg-card/60 p-1 lg:flex">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                  isActive ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:text-foreground",
                )
              }
            >
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden md:block">
            <LanguageSwitcher />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger className="hidden items-center gap-2 rounded-full border border-border bg-card px-2 py-1.5 pr-3 text-sm shadow-soft md:flex">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold uppercase text-primary">
                {userLabel.slice(0, 2)}
              </div>
              <span className="max-w-[9rem] truncate">{userLabel}</span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="truncate">{userSubLabel}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onLogout} className="text-destructive">
                <LogOut className="mr-2 h-4 w-4" /> {t("nav.logout", "Log out")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger className="rounded-full p-2 hover:bg-muted md:hidden">
              <Menu className="h-5 w-5" />
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <div className="mt-4">
                <LanguageSwitcher />
              </div>
              <nav className="mt-4 space-y-1">
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium",
                        isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                      )
                    }
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </NavLink>
                ))}
                <button
                  onClick={onLogout}
                  className="mt-3 flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10"
                >
                  <LogOut className="h-4 w-4" /> {t("nav.logout", "Log out")}
                </button>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
