import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ChevronDown, ChevronUp, Circle, Navigation, Square } from "lucide-react";

export default function NavigationStatusPanel({ route, stops, visitedIds, tracking, onStart, onFinish }) {
  const visitedCount = visitedIds.size;
  const [expanded, setExpanded] = React.useState(false);
  const nextStop = stops.find(stop => !visitedIds.has(stop.id));
  const showCompact = tracking && !expanded;

  React.useEffect(() => {
    if (tracking) setExpanded(false);
  }, [tracking, nextStop?.id]);

  return (
    <div className="absolute inset-x-3 bottom-3 z-[500] rounded-2xl border border-white/10 bg-slate-950/90 p-4 text-white shadow-2xl backdrop-blur md:left-auto md:right-4 md:w-96">
      <div className="flex cursor-pointer items-start justify-between gap-3" onClick={() => tracking && setExpanded(value => !value)}>
        <div>
          <p className="text-xs uppercase tracking-wider text-amber-300">Actieve route</p>
          <h2 className="mt-1 text-lg font-bold">{route?.name || "Route"}</h2>
          <p className="text-sm text-slate-300">{visitedCount} van {stops.length} objecten bezocht</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={tracking ? "bg-emerald-500 text-white" : "bg-slate-700 text-white"}>
            {tracking ? "Live GPS" : "Gepauzeerd"}
          </Badge>
          {tracking && (expanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronUp className="h-4 w-4 text-slate-400" />)}
        </div>
      </div>

      <div className="mt-4 max-h-44 space-y-2 overflow-y-auto pr-1">
        {(showCompact && nextStop ? [nextStop] : stops).map(stop => {
          const done = visitedIds.has(stop.id);
          return (
            <div key={stop.id} className="flex items-start gap-2 rounded-xl bg-white/5 p-2">
              {done ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-400" /> : <Circle className="mt-0.5 h-4 w-4 text-slate-500" />}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{showCompact ? "Volgende taak: " : ""}{stop.sequence}. {stop.name}</p>
                <p className="truncate text-xs text-slate-400">{stop.address}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex gap-2">
        <Button onClick={onStart} className="flex-1 bg-amber-500 text-slate-950 hover:bg-amber-400">
          <Navigation className="h-4 w-4" /> GPS starten
        </Button>
        <Button onClick={onFinish} variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10">
          <Square className="h-4 w-4" /> Beëindigen
        </Button>
      </div>
    </div>
  );
}