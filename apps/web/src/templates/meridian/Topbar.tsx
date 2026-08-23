import { useState } from "react";
import { NavLink } from "react-router-dom";
import { Menu, LogOut } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { NavSection } from "./Sidebar";

interface TopbarProps {
  sections: NavSection[];
  productName: string;
  onLogout: () => void;
}

/** Mobile-only header — the desktop nav lives in MeridianSidebar. */
export function MeridianTopbar({ sections, productName, onLogout }: TopbarProps) {
  const [open, setOpen] = useState(false);

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4 lg:hidden">
      <span className="font-heading text-sm font-semibold">{productName}</span>
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
          <button
            onClick={onLogout}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10"
          >
            <LogOut className="h-4 w-4" /> Log out
          </button>
        </SheetContent>
      </Sheet>
    </header>
  );
}
