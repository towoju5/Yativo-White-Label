import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StatCardProps } from "../types";

export function AtlasStatCard({ label, value, hint, icon: Icon, trend, className }: StatCardProps) {
  return (
    <div className={cn("flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 shadow-soft", className)}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {Icon && (
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
      <p className="font-heading text-2xl font-semibold tracking-tight">{value}</p>
      {(trend || hint) && (
        <div className="flex items-center gap-1.5 text-xs">
          {trend && (
            <span
              className={cn(
                "flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium",
                trend.direction === "up" && "bg-success/15 text-success",
                trend.direction === "down" && "bg-destructive/15 text-destructive",
                trend.direction === "flat" && "bg-muted text-muted-foreground",
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
