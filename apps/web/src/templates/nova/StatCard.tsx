import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StatCardProps } from "../types";

export function NovaStatCard({ label, value, hint, icon: Icon, trend, className }: StatCardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-border bg-card/70 p-4 shadow-soft backdrop-blur-sm",
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {Icon && (
          <div className="rounded-md bg-primary/10 p-1.5 text-primary">
            <Icon className="h-3.5 w-3.5" />
          </div>
        )}
      </div>
      <p className="mt-2.5 font-heading text-2xl font-semibold tracking-tight">{value}</p>
      <div className="mt-1.5 flex items-center gap-1.5 text-xs">
        {trend && (
          <span
            className={cn(
              "flex items-center gap-0.5 font-medium",
              trend.direction === "up" && "text-success",
              trend.direction === "down" && "text-destructive",
              trend.direction === "flat" && "text-muted-foreground",
            )}
          >
            {trend.direction === "up" && <TrendingUp className="h-3 w-3" />}
            {trend.direction === "down" && <TrendingDown className="h-3 w-3" />}
            {trend.direction === "flat" && <Minus className="h-3 w-3" />}
            {trend.value}
          </span>
        )}
        {hint && <span className="text-muted-foreground">{hint}</span>}
      </div>
      <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-primary/10 blur-2xl" />
    </div>
  );
}
