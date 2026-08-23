import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StatCardProps } from "../types";

export function MeridianStatCard({ label, value, hint, icon: Icon, trend, className }: StatCardProps) {
  return (
    <div className={cn("rounded-lg border border-border bg-card p-4", className)}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      </div>
      <p className="mt-2 font-heading text-2xl font-bold tracking-tight">{value}</p>
      {(trend || hint) && (
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
      )}
    </div>
  );
}
