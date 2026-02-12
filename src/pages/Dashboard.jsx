import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import StatCard from "../components/ui-custom/StatCard";
import RouteAnalysisCard from "../components/routes/RouteAnalysisCard";
import EmptyState from "../components/ui-custom/EmptyState";
import PageHeader from "../components/ui-custom/PageHeader";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/pages/utils";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LayoutDashboard, MapPin, Users, Route, Euro, Plus, ArrowRight } from "lucide-react";

export default function Dashboard() {
  const { data: objects = [] } = useQuery({ queryKey: ["objects"], queryFn: () => base44.entities.SurveillanceObject.list() });
  const { data: personnel = [] } = useQuery({ queryKey: ["personnel"], queryFn: () => base44.entities.Personnel.list() });
  const { data: routes = [] } = useQuery({ queryKey: ["routes"], queryFn: () => base44.entities.Route.list() });
  const { data: costSettings = [] } = useQuery({ queryKey: ["costSettings"], queryFn: () => base44.entities.CostSettings.list() });

  const cs = costSettings[0];

  // Calculate totals
  const calcRouteProfit = (route) => {
    if (!cs) return { revenue: 0, costs: 0, profit: 0 };
    const routeObjects = objects.filter(o => (route.object_ids || []).includes(o.id));
    const person = personnel.find(p => p.id === route.personnel_id);
    const totalServiceMin = routeObjects.reduce((s, o) => s + (o.service_duration_minutes || 0), 0);
    const travelMin = routeObjects.length > 1 ? routeObjects.length * (route.avg_travel_minutes || 0) : 0;
    const totalHours = (totalServiceMin + travelMin) / 60;
    const revenuePerVisit = routeObjects.reduce((s, o) => s + (o.price_per_visit || 0), 0);
    const visits = route.visits_per_month || 22;
    const revenue = revenuePerVisit * visits;

    let surchargePct = 0;
    if (route.shift_type === "avond") surchargePct = person?.evening_surcharge_pct || 30;
    else if (route.shift_type === "nacht") surchargePct = person?.night_surcharge_pct || 50;
    else if (route.shift_type === "weekend") surchargePct = person?.weekend_surcharge_pct || 50;
    const baseRate = person?.base_hourly_rate || 14;
    const effectiveRate = baseRate * (1 + surchargePct / 100) * (1 + (person?.vacation_allowance_pct || 8) / 100) * (1 + (person?.employer_costs_pct || 32) / 100);
    const personnelCost = effectiveRate * totalHours * visits;

    const depPerMonth = ((cs.vehicle_purchase_price || 0) - (cs.vehicle_residual_value || 0)) / ((cs.vehicle_depreciation_years || 5) * 12);
    const varKm = (cs.fuel_cost_per_km || 0) + (cs.maintenance_cost_per_km || 0) + (cs.tire_cost_per_km || 0);
    const vehicleCost = depPerMonth + (cs.insurance_per_month || 0) + varKm * (route.total_distance_km || 0) * visits;
    const overhead = (cs.office_costs_per_month || 0) + (cs.admin_salary_per_month || 0) + (cs.other_fixed_costs_per_month || 0);
    const costs = personnelCost + vehicleCost + overhead;

    return { revenue, costs, profit: revenue - costs };
  };

  const routeData = routes.map(r => {
    const d = calcRouteProfit(r);
    return { name: r.name, ...d };
  });

  const totalRevenue = routeData.reduce((s, r) => s + r.revenue, 0);
  const totalCosts = routeData.reduce((s, r) => s + r.costs, 0);
  const totalProfit = totalRevenue - totalCosts;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        subtitle="Overzicht van uw surveillancediensten"
        actions={
          <Link to={createPageUrl("Routes")}>
            <Button className="bg-slate-900 hover:bg-slate-800">
              <Plus className="w-4 h-4 mr-1" /> Nieuwe route
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Objecten" value={objects.length} icon={MapPin} />
        <StatCard title="Medewerkers" value={personnel.filter(p => p.is_active !== false).length} icon={Users} />
        <StatCard title="Routes" value={routes.length} icon={Route} />
        <StatCard title="Maandwinst" value={`€${totalProfit.toFixed(0)}`} icon={Euro}
          trend={totalRevenue > 0 ? Number(((totalProfit / totalRevenue) * 100).toFixed(1)) : 0}
          trendLabel="marge"
        />
      </div>

      {routes.length > 0 && cs && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Omzet vs. Kosten per route</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={routeData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" tickFormatter={(v) => `€${v}`} />
                  <Tooltip formatter={(v) => `€${Number(v).toFixed(0)}`} contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }} />
                  <Bar dataKey="revenue" fill="#1e293b" radius={[6, 6, 0, 0]} name="Omzet" />
                  <Bar dataKey="costs" fill="#f59e0b" radius={[6, 6, 0, 0]} name="Kosten" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {routes.length > 0 && cs ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Route-analyses</h2>
            <Link to={createPageUrl("Routes")}>
              <Button variant="ghost" size="sm" className="text-slate-500">
                Alle routes <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {routes.map(route => (
              <RouteAnalysisCard key={route.id} route={route} objects={objects} personnel={personnel} costSettings={cs} />
            ))}
          </div>
        </div>
      ) : (
        <EmptyState
          icon={LayoutDashboard}
          title="Welkom bij Route Calculator"
          description="Begin met het toevoegen van objecten, medewerkers en kosteninstelling om routes te analyseren."
          actionLabel="Objecten toevoegen"
          onAction={() => window.location.href = createPageUrl("Objects")}
        />
      )}
    </div>
  );
}