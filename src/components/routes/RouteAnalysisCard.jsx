import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Clock, MapPin, Euro, AlertTriangle, CheckCircle } from "lucide-react";

export default function RouteAnalysisCard({ route, objects, personnel, costSettings }) {
  const analysis = useMemo(() => {
    if (!route || !costSettings) return null;

    const routeObjects = objects.filter(o => (route.object_ids || []).includes(o.id));
    const person = personnel.find(p => p.id === route.personnel_id);

    // Service time
    const totalServiceMin = routeObjects.reduce((s, o) => s + (o.service_duration_minutes || 0), 0);
    const travelMin = routeObjects.length > 1 
      ? (routeObjects.length) * (route.avg_travel_minutes || 0)
      : 0;
    const totalRouteMin = totalServiceMin + travelMin;
    const totalRouteHours = totalRouteMin / 60;

    // Revenue
    const revenuePerVisit = routeObjects.reduce((s, o) => s + (o.price_per_visit || 0), 0);
    const visitsPerMonth = route.visits_per_month || 22;
    const monthlyRevenue = revenuePerVisit * visitsPerMonth;

    // Personnel cost
    let surchargePct = 0;
    if (route.shift_type === "avond") surchargePct = person?.evening_surcharge_pct || 30;
    else if (route.shift_type === "nacht") surchargePct = person?.night_surcharge_pct || 50;
    else if (route.shift_type === "weekend") surchargePct = person?.weekend_surcharge_pct || 50;

    const baseRate = person?.base_hourly_rate || 14;
    const withSurcharge = baseRate * (1 + surchargePct / 100);
    const withVacation = withSurcharge * (1 + (person?.vacation_allowance_pct || 8) / 100);
    const effectiveRate = withVacation * (1 + (person?.employer_costs_pct || 32) / 100);
    const personnelCostPerVisit = effectiveRate * totalRouteHours;
    const monthlyPersonnelCost = personnelCostPerVisit * visitsPerMonth;

    // Vehicle costs
    const cs = costSettings;
    const depreciationPerMonth = ((cs.vehicle_purchase_price || 0) - (cs.vehicle_residual_value || 0)) / ((cs.vehicle_depreciation_years || 5) * 12);
    const variableCostPerKm = (cs.fuel_cost_per_km || 0) + (cs.maintenance_cost_per_km || 0) + (cs.tire_cost_per_km || 0);
    const monthlyKm = (route.total_distance_km || 0) * visitsPerMonth;
    const monthlyVehicleVariable = variableCostPerKm * monthlyKm;
    const monthlyVehicleFixed = depreciationPerMonth + (cs.insurance_per_month || 0);

    // Fixed overhead (proportion based on route time)
    const totalFixedOverhead = (cs.office_costs_per_month || 0) + (cs.admin_salary_per_month || 0) + (cs.other_fixed_costs_per_month || 0);

    // Total costs
    const totalMonthlyCosts = monthlyPersonnelCost + monthlyVehicleVariable + monthlyVehicleFixed + totalFixedOverhead;
    const profit = monthlyRevenue - totalMonthlyCosts;
    const margin = monthlyRevenue > 0 ? (profit / monthlyRevenue) * 100 : 0;

    // Break-even
    const breakEvenPerMinute = totalRouteMin > 0 ? totalMonthlyCosts / (totalRouteMin * visitsPerMonth) : 0;
    const currentPricePerMinute = totalRouteMin > 0 ? monthlyRevenue / (totalRouteMin * visitsPerMonth) : 0;

    return {
      routeObjects,
      person,
      totalServiceMin,
      travelMin,
      totalRouteMin,
      totalRouteHours,
      revenuePerVisit,
      monthlyRevenue,
      effectiveRate,
      monthlyPersonnelCost,
      monthlyVehicleVariable,
      monthlyVehicleFixed,
      totalFixedOverhead,
      totalMonthlyCosts,
      profit,
      margin,
      breakEvenPerMinute,
      currentPricePerMinute,
      visitsPerMonth,
      monthlyKm,
    };
  }, [route, objects, personnel, costSettings]);

  if (!analysis) return null;

  const isProfitable = analysis.profit >= 0;

  return (
    <Card className="border-0 shadow-sm overflow-hidden">
      <CardHeader className="pb-3 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">{route.name}</CardTitle>
          <Badge className={isProfitable ? "bg-emerald-50 text-emerald-700 border-emerald-200 border" : "bg-red-50 text-red-700 border-red-200 border"}>
            {isProfitable ? <CheckCircle className="w-3 h-3 mr-1" /> : <AlertTriangle className="w-3 h-3 mr-1" />}
            {isProfitable ? "Winstgevend" : "Verliesgevend"}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-3 mt-2">
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <MapPin className="w-3 h-3" /> {analysis.routeObjects.length} objecten
          </span>
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <Clock className="w-3 h-3" /> {analysis.totalRouteMin} min/bezoek
          </span>
          <span className="text-xs text-slate-500">
            {analysis.person?.name || "Geen medewerker"} · {route.shift_type}
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        {/* Revenue & Costs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Omzet/mnd</p>
            <p className="text-lg font-bold text-slate-900">€{analysis.monthlyRevenue.toFixed(0)}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Kosten/mnd</p>
            <p className="text-lg font-bold text-slate-900">€{analysis.totalMonthlyCosts.toFixed(0)}</p>
          </div>
          <div className={`rounded-lg p-3 ${isProfitable ? "bg-emerald-50" : "bg-red-50"}`}>
            <p className={`text-[10px] font-semibold uppercase tracking-wider ${isProfitable ? "text-emerald-500" : "text-red-500"}`}>Winst/mnd</p>
            <p className={`text-lg font-bold ${isProfitable ? "text-emerald-700" : "text-red-700"}`}>
              {isProfitable ? "+" : ""}€{analysis.profit.toFixed(0)}
            </p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Marge</p>
            <p className={`text-lg font-bold ${analysis.margin >= 0 ? "text-emerald-700" : "text-red-700"}`}>
              {analysis.margin.toFixed(1)}%
            </p>
          </div>
        </div>

        {/* Cost breakdown */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Kostenverdeling per maand</p>
          <div className="space-y-1.5">
            <CostRow label="Personeel" value={analysis.monthlyPersonnelCost} total={analysis.totalMonthlyCosts} />
            <CostRow label="Voertuig variabel" value={analysis.monthlyVehicleVariable} total={analysis.totalMonthlyCosts} />
            <CostRow label="Voertuig vast" value={analysis.monthlyVehicleFixed} total={analysis.totalMonthlyCosts} />
            <CostRow label="Overhead" value={analysis.totalFixedOverhead} total={analysis.totalMonthlyCosts} />
          </div>
        </div>

        {/* Break-even */}
        <div className="bg-amber-50 rounded-lg p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 mb-2">Break-even analyse</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-amber-600">Break-even prijs/min</p>
              <p className="text-lg font-bold text-amber-900">€{analysis.breakEvenPerMinute.toFixed(3)}</p>
            </div>
            <div>
              <p className="text-xs text-amber-600">Huidige prijs/min</p>
              <p className="text-lg font-bold text-amber-900">€{analysis.currentPricePerMinute.toFixed(3)}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CostRow({ label, value, total }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-600 w-32">{label}</span>
      <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
        <div className="bg-slate-700 h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-xs font-medium text-slate-700 w-20 text-right">€{value.toFixed(0)} ({pct.toFixed(0)}%)</span>
    </div>
  );
}