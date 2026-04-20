import clsx from "clsx";
import type { LucideIcon } from "lucide-react";

interface MetricTileProps {
  label: string;
  value: string;
  icon: LucideIcon;
  trend?: { pct: number; direction: "up" | "down" | "flat" };
  caption?: string;
}

export function MetricTile({ label, value, icon: Icon, trend, caption }: MetricTileProps) {
  return (
    <div className="rounded-lg border border-border bg-background p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-muted uppercase tracking-wide">{label}</span>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="text-2xl font-semibold text-foreground tabular-nums">{value}</div>
      <div className="mt-2 flex items-center gap-2 text-xs">
        {trend && (
          <span
            className={clsx(
              "font-medium tabular-nums",
              trend.direction === "up" && "text-success",
              trend.direction === "down" && "text-danger",
              trend.direction === "flat" && "text-muted",
            )}
          >
            {trend.direction === "up" ? "↑" : trend.direction === "down" ? "↓" : "→"} {trend.pct.toFixed(1)}%
          </span>
        )}
        {caption && <span className="text-muted">{caption}</span>}
      </div>
    </div>
  );
}
