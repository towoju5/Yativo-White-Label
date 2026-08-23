import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StatCardProps } from "../types";

export function PrimeStatCard({ label, value, hint, icon: Icon, trend, className }: StatCardProps) {
  return (
    <div className={cn("rounded-lg border border-border bg-card p-4", className)}>
      <div className="flex items-center gap-1.5">
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="font-mono text-xl font-semibold tabular-nums tracking-tight">{value}</p>
        {trend && (
          <span
            className={cn(
              "flex items-center gap-0.5 text-xs font-medium",
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
      </div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
