import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Zap, CheckCircle, AlertTriangle, Info, ChevronDown, ChevronRight, Save, Clock, MapPin, Car, X, Bug, Activity } from "lucide-react";

const WEEKDAY_LABELS = { 1:"Maandag",2:"Dinsdag",3:"Woensdag",4:"Donderdag",5:"Vrijdag",6:"Zaterdag",7:"Zondag" };

function Metric({ label, value, tone = "slate" }) {
  const tones = {
    slate: "text-slate-900",
    blue: "text-blue-700",
    green: "text-green-700",
    amber: "text-amber-600",
  };
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-3 text-center">
      <p className={`text-xl font-bold ${tones[tone]}`}>{value}</p>
      <p className="text-[11px] text-slate-500">{label}</p>
    </div>
  );
}

const ALL_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

export default function FleetOptimizerPanel({ onRoutesCreated, onClose }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [expandedRoute, setExpandedRoute] = useState(null);
  const [showDebug, setShowDebug] = useState(false);
  const [planningDays, setPlanningDays] = useState(ALL_WEEKDAYS);
  const [selectedDay, setSelectedDay] = useState("1");

  const runOptimizer = async (days = ALL_WEEKDAYS) => {
    setPlanningDays(days);
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await base44.functions.invoke('googleRouteOptimization', {
        weekdays: days,
        save_routes: false,
      });
      setResult(res.data);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Optimalisatie mislukt');
      if (e?.response?.data?.result) setResult(e.response.data.result);
    } finally {
      setLoading(false);
    }
  };

  const saveRoutes = async () => {
    setSaving(true);
    setError(null);
    try {
      await base44.functions.invoke('googleRouteOptimization', {
        weekdays: planningDays,
        save_routes: true,
      });
      onRoutesCreated?.();
      onClose?.();
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Opslaan mislukt');
      if (e?.response?.data?.result) setResult(e.response.data.result);
    } finally {
      setSaving(false);
    }
  };

  const totals = result?.totals || {};

  return (
    <Card className="border-blue-200 bg-blue-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base flex items-center gap-2 text-blue-900">
            <Zap className="w-5 h-5 text-blue-600" />
            Google Route Optimization — {planningDays.length === 1 ? WEEKDAY_LABELS[planningDays[0]] : 'Alle dagen'}
          </CardTitle>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-xs text-blue-700">
          Google Route Optimization plant de taken direct op basis van tijdvensters, locaties en beschikbare voertuigen.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => runOptimizer(ALL_WEEKDAYS)} disabled={loading} className="bg-blue-700 hover:bg-blue-800 text-white">
            <Zap className="w-4 h-4 mr-1.5" />
            {loading ? 'Google planning maken...' : 'Alle dagen plannen met Google'}
          </Button>
          <div className="flex items-center gap-2">
            <Select value={selectedDay} onValueChange={setSelectedDay} disabled={loading}>
              <SelectTrigger className="w-40 bg-white border-blue-200">
                <SelectValue placeholder="Kies dag" />
              </SelectTrigger>
              <SelectContent>
                {ALL_WEEKDAYS.map(day => (
                  <SelectItem key={day} value={String(day)}>{WEEKDAY_LABELS[day]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => runOptimizer([Number(selectedDay)])} disabled={loading} variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-50">
              <Zap className="w-4 h-4 mr-1.5" />
              Gekozen dag plannen
            </Button>
          </div>

          {result?.routes?.length > 0 && (
            <Button onClick={saveRoutes} disabled={saving || result.has_estimated_travel} variant="outline" className="border-green-300 text-green-700 hover:bg-green-50">
              <Save className="w-4 h-4 mr-1.5" />
              {saving ? 'Opslaan...' : `${result.routes.length} route(s) opslaan`}
            </Button>
          )}
          {result?.debug_report && (
            <Button variant="outline" onClick={() => setShowDebug(!showDebug)}>
              <Bug className="w-4 h-4 mr-1.5" /> Debugrapport
            </Button>
          )}
        </div>

        {loading && (
          <div className="flex items-center gap-3 p-4 bg-white rounded-xl border border-blue-100">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-blue-700 rounded-full animate-spin flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-slate-800">Planning wordt automatisch berekend...</p>
              <p className="text-xs text-slate-500">Taakvensters, natuurlijke horizons, reistijden, voertuigbezetting en volgorde worden doorgerekend.</p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {result && !loading && (
          <div className="space-y-4">
            {result.manual_routes_used && (
              <div className="bg-white border border-green-100 rounded-xl p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-green-900">
                  <CheckCircle className="w-4 h-4" /> Handmatige routes als primaire capaciteit gebruikt
                </div>
                <p className="text-xs text-green-700 mt-1">De optimizer heeft bestaande routes eerst gevuld. Nieuwe routes worden alleen als scenario voorgesteld.</p>
              </div>
            )}

            {result.horizons?.length > 0 && (
              <div className="bg-white border border-blue-100 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-blue-900">
                  <Clock className="w-4 h-4" /> {result.manual_routes_used ? 'Gebruikte handmatige routevensters' : 'Automatisch bepaalde horizon'}
                </div>
                {result.horizons.map((horizon) => (
                  <div key={horizon.id} className="rounded-lg bg-blue-50/60 border border-blue-100 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-blue-700 text-white">{horizon.start_time} – {horizon.end_time}</Badge>
                      <Badge variant="outline">{horizon.label}</Badge>
                      <span className="text-xs text-slate-500">{horizon.task_count} relevante taken</span>
                    </div>
                    <p className="text-xs text-slate-600 mt-2">{horizon.explanation}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Metric label="Relevante taken" value={result.total_tasks_input || 0} />
              <Metric label="Ingepland" value={result.total_tasks_planned || 0} tone="green" />
              <Metric label="Niet ingepland" value={result.total_tasks_skipped || 0} tone="amber" />
              <Metric label="Niet relevant" value={result.total_tasks_not_relevant || 0} />
              <Metric label="Voertuigen" value={result.vehicle_count || 0} tone="blue" />
              <Metric label="Routes" value={result.routes?.length || 0} tone="blue" />
              <Metric label="Max. tegelijk" value={result.max_concurrent_routes || 0} />
              <Metric label="Kosten" value={`€${Number(totals.total_cost || 0).toFixed(2)}`} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Metric label="Reistijd" value={`${totals.total_travel_minutes || 0} min`} />
              <Metric label="Taaktijd" value={`${totals.total_service_minutes || 0} min`} />
              <Metric label="Wachttijd" value={`${totals.total_wait_minutes || 0} min`} />
              <Metric label="Afstand" value={`${totals.total_distance_km || 0} km`} />
            </div>

            {result.has_estimated_travel && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                Reistijden zijn deels geschat. Definitief opslaan is geblokkeerd totdat adressen/Google Maps-resultaten kloppen.
              </div>
            )}

            {result.routes?.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Gegenereerde routes</p>
                {result.routes.map((route, ri) => (
                  <div key={route.id || ri} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <button className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 transition-colors text-left" onClick={() => setExpandedRoute(expandedRoute === ri ? null : ri)}>
                      {expandedRoute === ri ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-slate-900">Route {ri + 1}</span>
                          <Badge variant="outline" className="text-xs"><Car className="w-3 h-3 mr-1" />{route.vehicle?.license_plate || route.vehicle?.name || 'Voertuig'}</Badge>
                          <Badge variant="secondary" className="text-xs"><Clock className="w-3 h-3 mr-1" />{route.time_window_start} – {route.time_window_end}</Badge>
                          <Badge className={route.validation?.valid ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>{route.validation?.valid ? 'Geldig' : 'Ongeldig'}</Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                          <span><MapPin className="w-3 h-3 inline mr-0.5" />{route.stats.total_tasks} taken</span>
                          <span>{route.stats.total_travel_minutes} min reistijd</span>
                          <span>{route.stats.total_wait_minutes} min wachttijd</span>
                          <span>{route.stats.total_distance_km} km</span>
                          <span>€{Number(route.route_cost || 0).toFixed(2)}</span>
                        </div>
                      </div>
                    </button>

                    {expandedRoute === ri && (
                      <div className="border-t border-slate-100">
                        {route.validation?.errors?.length > 0 && (
                          <div className="p-3 bg-red-50 text-xs text-red-700 border-b border-red-100">
                            {route.validation.errors.map((err, i) => <p key={i}>• {err}</p>)}
                          </div>
                        )}
                        <div className="divide-y divide-slate-50">
                          {route.tasks.map((task, ti) => (
                            <div key={ti} className="grid grid-cols-12 gap-2 px-4 py-2.5 text-sm items-center">
                              <span className="col-span-1 text-xs font-bold text-slate-400">{ti + 1}</span>
                              <div className="col-span-5 min-w-0">
                                <p className="font-medium text-slate-800 truncate">{task.name}</p>
                                <p className="text-xs text-slate-500 truncate">{task.address}</p>
                              </div>
                              <div className="col-span-3 text-xs text-slate-500">
                                <p>Aankomst {task.arrival_time}</p>
                                <p>Start {task.actual_start_time} · Vertrek {task.departure_time}</p>
                              </div>
                              <div className="col-span-3 text-xs text-slate-500 text-right">
                                <p>Venster {task.time_window_start}–{task.time_window_end}</p>
                                <p>{task.travel_time_minutes} min · {task.distance_km} km · wacht {task.waiting_time} min</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {result.scenarios && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Scenario’s</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Object.entries(result.scenarios).map(([key, scenario]) => (
                    <div key={key} className="bg-white border border-slate-200 rounded-xl p-3">
                      <p className="text-sm font-semibold text-slate-900">{scenario.label}</p>
                      {scenario.description && <p className="text-xs text-slate-500 mt-1">{scenario.description}</p>}
                      {typeof scenario.unassigned_count === 'number' && <p className="text-xs text-amber-700 mt-1">Niet ingepland: {scenario.unassigned_count}</p>}
                      {scenario.suggestions?.length > 0 ? (
                        <div className="mt-2 space-y-1">
                          {scenario.suggestions.slice(0, 3).map((suggestion, i) => (
                            <div key={i} className="text-xs text-slate-600 bg-slate-50 rounded-lg p-2">
                              {suggestion.description || suggestion.reason || suggestion.warning}
                              {suggestion.extra_cost !== undefined && <span className="block text-slate-500">Extra kosten: €{Number(suggestion.extra_cost).toFixed(2)}</span>}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 mt-2">Geen voorstel nodig.</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.advice?.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Adviezen</p>
                {result.advice.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-900">{a.message}</p>
                      <p className="text-xs text-amber-700 mt-0.5">{a.action}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {result.skipped_tasks?.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Niet ingeplande taken ({result.skipped_tasks.length})</p>
                <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                  {result.skipped_tasks.map((task, i) => (
                    <div key={i} className="flex items-start gap-3 px-4 py-3">
                      <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800">{task.name}</p>
                        <p className="text-xs text-slate-500">{task.time_window_start} – {task.time_window_end} · {task.duration_minutes} min</p>
                        <p className="text-xs text-amber-700 mt-0.5"><strong>Uitleg:</strong> {task.skip_reason}</p>
                        {task.advice && <p className="text-xs text-slate-500 mt-0.5"><strong>Advies:</strong> {task.advice}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {showDebug && result.debug_report && (
              <div className="bg-slate-950 text-slate-100 rounded-xl p-4 overflow-auto max-h-[520px] text-xs">
                <div className="flex items-center gap-2 mb-3 font-semibold"><Activity className="w-4 h-4" /> Debugrapport</div>
                <pre className="whitespace-pre-wrap">{JSON.stringify(result.debug_report, null, 2)}</pre>
              </div>
            )}

            {result.total_tasks_skipped === 0 && result.total_tasks_planned > 0 && (
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                Alle {result.total_tasks_planned} relevante taken zijn succesvol ingepland.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}