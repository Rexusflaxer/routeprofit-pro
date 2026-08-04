import React, { useEffect, useMemo, useRef, useState } from "react";
import WarningAvailabilityGrid from "./WarningAvailabilityGrid";
import { EMPTY_SCHEDULE, periodsToSchedule, scheduleToPeriods } from "./warningAvailabilityScheduleModel";

const TOOLS = [
  { key: "available", label: "Bereikbaar", color: "border-primary/40 bg-primary/25" },
  { key: "emergency_only", label: "Alleen noodgevallen", color: "border-chart-4/60 bg-chart-4/45" },
  { key: null, label: "Niet bereikbaar", color: "border-border bg-card" },
];

export default function WarningAvailabilitySchedule({ periods, onChange }) {
  const [tool, setTool] = useState("available");
  const [painting, setPainting] = useState(false);
  const schedule = useMemo(() => periodsToSchedule(periods), [periods]);
  const scheduleRef = useRef(schedule);
  useEffect(() => { scheduleRef.current = schedule; }, [schedule]);
  useEffect(() => {
    const stop = () => setPainting(false);
    window.addEventListener("pointerup", stop);
    return () => window.removeEventListener("pointerup", stop);
  }, []);
  const paint = (dayIndex, slot, start) => {
    if (start) setPainting(true);
    const next = scheduleRef.current.map(day => [...day]);
    next[dayIndex][slot] = tool;
    scheduleRef.current = next;
    onChange(scheduleToPeriods(next));
  };
  const applyPreset = preset => {
    const next = EMPTY_SCHEDULE();
    if (preset === "always") next.forEach(day => day.fill("available"));
    if (preset === "business") next.slice(0, 5).forEach(day => day.fill("available", 16, 36));
    scheduleRef.current = next;
    onChange(scheduleToPeriods(next));
  };
  return <fieldset className="space-y-3">
    <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Weekrooster *</legend>
    <div className="flex flex-wrap gap-2"><button type="button" onClick={() => applyPreset("always")} className="rounded-xl border border-border/70 bg-card/45 px-3 py-2 text-xs font-medium shadow-sm backdrop-blur-xl hover:border-primary/40 hover:bg-card/70">24/7 invullen</button><button type="button" onClick={() => applyPreset("business")} className="rounded-xl border border-border/70 bg-card/45 px-3 py-2 text-xs font-medium shadow-sm backdrop-blur-xl hover:border-primary/40 hover:bg-card/70">Werkdagen 08:00–18:00</button><button type="button" onClick={() => applyPreset("empty")} className="rounded-xl border border-border/70 bg-card/45 px-3 py-2 text-xs font-medium shadow-sm backdrop-blur-xl hover:border-primary/40 hover:bg-card/70">Rooster wissen</button></div>
    <div className="flex flex-wrap gap-2">{TOOLS.map(option => <button key={option.label} type="button" onClick={() => setTool(option.key)} aria-pressed={tool === option.key} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium shadow-sm backdrop-blur-xl ${tool === option.key ? "border-primary/60 bg-primary/10" : "border-border/70 bg-card/45 hover:border-primary/40 hover:bg-card/70"}`}><span className={`h-3 w-3 rounded-sm border ${option.color}`} />{option.label}</button>)}</div>
    <WarningAvailabilityGrid schedule={schedule} onPaint={paint} painting={painting} tool={tool} />
    <p className="text-xs text-muted-foreground">Sleep over blokken van 30 minuten. Lege blokken betekenen dat de contactpersoon niet bereikbaar is.</p>
  </fieldset>;
}
