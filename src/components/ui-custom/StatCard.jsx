import React from "react";
import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";

export default function StatCard({ title, value, icon: Icon, trend, trendLabel, className = "" }) {
  const isPositive = trend > 0;
  
  return (
    <Card className={`relative overflow-hidden border-0 bg-white shadow-sm hover:shadow-md transition-all duration-300 ${className}`}>
      <div className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</p>
            <p className="text-2xl font-bold text-slate-900">{value}</p>
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
                {trendLabel && <span className="text-xs text-slate-400">{trendLabel}</span>}
              </div>
            )}
          </div>
          {Icon && (
            <div className="rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 p-3 shadow-lg">
              <Icon className="w-5 h-5 text-amber-400" />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}