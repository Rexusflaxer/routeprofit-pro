import React from "react";
import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";

export default function StatCard({ title, value, icon: Icon, trend, trendLabel, className = "" }) {
  const isPositive = trend > 0;

  return (
    <Card className={`relative overflow-hidden border border-border bg-card shadow-sm transition-shadow hover:shadow-md ${className}`}>
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
            <p className="text-2xl font-semibold text-foreground">{value}</p>
            {trend !== undefined && (
              <div className="flex items-center gap-1.5">
                {isPositive ? (
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5 text-red-500" />
                )}
                <span className={`text-xs font-medium ${isPositive ? "text-emerald-600" : "text-red-600"}`}>
                  {isPositive ? "+" : ""}{trend}%
                </span>
                {trendLabel && <span className="text-xs text-muted-foreground">{trendLabel}</span>}
              </div>
            )}
          </div>
          {Icon && (
            <div className="rounded-lg bg-secondary p-2.5">
              <Icon className="h-5 w-5 text-foreground" />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
