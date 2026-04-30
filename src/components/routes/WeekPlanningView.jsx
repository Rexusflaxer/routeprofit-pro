import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  RefreshCw, ChevronDown, ChevronRight, Clock, MapPin,
  AlertTriangle, CheckCircle, XCircle, Car, Loader2, Info
} from "lucide-react";

const WEEKDAYS = [
  { value: 1, label: "Maandag", short: "Ma" },
  { value: 2, label: "Dinsdag", short: "Di" },
  { value: 3, label: "Woensdag", short: "Wo" },
  { value: 4, label: "Donderdag", short: "Do" },
  { value: 5, label: "Vrijdag", short: "Vr" },
  { value: 6, label: "Zaterdag", short: "Za" },
  { value: 7, label: "Zondag", short: "Zo" },
];

function getTodayWeekday() {
  const d = new Date().getDay();
  return d === 0 ? 7 : d;
}

function getTodayDate() {
  return new Date().toISOString().split("T")[0];
}

// Bepaal datum voor een weekdag (komende of huidige week)
function getDateForWeekday(weekdayNum) {
  const today = new Date();
  const todayJs = today.getDay(); // 0=zo
  const targetJs = weekdayNum === 7 ? 0 : weekdayNum;
  let diff = targetJs - todayJs;
  if (diff < 0) diff += 7;
  const d = new Date(today);
  d.setDate(today.getDate() + diff);
  return d.toISOString().split("T")[0];
}

// Bepaal horizon automatisch op basis van taken voor die dag
function deriveHorizon(tasks, weekday) {
  const dayTasks = tasks.filter(t => t.weekdays?.includes(weekday));
  if (dayTasks.length === 0) return { start: "00:00", end: "23:59" };

  let minStart = 24 * 60;
  let maxEnd = 0;

  dayTasks.forEach(t => {
    if (t.time_window_start) {
      const [h, m] = t.time_window_start.split(":").map(Number);
      minStart = Math.min(minStart, h * 60 + m);
    }
    if (t.time_window_end) {
      const [h, m] = t.time_window_end.split(":").map(Number);
      let end = h * 60 + m;
      if (end === 0) end = 24 * 60; // 00:00 als eindtijd = middernacht
      maxEnd = Math.max(maxEnd, end);
    }
  });

  if (minStart === 24 * 60) minStart = 0;
  if (maxEnd === 0) maxEnd = 24 * 60;

  const fmt = (mins) => {
    const total = mins % (24 * 60);
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  };

  return { start: fmt(minStart), end: fmt(maxEnd % (24 * 60)) };
}

function RouteStopList({ stops }) {
  return (
    <div className="space-y-1.5 mt-3">
      {stops.map((stop, i) => (
        <div
          key={i}
          className={`flex items-start gap-2.5 p-2.5 rounded-lg text-xs border ${
            stop.withinWindow ? "bg-white border-slate-100" : "bg-red-50 border-red-200"
          }`}
        >
          <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
            <span className="text-[10px] font-bold text-slate-700">{i + 1}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-slate-900 truncate">{stop.name}</p>
            <div className="flex flex-wrap gap-2 mt-0.5 text-slate-500">
              <span><Clock className="w-3 h-3 inline mr-0.5" />{stop.startTime}–{stop.departureTime}</span>
              {stop.travelMinutes > 0 && <span>🚗 {stop.travelMinutes}min · {stop.distanceKm}km</span>}
              {stop.waitMinutes > 0 && <span className="text-amber-600">⏳ {stop.waitMinutes}min wacht</span>}
              {!stop.withinWindow && <span className="text-red-600 font-semibold">⚠ Buiten venster</span>}
              {stop.estimated && <span className="text-slate-400 italic">~geschat</span>}
            </div>
          </div>
          <span className="text-slate-400 flex-shrink-0">{stop.durationMinutes}min</span>
        </div>
      ))}
    </div>
  );
}

function RouteCard({ route, index }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
          <Car className="w-3.5 h-3.5 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">{route.vehicleName}</p>
          <p className="text-xs text-slate-500">{route.plannedStartTime} – {route.plannedEndTime}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Badge className="bg-blue-50 text-blue-700 text-xs border-0">{route.taskCount} taken</Badge>
          <Badge className="bg-slate-100 text-slate-600 text-xs border-0">{route.totalDistanceKm} km</Badge>
          {!route.feasible && <Badge className="bg-red-50 text-red-600 text-xs border-0">Conflict</Badge>}
          {route.hasEstimatedTravelTimes && <Badge className="bg-amber-50 text-amber-600 text-xs border-0">~geschat</Badge>}
          {expanded ? <ChevronDown className="w-4 h-4 text-slate-400 ml-1" /> : <ChevronRight className="w-4 h-4 text-slate-400 ml-1" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 px-4 pb-4 bg-slate-50">
          <div className="grid grid-cols-4 gap-2 pt-3">
            {[
              ["Reistijd", `${route.totalTravelMinutes}min`],
              ["Taaktijd", `${route.totalServiceMinutes}min`],
              ["Wachttijd", `${route.totalWaitMinutes}min`],
              ["Est. kosten", `€${route.estimatedCost.toFixed(2)}`],
            ].map(([lbl, val]) => (
              <div key={lbl} className="bg-white rounded-lg p-2 text-center border border-slate-100">
                <p className="text-[10px] text-slate-500">{lbl}</p>
                <p className="text-xs font-bold text-slate-900 mt-0.5">{val}</p>
              </div>
            ))}
          </div>
          <RouteStopList stops={route.stops} />
        </div>
      )}
    </div>
  );
}

function UnassignedList({ tasks }) {
  if (!tasks?.length) return null;
  return (
    <div className="mt-3 space-y-1.5">
      <p className="text-xs font-semibold text-red-700 flex items-center gap-1">
        <XCircle className="w-3.5 h-3.5" /> Niet ingepland ({tasks.length})
      </p>
      {tasks.map((t, i) => (
        <div key={i} className="flex items-start gap-2 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs">
          <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-slate-900">{t.name}</p>
            {t.windowStart && <p className="text-slate-500">{t.windowStart}–{t.windowEnd} · {t.durationMinutes}min</p>}
            <p className="text-red-700 mt-0.5">{t.reason}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// Cache per weekdag zodat we niet elke render herberekenen
const resultsCache = {};

export default function WeekPlanningView({ tasks, vehicles }) {
  const [activeDay, setActiveDay] = useState(getTodayWeekday());
  const [loadingDays, setLoadingDays] = useState({});
  const [results, setResults] = useState(resultsCache);
  const [errors, setErrors] = useState({});

  const activeVehicles = vehicles.filter(v => v.is_active !== false);

  const runOptimizerForDay = useCallback(async (weekday, force = false) => {
    if (!force && results[weekday]) return; // gebruik cache
    if (activeVehicles.length === 0) return;

    setLoadingDays(prev => ({ ...prev, [weekday]: true }));
    setErrors(prev => { const n = { ...prev }; delete n[weekday]; return n; });

    try {
      const horizon = deriveHorizon(tasks, weekday);
      const planningDate = getDateForWeekday(weekday);

      const { data } = await base44.functions.invoke('globalFleetOptimizer', {
        planning_date: planningDate,
        weekday,
        horizon_start: horizon.start,
        horizon_end: horizon.end,
        vehicle_ids: null, // alle actieve voertuigen
        folder_id: null,   // niet opslaan, alleen weergeven
      });

      if (data.error) throw new Error(data.error);

      resultsCache[weekday] = data;
      setResults(prev => ({ ...prev, [weekday]: data }));
    } catch (e) {
      setErrors(prev => ({ ...prev, [weekday]: e.message }));
    } finally {
      setLoadingDays(prev => ({ ...prev, [weekday]: false }));
    }
  }, [tasks, activeVehicles]);

  // Bereken automatisch voor de actieve dag als die nog niet geladen is
  useEffect(() => {
    if (tasks.length > 0 && activeVehicles.length > 0) {
      runOptimizerForDay(activeDay);
    }
  }, [activeDay, tasks.length, activeVehicles.length]);

  const dayResult = results[activeDay];
  const dayLoading = loadingDays[activeDay];
  const dayError = errors[activeDay];
  const dayTasks = tasks.filter(t => t.weekdays?.includes(activeDay));

  return (
    <div className="space-y-4">
      {/* Weekdag tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
        {WEEKDAYS.map(day => {
          const hasResult = !!results[day.value];
          const isLoading = loadingDays[day.value];
          const hasError = !!errors[day.value];
          const taskCount = tasks.filter(t => t.weekdays?.includes(day.value)).length;

          return (
            <button
              key={day.value}
              onClick={() => setActiveDay(day.value)}
              className={`flex-1 flex flex-col items-center py-2 px-1 rounded-lg text-xs font-semibold transition-all relative ${
                activeDay === day.value
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <span>{day.short}</span>
              {taskCount > 0 && (
                <span className={`text-[10px] mt-0.5 ${
                  activeDay === day.value ? "text-blue-600" : "text-slate-400"
                }`}>{taskCount}</span>
              )}
              {isLoading && (
                <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
              )}
              {hasResult && !isLoading && (
                <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-green-400 rounded-full" />
              )}
              {hasError && !isLoading && (
                <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-red-400 rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* Inhoud voor actieve dag */}
      <div>
        {/* Dag header */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {WEEKDAYS.find(d => d.value === activeDay)?.label}
            </h2>
            <p className="text-xs text-slate-500">
              {dayTasks.length} taken beschikbaar · {activeVehicles.length} voertuigen
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => runOptimizerForDay(activeDay, true)}
            disabled={dayLoading || activeVehicles.length === 0}
            className="gap-1.5"
          >
            {dayLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            Herberekenen
          </Button>
        </div>

        {/* Geen voertuigen */}
        {activeVehicles.length === 0 && (
          <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            Voeg actieve voertuigen toe om automatisch te optimaliseren.
          </div>
        )}

        {/* Geen taken */}
        {dayTasks.length === 0 && activeVehicles.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
            <Info className="w-4 h-4 flex-shrink-0" />
            Geen taken ingepland op {WEEKDAYS.find(d => d.value === activeDay)?.label}.
          </div>
        )}

        {/* Laden */}
        {dayLoading && (
          <div className="flex items-center gap-3 py-12 justify-center text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Optimaliseren...</span>
          </div>
        )}

        {/* Fout */}
        {dayError && !dayLoading && (
          <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{dayError}</span>
          </div>
        )}

        {/* Resultaat */}
        {dayResult && !dayLoading && (
          <div className="space-y-3">
            {/* Statistieken */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: "Ingepland", value: dayResult.stats.assigned, color: "text-green-600" },
                { label: "Niet ingepland", value: dayResult.stats.unassigned + dayResult.stats.skipped_no_data, color: "text-red-500" },
                { label: "Routes", value: dayResult.stats.routes_generated, color: "text-blue-600" },
                { label: "Est. kosten", value: `€${(dayResult.stats.total_estimated_cost || 0).toFixed(2)}`, color: "text-slate-900" },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</p>
                  <p className={`text-lg font-bold mt-0.5 ${color}`}>{value}</p>
                </div>
              ))}
            </div>

            {dayResult.stats.total_km > 0 && (
              <p className="text-xs text-slate-500 flex flex-wrap gap-3">
                <span><MapPin className="w-3 h-3 inline mr-0.5" />{dayResult.stats.total_km} km totaal</span>
                <span><Clock className="w-3 h-3 inline mr-0.5" />{dayResult.stats.total_travel_minutes} min reistijd</span>
                <span>{dayResult.stats.vehicles_used} van {dayResult.stats.vehicles_available} voertuigen gebruikt</span>
                {dayResult.routes?.some(r => r.hasEstimatedTravelTimes) && (
                  <span className="text-amber-600">⚠ Reistijden zijn schattingen (geen Google Maps key)</span>
                )}
              </p>
            )}

            {/* Routes */}
            {dayResult.routes?.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                  Gegenereerde routes ({dayResult.routes.length})
                </p>
                {dayResult.routes.map((route, i) => (
                  <RouteCard key={i} route={route} index={i} />
                ))}
              </div>
            )}

            {/* Niet ingepland */}
            <UnassignedList tasks={dayResult.unassigned_tasks} />

            {dayResult.routes?.length === 0 && !dayResult.unassigned_tasks?.length && (
              <p className="text-sm text-slate-500 text-center py-6">
                {dayResult.message || "Geen taken gevonden voor deze dag."}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}