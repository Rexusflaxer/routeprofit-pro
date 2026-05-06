import React from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Clock, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getDayLabel, getRoutesForDate, toDateKey } from "./executionCalendarUtils";

export default function ExecutionDayCard({ date, routes, isToday }) {
  const dateKey = toDateKey(date);
  const dayRoutes = getRoutesForDate(routes, date);

  return (
    <div className={`rounded-2xl border bg-white p-4 shadow-sm ${isToday ? "border-amber-400 ring-2 ring-amber-100" : "border-slate-200"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{getDayLabel(date)}</p>
          <h3 className="mt-1 text-2xl font-bold text-slate-900">{date.getDate()}</h3>
        </div>
        {isToday && <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Vandaag</Badge>}
      </div>

      <div className="mt-4 space-y-2">
        {dayRoutes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-3 text-sm text-slate-400">
            Geen routes gepland
          </div>
        ) : dayRoutes.map(route => (
          <div key={route.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900">{route.name || "Naamloze route"}</p>
                <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {route.time_window_start || "--:--"} – {route.flexible_end_time ? "flexibel" : (route.time_window_end || "--:--")}</span>
                  <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" /> {route.assigned_tasks?.length || 0} taken</span>
                </div>
              </div>
              <Button asChild size="sm" className="bg-slate-900 hover:bg-slate-800">
                <Link to={`/SurveillanceNavigation?routeId=${route.id}&date=${dateKey}`}>
                  <Navigation className="h-3.5 w-3.5" /> Start
                </Link>
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}