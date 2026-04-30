import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Zap, CheckCircle, AlertTriangle, Info, ChevronDown, ChevronRight, Save, RotateCcw, Clock, MapPin, Car, X } from "lucide-react";

const WEEKDAY_LABELS = { 1:"Maandag",2:"Dinsdag",3:"Woensdag",4:"Donderdag",5:"Vrijdag",6:"Zaterdag",7:"Zondag" };

export default function FleetOptimizerPanel({ activeDay, onRoutesCreated, onClose }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [expandedRoute, setExpandedRoute] = useState(null);

  const runOptimizer = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await base44.functions.invoke('globalFleetOptimizer', {
        weekday: activeDay,
        save_routes: false,
      });
      setResult(res.data);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Optimalisatie mislukt');
    } finally {
      setLoading(false);
    }
  };

  const saveRoutes = async () => {
    setSaving(true);
    try {
      await base44.functions.invoke('globalFleetOptimizer', {
        weekday: activeDay,
        save_routes: true,
      });
      onRoutesCreated?.();
      onClose?.();
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-blue-200 bg-blue-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2 text-blue-900">
            <Zap className="w-5 h-5 text-blue-600" />
            Automatische Vlootoptimalisatie — {WEEKDAY_LABELS[activeDay]}
          </CardTitle>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-xs text-blue-700">
          De optimizer bepaalt zelf hoeveel routes nodig zijn, welke taken daarin komen en in welke volgorde.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Acties */}
        <div className="flex gap-2">
          <Button onClick={runOptimizer} disabled={loading} className="bg-blue-700 hover:bg-blue-800 text-white">
            <Zap className="w-4 h-4 mr-1.5" />
            {loading ? 'Optimaliseren...' : 'Optimaliseer planning'}
          </Button>
          {result?.routes?.length > 0 && (
            <Button onClick={saveRoutes} disabled={saving} variant="outline" className="border-green-300 text-green-700 hover:bg-green-50">
              <Save className="w-4 h-4 mr-1.5" />
              {saving ? 'Opslaan...' : `${result.routes.length} route(s) opslaan`}
            </Button>
          )}
        </div>

        {/* Laden */}
        {loading && (
          <div className="flex items-center gap-3 p-4 bg-white rounded-xl border border-blue-100">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-blue-700 rounded-full animate-spin flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-slate-800">Optimalisatie bezig...</p>
              <p className="text-xs text-slate-500">Taken worden geclusterd, reistijden opgehaald via Google Maps en routes berekend.</p>
            </div>
          </div>
        )}

        {/* Fout */}
        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {/* Resultaat */}
        {result && !loading && (
          <div className="space-y-4">
            {/* Samenvatting */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-lg border border-slate-200 p-3 text-center">
                <p className="text-2xl font-bold text-slate-900">{result.total_tasks_planned}</p>
                <p className="text-xs text-slate-500">Ingepland</p>
              </div>
              <div className="bg-white rounded-lg border border-slate-200 p-3 text-center">
                <p className="text-2xl font-bold text-amber-600">{result.total_tasks_skipped}</p>
                <p className="text-xs text-slate-500">Niet ingepland</p>
              </div>
              <div className="bg-white rounded-lg border border-slate-200 p-3 text-center">
                <p className="text-2xl font-bold text-blue-700">{result.routes?.length || 0}</p>
                <p className="text-xs text-slate-500">Routes</p>
              </div>
            </div>

            {/* Gegenereerde routes */}
            {result.routes?.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Gegenereerde routes</p>
                {result.routes.map((route, ri) => (
                  <div key={ri} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <button
                      className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 transition-colors text-left"
                      onClick={() => setExpandedRoute(expandedRoute === ri ? null : ri)}
                    >
                      {expandedRoute === ri ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-slate-900">Route {ri + 1}</span>
                          {route.vehicle && (
                            <Badge variant="outline" className="text-xs">
                              <Car className="w-3 h-3 mr-1" />{route.vehicle.license_plate}
                            </Badge>
                          )}
                          <Badge variant="secondary" className="text-xs">
                            <Clock className="w-3 h-3 mr-1" />{route.time_window_start} – {route.time_window_end}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                          <span><MapPin className="w-3 h-3 inline mr-0.5" />{route.stats.total_tasks} taken</span>
                          <span>{route.stats.total_travel_minutes} min reistijd</span>
                          <span>{route.stats.total_distance_km} km</span>
                          {route.stats.has_estimated_travel && <span className="text-amber-600">~geschat</span>}
                        </div>
                      </div>
                      <Badge className="bg-green-100 text-green-700 flex-shrink-0">{route.stats.total_tasks} taken</Badge>
                    </button>

                    {expandedRoute === ri && (
                      <div className="border-t border-slate-100 divide-y divide-slate-50">
                        {route.tasks.map((task, ti) => (
                          <div key={ti} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                            <span className="text-xs font-bold text-slate-400 w-5 flex-shrink-0">{ti + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-slate-800 truncate">{task.name}</p>
                              <p className="text-xs text-slate-500 truncate">{task.address}</p>
                            </div>
                            <div className="text-right text-xs text-slate-500 flex-shrink-0">
                              <p>{task.actual_start_time} – {task.departure_time}</p>
                              {task.travel_time_minutes > 0 && <p className="text-slate-400">{task.travel_time_minutes} min rijden</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Adviezen */}
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

            {/* Niet ingeplande taken */}
            {result.skipped_tasks?.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Niet ingeplande taken ({result.skipped_tasks.length})
                </p>
                <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                  {result.skipped_tasks.map((task, i) => (
                    <div key={i} className="flex items-start gap-3 px-4 py-3">
                      <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800">{task.name}</p>
                        <p className="text-xs text-slate-500">{task.time_window_start} – {task.time_window_end} · {task.duration_minutes} min</p>
                        <p className="text-xs text-amber-700 mt-0.5">{task.skip_reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Alles ingepland */}
            {result.total_tasks_skipped === 0 && result.total_tasks_planned > 0 && (
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                Alle {result.total_tasks_planned} taken zijn succesvol ingepland!
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}