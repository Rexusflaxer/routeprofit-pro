import React, { useEffect, useMemo, useRef, useState } from "react";
import WarningAvailabilityGrid from "./WarningAvailabilityGrid";
import { periodsToSchedule, scheduleToPeriods } from "./warningAvailabilityGrid";

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
  return <fieldset className="space-y-3">
    <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Weekrooster *</legend>
    <div className="flex flex-wrap gap-2">{TOOLS.map(option => <button key={option.label} type="button" onClick={() => setTool(option.key)} className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium ${tool === option.key ? "border-foreground bg-muted" : "border-border bg-card"}`}><span className={`h-3 w-3 rounded-sm border ${option.color}`} />{option.label}</button>)}</div>
    <WarningAvailabilityGrid schedule={schedule} onPaint={paint} painting={painting} tool={tool} />
    <p className="text-xs text-muted-foreground">Sleep over blokken van 30 minuten. Lege blokken betekenen dat de contactpersoon niet bereikbaar is.</p>
  </fieldset>;
}