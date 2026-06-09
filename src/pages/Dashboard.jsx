import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import StatCard from "../components/ui-custom/StatCard";
import RouteAnalysisCard from "../components/routes/RouteAnalysisCard";
import EmptyState from "../components/ui-custom/EmptyState";
import PageHeader from "../components/ui-custom/PageHeader";
import { Link } from "react-router-dom";
import { createPageUrl } from "../utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertTriangle, ArrowRight, CheckCircle2, Clock3, Euro,
  LayoutDashboard, MapPin, Plus, RadioTower, Route, ShieldCheck, Users
} from "lucide-react";

export default function Dashboard() {
  const { data: objects = [] } = useQuery({ queryKey: ["objects"], queryFn: () => base44.entities.SurveillanceObject.list() });
  const { data: personnel = [] } = useQuery({ queryKey: ["personnel"], queryFn: () => base44.entities.Personnel.list() });
  const { data: routes = [] } = useQuery({ queryKey: ["routes"], queryFn: () => base44.entities.Route.list() });
  const { data: costSettings = [] } = useQuery({ queryKey: ["costSettings"], queryFn: () => base44.entities.CostSettings.list() });
  const { data: executions = [] } = useQuery({ queryKey: ["route-executions"], queryFn: () => base44.entities.RouteExecution.list("-generated_at") });
  const { data: taskExecutions = [] } = useQuery({ queryKey: ["task-executions"], queryFn: () => base44.entities.TaskExecution.list() });
  const { data: auditLogs = [] } = useQuery({ queryKey: ["mobile-audit-log"], queryFn: () => base44.entities.MobileAuditLog.list("-created_at") });

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
  const activeExecutions = executions.filter(item => ["downloaded", "active", "paused"].includes(item.status)).slice(0, 4);
  const completedExecutions = executions.filter(item => item.status === "completed").length;
  const failedLogs = auditLogs.filter(log => {
    const value = `${log.status || ""} ${log.level || ""} ${log.type || ""}`.toLowerCase();
    return value.includes("fail") || value.includes("error") || value.includes("critical");
  });
  const openTaskCount = taskExecutions.filter(task => !["completed", "skipped", "cancelled"].includes(task.status)).length;

  const taskProgressFor = (routeId) => {
    const routeTasks = taskExecutions.filter(task => task.route_execution_id === routeId);
    const done = routeTasks.filter(task => ["completed", "skipped"].includes(task.status)).length;
    const total = routeTasks.length || 0;
    return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
  };

  const attentionItems = [
    failedLogs.length > 0 && {
      label: "Mobiele sync controleren",
      detail: `${failedLogs.length} logregel(s) met foutstatus`,
      icon: RadioTower,
      tone: "text-red-600 bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900 dark:text-red-300",
    },
    openTaskCount > 0 && {
      label: "Open taken in uitvoering",
      detail: `${openTaskCount} taak/taken staan nog open`,
      icon: Clock3,
      tone: "text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-300",
    },
    routes.length === 0 && {
      label: "Geen routeblauwdrukken",
      detail: "Maak een route aan voordat de uitvoering kan draaien",
      icon: AlertTriangle,
      tone: "text-muted-foreground bg-secondary border-border",
    },
  ].filter(Boolean);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Operationeel overzicht"
        subtitle="Live status, aandachtspunten en routekwaliteit voor de mobiele surveillance."
        actions={
          <Link to={createPageUrl("Routes")}>
            <Button>
              <Plus className="w-4 h-4 mr-1" /> Nieuwe route
            </Button>
          </Link>
        }
      />

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card className="border border-border bg-card shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">Live diensten</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Actieve of klaargezette route-uitvoeringen.</p>
              </div>
              <Badge variant="outline" className="gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {activeExecutions.length} live
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {activeExecutions.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {activeExecutions.map(route => {
                  const progress = taskProgressFor(route.id);
                  return (
                    <Link key={route.id} to={`/RouteExecutionDetails?id=${route.id}`} className="rounded-lg border border-border bg-background/60 p-4 transition-colors hover:bg-accent/60">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">{route.route_name || "Onbekende dienst"}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{route.employee_name || "Geen medewerker"} · {route.vehicle_license_plate || "Geen voertuig"}</p>
                        </div>
                        <Badge>{route.status}</Badge>
                      </div>
                      <div className="mt-4">
                        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                          <span>Taken afgerond</span>
                          <span>{progress.done}/{progress.total}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-secondary">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${progress.pct}%` }} />
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-background/50 p-6 text-sm text-muted-foreground">
                Geen actieve mobiele diensten. Start vanuit de uitvoeringkalender zodra de planning klaarstaat.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border border-border bg-card shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Aandacht</CardTitle>
            <p className="text-sm text-muted-foreground">Wat de centralist als eerste moet zien.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {attentionItems.length > 0 ? attentionItems.map(({ label, detail, icon: Icon, tone }) => (
              <div key={label} className={`flex items-start gap-3 rounded-lg border p-3 ${tone}`}>
                <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">{label}</p>
                  <p className="mt-0.5 text-xs opacity-80">{detail}</p>
                </div>
              </div>
            )) : (
              <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">Geen directe aandachtspunten</p>
                  <p className="mt-0.5 text-xs opacity-80">Routes, taken en sync ogen rustig.</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Objecten" value={objects.length} icon={MapPin} />
        <StatCard title="Medewerkers" value={personnel.filter(p => p.is_active !== false).length} icon={Users} />
        <StatCard title="Routeblauwdrukken" value={routes.length} icon={Route} />
        <StatCard title="Diensten afgerond" value={completedExecutions} icon={ShieldCheck} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard title="Maandwinst" value={`€${totalProfit.toFixed(0)}`} icon={Euro}
          trend={totalRevenue > 0 ? Number(((totalProfit / totalRevenue) * 100).toFixed(1)) : 0}
          trendLabel="marge"
        />
        <StatCard title="Open mobiele taken" value={openTaskCount} icon={Clock3} />
      </div>

      {routes.length > 0 && cs && (
        <Card className="border border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Omzet vs. Kosten per route</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={routeData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `€${v}`} />
                  <Tooltip formatter={(v) => `€${Number(v).toFixed(0)}`} contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }} />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} name="Omzet" />
                  <Bar dataKey="costs" fill="hsl(var(--muted-foreground))" radius={[6, 6, 0, 0]} name="Kosten" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {routes.length > 0 && cs ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Route-analyses</h2>
            <Link to={createPageUrl("Routes")}>
              <Button variant="ghost" size="sm" className="text-muted-foreground">
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
          title="Welkom bij LOQ"
          description="Begin met objecten, medewerkers en kosteninstellingen om het control center te vullen."
          actionLabel="Objecten toevoegen"
          onAction={() => window.location.href = createPageUrl("Objects")}
        />
      )}
    </div>
  );
}
