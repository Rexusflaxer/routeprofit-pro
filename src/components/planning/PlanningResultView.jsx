import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Car, Clock, MapPin, ChevronDown, ChevronUp, Euro, Route } from "lucide-react";

function fmt(n) { return (n || 0).toFixed(2); }
function fmtMin(m) {
  const h = Math.floor((m || 0) / 60);
  const min = (m || 0) % 60;
  return h > 0 ? `${h}u ${min}m` : `${min}m`;
}

function RouteCard({ run }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Card className="border-slate-200">
      <CardContent className="p-0">
        <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => setExpanded(!expanded)}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center shrink-0">
              <Car className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <p className="font-semibold text-slate-800 text-sm">{run.vehicle_label}</p>
              <p className="text-xs text-slate-500">{run.planned_start_time} – {run.planned_end_time}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{fmtMin(run.total_travel_minutes)} rijtijd</span>
              <span>{fmt(run.total_distance_km)} km</span>
              <span>{run.total_stops} stops</span>
            </div>
            <Badge variant="outline" className="font-semibold">€{fmt(run.route_cost)}</Badge>
            {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </div>
        </div>

        {expanded && (
          <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-3">
            {/* Route stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                ["Rijtijd", fmtMin(run.total_travel_minutes)],
                ["Taaktijd", fmtMin(run.total_task_minutes)],
                ["Wachttijd", fmtMin(run.total_wait_minutes)],
                ["Afstand", `${fmt(run.total_distance_km)} km`],
              ].map(([label, val]) => (
                <div key={label} className="bg-slate-50 rounded-lg px-3 py-2">
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="font-semibold text-slate-800 text-sm">{val}</p>
                </div>
              ))}
            </div>

            {/* Stops */}
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Taakvolgorde</p>
              {(run.stops || []).map((stop, i) => (
                <div key={i} className="flex items-start gap-3 text-sm py-2 border-b border-slate-100 last:border-0">
                  <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600 shrink-0 mt-0.5">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 truncate">{stop.name}</p>
                    {stop.address && <p className="text-xs text-slate-400 truncate">{stop.address}</p>}
                    <div className="flex gap-3 mt-0.5 text-xs text-slate-500">
                      <span>Aankomst: {stop.arrival_time}</span>
                      <span>Start: {stop.start_time}</span>
                      <span>Vertrek: {stop.departure_time}</span>
                      {stop.wait_minutes > 0 && <span className="text-amber-600">Wachttijd: {stop.wait_minutes}m</span>}
                    </div>
                  </div>
                  <div className="text-xs text-slate-400 shrink-0 text-right">
                    {stop.travel_from_prev > 0 && <p>{stop.travel_from_prev}m rijden</p>}
                    {stop.distance_from_prev > 0 && <p>{fmt(stop.distance_from_prev)} km</p>}
                    <p className="font-medium text-slate-600">{stop.duration_minutes}m duur</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function PlanningResultView({ result }) {
  if (!result) return null;

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          ["Routes", result.total_routes || 0, ""],
          ["Ingepland", result.tasks_planned || 0, "text-green-600"],
          ["Niet ingepland", result.tasks_unplanned || 0, result.tasks_unplanned > 0 ? "text-red-600" : ""],
          ["Totale kosten", `€${fmt(result.total_cost)}`, "text-slate-900"],
        ].map(([label, val, cls]) => (
          <Card key={label}>
            <CardContent className="pt-5 pb-4">
              <p className="text-xs text-slate-500 uppercase tracking-wider">{label}</p>
              <p className={`text-2xl font-bold mt-1 ${cls || "text-slate-900"}`}>{val}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          ["Totale afstand", `${fmt(result.total_distance_km)} km`],
          ["Rijtijd", fmtMin(result.total_travel_minutes)],
          ["Taaktijd", fmtMin(result.total_task_minutes)],
          ["Horizon", `${result.horizon_start} – ${result.horizon_end}`],
        ].map(([label, val]) => (
          <div key={label} className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="font-semibold text-slate-800 text-sm mt-0.5">{val}</p>
          </div>
        ))}
      </div>

      {/* Route cards */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wider">Gegenereerde routes ({result.route_runs?.length || 0})</h3>
        <div className="space-y-3">
          {(result.route_runs || []).map((run, i) => <RouteCard key={run.id || i} run={run} />)}
          {(!result.route_runs || result.route_runs.length === 0) && (
            <p className="text-slate-400 text-sm text-center py-8">Geen routes gegenereerd</p>
          )}
        </div>
      </div>
    </div>
  );
}