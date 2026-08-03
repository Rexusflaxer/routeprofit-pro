import React from "react";
import { WEEKDAY_OPTIONS } from "./objectWarningAddressConfig";
import { SLOT_COUNT } from "./warningAvailabilityGrid";

const cellStyle = value => value === "available"
  ? "bg-primary/35 hover:bg-primary/45"
  : value === "emergency_only"
    ? "bg-chart-4/45 hover:bg-chart-4/55"
    : "bg-card hover:bg-muted/70";

export default function WarningAvailabilityGrid({ schedule, onPaint, painting }) {
  return <div className="overflow-auto rounded-md border border-border bg-card">
    <div className="sticky top-0 z-20 grid min-w-[700px] grid-cols-[52px_repeat(7,minmax(84px,1fr))] border-b border-border bg-card">
      <span />{WEEKDAY_OPTIONS.map(day => <span key={day.key} className="py-2 text-center text-xs font-semibold">{day.label}</span>)}
    </div>
    <div className="flex min-w-[700px] select-none">
      <div className="relative w-[52px] shrink-0">{Array.from({ length: 13 }, (_, index) => <span key={index} className="absolute right-2 -translate-y-1/2 text-[10px] text-muted-foreground" style={{ top: index * 48 }}>{String(index * 2).padStart(2, "0")}:00</span>)}</div>
      <div className="grid flex-1 grid-cols-7">
        {WEEKDAY_OPTIONS.map((day, dayIndex) => <div key={day.key} className="border-l border-border">
          {Array.from({ length: SLOT_COUNT }, (_, slot) => <button
            key={slot}
            type="button"
            aria-label={`${day.label} ${String(Math.floor(slot / 2)).padStart(2, "0")}:${slot % 2 ? "30" : "00"}`}
            className={`block h-3 w-full border-b ${slot % 4 === 3 ? "border-border/70" : slot % 2 === 1 ? "border-border/40" : "border-border/20"} ${cellStyle(schedule[dayIndex][slot])}`}
            onPointerDown={event => { event.preventDefault(); onPaint(dayIndex, slot, true); }}
            onPointerEnter={() => painting && onPaint(dayIndex, slot, false)}
          />)}
        </div>)}
      </div>
    </div>
  </div>;
}