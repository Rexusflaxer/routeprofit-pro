import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Zap, AlertTriangle, RefreshCw, Route } from "lucide-react";
import PlanningResultView from "@/components/planning/PlanningResultView";
import UnassignedTasksView from "@/components/planning/UnassignedTasksView";

function getTodayDate() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().split("T")[0];
}

const WEEKDAY_NAMES = ["", "Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
const WEEKDAY_FULL = ["", "Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Zondag"];

export default function FleetPlanning() {
  const [planningDate, setPlanningDate] = useState(getTodayDate());
  const [horizonStart, setHorizonStart] = useState("17:30");
  const [horizonEnd, setHorizonEnd] = useState("08:30");
  const [result, setResult] = useState(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [error, setError] = useState(null);

  // Weekdag van geselecteerde datum
  const selectedWeekday = (() => {
    const d = new Date(planningDate + "T12:00:00");
    const js = d.getDay();
    return js === 0 ? 7 : js;
  })();

  const { data: routes = [] } = useQuery({ queryKey: ["routes"], queryFn: () => base44.entities.Route.list() });
  const { data: tasks = [] } = useQuery({ queryKey: ["all-tasks"], queryFn: () => base44.entities.Task.list() });
  const { data: planningRuns = [] } = useQuery({ queryKey: ["planning-runs"], queryFn: () => base44.entities.PlanningRun.list("-created_date", 10) });

  // Routes actief op geselecteerde dag
  const routesForDay = routes.filter(r => !r.weekdays || r.weekdays.length === 0 || r.weekdays.includes(selectedWeekday));

  // Taken die aan routes zijn toegewezen voor de geselecteerde dag
  const tasksForDay = routesForDay.reduce((acc, route) => {
    const assigned = (route.assigned_tasks || []).filter(at => !at.days || at.days.length === 0 || at.days.includes(selectedWeekday));
    return acc + assigned.length;
  }, 0);

  const runOptimizer = async () => {
    setIsOptimizing(true);
    setError(null);
    setResult(null);
    try {
      const { data } = await base44.functions.invoke("fleetOptimizer", {
        planning_date: planningDate,
        horizon_start: horizonStart,
        horizon_end: horizonEnd,
        settings: { cost_per_km: 0.35, cost_per_minute: 0.10, fixed_cost_per_route: 50 },
      });
      if (data?.error) throw new Error(data.error);
      setResult(data);
    } catch (e) {
      setError(e.message || "Optimalisatie mislukt");
    } finally {
      setIsOptimizing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Automatische Surveillanceplanning</h1>
        <p className="text-slate-500 text-sm mt-1">
          Optimaliseert de volgorde van bestaande routes voor een geselecteerde dag.
        </p>
      </div>

      {/* Instellingen */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Planningsinstellingen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Planningsdatum</Label>
              <Input type="date" value={planningDate} onChange={e => setPlanningDate(e.target.value)} />
              {planningDate && (
                <p className="text-xs text-slate-500">{WEEKDAY_FULL[selectedWeekday]}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Horizon start</Label>
              <Input type="time" value={horizonStart} onChange={e => setHorizonStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Horizon einde</Label>
              <Input type="time" value={horizonEnd} onChange={e => setHorizonEnd(e.target.value)} />
              {horizonEnd <= horizonStart && (
                <p className="text-xs text-blue-600">⏱ Eindigt volgende dag</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Statistieken */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-slate-500 uppercase tracking-wider">Routes op deze dag</p>
            <p className="text-3xl font-bold text-slate-900 mt-1">{routesForDay.length}</p>
            <p className="text-xs text-slate-400 mt-1">van {routes.length} totaal</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-slate-500 uppercase tracking-wider">Taken ingepland</p>
            <p className="text-3xl font-bold text-slate-900 mt-1">{tasksForDay}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-slate-500 uppercase tracking-wider">Eerdere planningen</p>
            <p className="text-3xl font-bold text-slate-900 mt-1">{planningRuns.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Waarschuwingen */}
      {routesForDay.length === 0 && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            Geen routes gevonden voor {WEEKDAY_FULL[selectedWeekday]}. Controleer of routes zijn aangemaakt met de juiste weekdagen.
          </p>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Optimaliseer knop */}
      <Button
        onClick={runOptimizer}
        disabled={isOptimizing || routesForDay.length === 0}
        className="bg-slate-900 hover:bg-slate-800 gap-2 h-11 px-8 text-base"
      >
        {isOptimizing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
        {isOptimizing ? "Optimaliseren..." : "Automatisch optimaliseren"}
      </Button>

      {/* Resultaten */}
      {result && (
        <div className="space-y-6">
          <PlanningResultView result={result} />
          <UnassignedTasksView unassigned={result.unassigned_tasks || []} />
        </div>
      )}

      {/* Recente planningen */}
      {planningRuns.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Recente planningen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {planningRuns.slice(0, 5).map(run => (
                <div key={run.id} className="flex items-center justify-between text-sm py-2 border-b border-slate-100 last:border-0">
                  <div>
                    <span className="font-medium text-slate-800">{run.planning_date}</span>
                    <span className="text-slate-400 ml-2">{run.horizon_start} – {run.horizon_end}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{run.total_routes || 0} routes</Badge>
                    <Badge variant="outline" className="text-green-700 border-green-200">{run.tasks_planned || 0} gepland</Badge>
                    {(run.tasks_unplanned || 0) > 0 && (
                      <Badge variant="outline" className="text-red-700 border-red-200">{run.tasks_unplanned} niet</Badge>
                    )}
                    <Badge className={
                      run.status === "vergrendeld" ? "bg-slate-800" :
                      run.status === "goedgekeurd" ? "bg-green-600" : "bg-amber-500"
                    }>{run.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}