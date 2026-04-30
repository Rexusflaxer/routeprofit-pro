import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Zap, AlertTriangle, CheckCircle, Car, ClipboardList, BarChart2, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import PlanningTaskManager from "@/components/planning/PlanningTaskManager";
import PlanningResultView from "@/components/planning/PlanningResultView";
import UnassignedTasksView from "@/components/planning/UnassignedTasksView";
import VehicleAvailabilityManager from "@/components/planning/VehicleAvailabilityManager";

function getTodayDate() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().split("T")[0];
}

export default function FleetPlanning() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [planningDate, setPlanningDate] = useState(getTodayDate());
  const [horizonStart, setHorizonStart] = useState("17:30");
  const [horizonEnd, setHorizonEnd] = useState("08:30");
  const [result, setResult] = useState(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [error, setError] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  const { data: tasks = [] } = useQuery({ queryKey: ["planning-tasks"], queryFn: () => base44.entities.PlanningTask.list() });
  const { data: vehicles = [] } = useQuery({ queryKey: ["vehicles"], queryFn: () => base44.entities.Vehicle.list() });
  const { data: planningRuns = [] } = useQuery({ queryKey: ["planning-runs"], queryFn: () => base44.entities.PlanningRun.list("-created_date", 10) });

  const activeVehicles = vehicles.filter(v => v.is_active !== false);
  const activeTasks = tasks.filter(t => t.is_active !== false);

  // Weekday of selected date
  const selectedWeekday = (() => {
    const d = new Date(planningDate + "T12:00:00");
    const js = d.getDay();
    return js === 0 ? 7 : js;
  })();
  const weekdayNames = ["", "Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];

  const tasksForDay = activeTasks.filter(t => !t.weekdays || t.weekdays.length === 0 || t.weekdays.includes(selectedWeekday));

  const runOptimizer = async () => {
    setIsOptimizing(true);
    setError(null);
    try {
      const { data } = await base44.functions.invoke("fleetOptimizer", {
        planning_date: planningDate,
        horizon_start: horizonStart,
        horizon_end: horizonEnd,
        settings: { cost_per_km: 0.35, cost_per_minute: 0.10, fixed_cost_per_route: 50 },
      });
      if (data?.error) throw new Error(data.error);
      setResult(data);
      setActiveTab("result");
    } catch (e) {
      setError(e.message || "Optimalisatie mislukt");
    } finally {
      setIsOptimizing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Automatische Surveillanceplanning</h1>
          <p className="text-slate-500 text-sm mt-1">Fleet optimizer — routes worden automatisch gegenereerd</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-xl">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="tasks">Taken</TabsTrigger>
          <TabsTrigger value="vehicles">Voertuigen</TabsTrigger>
          <TabsTrigger value="result">Resultaat</TabsTrigger>
        </TabsList>

        {/* ---- Dashboard tab ---- */}
        <TabsContent value="dashboard" className="space-y-6 mt-6">
          {/* Planning config */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Planningsinstellingen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label>Planningsdatum</Label>
                  <Input type="date" value={planningDate} onChange={e => setPlanningDate(e.target.value)} />
                  {planningDate && <p className="text-xs text-slate-500">Weekdag: {weekdayNames[selectedWeekday]}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Horizon start</Label>
                  <Input type="time" value={horizonStart} onChange={e => setHorizonStart(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Horizon einde</Label>
                  <Input type="time" value={horizonEnd} onChange={e => setHorizonEnd(e.target.value)} />
                  {horizonEnd <= horizonStart && <p className="text-xs text-blue-600">⏱ Eindigt volgende dag</p>}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-5 pb-4">
                <p className="text-xs text-slate-500 uppercase tracking-wider">Taken voor deze dag</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">{tasksForDay.length}</p>
                <p className="text-xs text-slate-400 mt-1">van {activeTasks.length} actief</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <p className="text-xs text-slate-500 uppercase tracking-wider">Actieve voertuigen</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">{activeVehicles.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <p className="text-xs text-slate-500 uppercase tracking-wider">Verplichte taken</p>
                <p className="text-3xl font-bold text-red-600 mt-1">
                  {tasksForDay.filter(t => t.priority === "contractueel_verplicht").length}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <p className="text-xs text-slate-500 uppercase tracking-wider">Eerdere planningen</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">{planningRuns.length}</p>
              </CardContent>
            </Card>
          </div>

          {/* Warnings */}
          {tasksForDay.filter(t => !t.object_id && !t.collectief_id && (!t.selected_object_ids || t.selected_object_ids.length === 0)).length > 0 && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Let op: taken zonder gekoppeld object</p>
                <p className="text-xs text-amber-600 mt-0.5">
                  {tasksForDay.filter(t => !t.object_id && !t.collectief_id && (!t.selected_object_ids || t.selected_object_ids.length === 0)).length} taken hebben geen locatie en kunnen niet worden ingepland.
                </p>
              </div>
            </div>
          )}

          {activeVehicles.length === 0 && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">Geen actieve voertuigen gevonden. Voeg voertuigen toe via het tabblad Voertuigen.</p>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Optimize button */}
          <Button
            onClick={runOptimizer}
            disabled={isOptimizing || activeVehicles.length === 0 || tasksForDay.length === 0}
            className="w-full sm:w-auto bg-slate-900 hover:bg-slate-800 gap-2 h-11 px-8 text-base"
          >
            {isOptimizing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
            {isOptimizing ? "Optimaliseren..." : "Automatisch optimaliseren"}
          </Button>

          {/* Recent runs */}
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
                        {(run.tasks_unplanned || 0) > 0 && <Badge variant="outline" className="text-red-700 border-red-200">{run.tasks_unplanned} niet</Badge>}
                        <Badge className={run.status === "vergrendeld" ? "bg-slate-800" : run.status === "goedgekeurd" ? "bg-green-600" : "bg-amber-500"}>{run.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ---- Tasks tab ---- */}
        <TabsContent value="tasks" className="mt-6">
          <PlanningTaskManager />
        </TabsContent>

        {/* ---- Vehicles tab ---- */}
        <TabsContent value="vehicles" className="mt-6">
          <VehicleAvailabilityManager />
        </TabsContent>

        {/* ---- Result tab ---- */}
        <TabsContent value="result" className="mt-6 space-y-6">
          {result ? (
            <>
              <PlanningResultView result={result} />
              <UnassignedTasksView unassigned={result.unassigned_tasks || []} />
            </>
          ) : (
            <div className="text-center py-16 text-slate-400">
              <Zap className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium">Nog geen optimalisatieresultaat</p>
              <p className="text-sm mt-1">Ga naar Dashboard en klik op "Automatisch optimaliseren"</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}