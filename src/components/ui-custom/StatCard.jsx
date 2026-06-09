import React from "react";
import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";

export default function StatCard({ title, value, icon: Icon, trend, trendLabel, className = "" }) {
  const isPositive = trend > 0;

  return (
    <Card className={`relative overflow-hidden border-border bg-card transition-colors hover:bg-accent/40 ${className}`}>
      <div className="p-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase text-muted-foreground">{title}</p>
            <p className="text-[24px] font-semibold leading-7 text-foreground">{value}</p>
            {trend !== undefined && (
              <div className="flex items-center gap-1.5">
                {isPositive ? (
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                )}
                <span className={`text-xs font-medium ${isPositive ? "text-emerald-600" : "text-red-600"}`}>
                  {isPositive ? "+" : ""}{trend}%
                </span>
                {trendLabel && <span className="text-xs text-muted-foreground">{trendLabel}</span>}
              </div>
            )}
          </div>
          {Icon && (
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
