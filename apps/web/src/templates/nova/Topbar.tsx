import { useState } from "react";
import { NavLink } from "react-router-dom";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import type { NavSection } from "./Sidebar";

interface TopbarProps {
  sections: NavSection[];
  productName: string;
  right?: React.ReactNode;
}

export function NovaTopbar({ sections, productName, right }: TopbarProps) {
  const [open, setOpen] = useState(false);

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card/60 px-4 backdrop-blur-xl lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger className="rounded-md p-2 hover:bg-muted">
          <Menu className="h-5 w-5" />
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0">
          <div className="flex h-14 items-center border-b border-border px-4 font-heading text-sm font-semibold">{productName}</div>
          <nav className="p-3">
            {sections.map((section) => (
              <div key={section.heading} className="mb-4">
                <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{section.heading}</p>
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium",
                        isActive ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted",
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
          <div className="border-t border-border px-3 py-3">
            <LanguageSwitcher />
          </div>
        </SheetContent>
      </Sheet>
      <span className="font-heading text-sm font-semibold">{productName}</span>
      <div className="flex items-center gap-2">{right}</div>
    </header>
  );
}
