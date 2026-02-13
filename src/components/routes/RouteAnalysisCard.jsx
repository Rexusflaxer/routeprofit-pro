import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Clock, MapPin, Euro, AlertTriangle, CheckCircle } from "lucide-react";

export default function RouteAnalysisCard({ route, vehicles, costSettings }) {
  const { data: allTasks = [] } = useQuery({
    queryKey: ['all-tasks'],
    queryFn: () => base44.entities.Task.list(),
  });

  const { data: objects = [] } = useQuery({
    queryKey: ['objects'],
    queryFn: () => base44.entities.SurveillanceObject.list(),
  });

  const analysis = useMemo(() => {
    if (!route || !costSettings) return null;

    const routeTasks = allTasks.filter(t => (route.task_ids || []).includes(t.id));
    
    // Service time
    const totalServiceMin = routeTasks.reduce((s, t) => s + (t.duration_minutes || 0), 0);
    const taskObjects = routeTasks.map(t => objects.find(o => o.id === t.object_id)).filter(Boolean);
    const travelMin = taskObjects.length > 1 
      ? (taskObjects.length - 1) * (route.avg_travel_minutes || 0)
      : 0;
    const totalRouteMin = totalServiceMin + travelMin;
    const totalRouteHours = totalRouteMin / 60;

    // Revenue
    const revenuePerVisit = routeTasks.reduce((s, t) => {
      if (t.pricing_type === 'per_minuut') {
        return s + ((t.price_amount || 0) * (t.duration_minutes || 0));
      } else {
        return s + (t.price_amount || 0);
      }
    }, 0);
    const visitsPerMonth = (route.weekdays || []).length * 4;
    const monthlyRevenue = revenuePerVisit * visitsPerMonth;

    // Vehicle costs
    const vehicle = vehicles.find(v => v.id === route.vehicle_id);
    const cs = costSettings;
    
    let monthlyVehicleFixed = 0;
    let variableCostPerKm = 0;
    
    if (vehicle) {
      // Vaste kosten per maand
      if (vehicle.acquisition_type === "lease" || vehicle.acquisition_type === "private_lease") {
        monthlyVehicleFixed = (vehicle.monthly_lease_cost || 0) + (vehicle.insurance_per_month || 0);
      } else if (vehicle.acquisition_type === "banklening") {
        const depreciation = ((vehicle.purchase_price || 0) - (vehicle.residual_value || 0)) / ((vehicle.depreciation_years || 5) * 12);
        monthlyVehicleFixed = depreciation + (vehicle.monthly_loan_payment || 0) + (vehicle.insurance_per_month || 0);
      } else { // aankoop
        const depreciation = ((vehicle.purchase_price || 0) - (vehicle.residual_value || 0)) / ((vehicle.depreciation_years || 5) * 12);
        monthlyVehicleFixed = depreciation + (vehicle.insurance_per_month || 0);
      }
      
      // Variabele kosten per km
      variableCostPerKm = vehicle.fuel_cost_per_km || 0;
      
      // Onderhoud per km
      if (vehicle.maintenance_type === "per_km" && vehicle.maintenance_interval_km > 0) {
        variableCostPerKm += (vehicle.maintenance_cost || 0) / vehicle.maintenance_interval_km;
      } else if (vehicle.maintenance_type === "per_month") {
        monthlyVehicleFixed += vehicle.maintenance_cost || 0;
      } else if (vehicle.maintenance_type === "per_quarter") {
        monthlyVehicleFixed += (vehicle.maintenance_cost || 0) / 3;
      } else if (vehicle.maintenance_type === "per_year") {
        monthlyVehicleFixed += (vehicle.maintenance_cost || 0) / 12;
      }
      
      // Banden per km
      if (vehicle.tire_type === "per_km" && vehicle.tire_interval_km > 0) {
        variableCostPerKm += (vehicle.tire_cost || 0) / vehicle.tire_interval_km;
      } else if (vehicle.tire_type === "per_month") {
        monthlyVehicleFixed += vehicle.tire_cost || 0;
      } else if (vehicle.tire_type === "per_quarter") {
        monthlyVehicleFixed += (vehicle.tire_cost || 0) / 3;
      } else if (vehicle.tire_type === "per_year") {
        monthlyVehicleFixed += (vehicle.tire_cost || 0) / 12;
      }
    }
    
    const monthlyKm = (route.total_distance_km || 0) * visitsPerMonth;
    const monthlyVehicleVariable = variableCostPerKm * monthlyKm;

    // Fixed overhead
    const totalFixedOverhead = (cs.office_costs_per_month || 0) + (cs.admin_salary_per_month || 0) + (cs.other_fixed_costs_per_month || 0);

    // Total costs (zonder personeel)
    const totalMonthlyCosts = monthlyVehicleVariable + monthlyVehicleFixed + totalFixedOverhead;
    const profit = monthlyRevenue - totalMonthlyCosts;
    const margin = monthlyRevenue > 0 ? (profit / monthlyRevenue) * 100 : 0;

    // Break-even
    const breakEvenPerMinute = totalRouteMin > 0 ? totalMonthlyCosts / (totalRouteMin * visitsPerMonth) : 0;
    const currentPricePerMinute = totalRouteMin > 0 ? monthlyRevenue / (totalRouteMin * visitsPerMonth) : 0;

    return {
      routeTasks,
      taskObjects,
      vehicle,
      totalServiceMin,
      travelMin,
      totalRouteMin,
      totalRouteHours,
      revenuePerVisit,
      monthlyRevenue,
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
  }, [route, allTasks, objects, vehicles, costSettings]);

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
            <MapPin className="w-3 h-3" /> {analysis.routeTasks.length} taken
          </span>
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <Clock className="w-3 h-3" /> {analysis.totalRouteMin} min/bezoek
          </span>
          <span className="text-xs text-slate-500">
            {route.time_window_start} - {route.time_window_end} · {(route.weekdays || []).length}x/week
            {analysis.vehicle && ` · ${analysis.vehicle.license_plate}`}
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