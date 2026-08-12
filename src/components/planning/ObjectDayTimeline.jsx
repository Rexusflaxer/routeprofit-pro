import React from "react";
import { cn } from "@/lib/utils";

const toneClasses = {
  primary: "bg-primary/75 ring-primary/30",
  full: "bg-emerald-500/75 ring-emerald-500/30",
  partial: "bg-amber-500/80 ring-amber-500/30",
  open: "bg-rose-500/75 ring-rose-500/30",
};

function minutes(value) {
  const [hours, mins] = String(value || "00:00").split(":").map(Number);
  return Math.min(1440, Math.max(0, (hours || 0) * 60 + (mins || 0)));
}

export default function ObjectDayTimeline({ items = [] }) {
  const marks = [0, 4, 8, 12, 16, 20, 24];
  return (
    <div className="relative h-[300px] overflow-hidden rounded-md border border-border/80 bg-muted/30" aria-label="Dagplanning van 00:00 tot 24:00">
      {marks.map(hour => (
        <div key={hour} className="absolute left-0 right-0 border-t border-border/70" style={{ top: `${(hour / 24) * 100}%` }}>
          <span className="absolute left-1 top-0 -translate-y-1/2 bg-muted px-1 text-[8px] font-medium tabular-nums text-muted-foreground">
            {String(hour).padStart(2, "0")}:00
          </span>
        </div>
      ))}
      {items.map(item => {
        const start = minutes(item.start);
        const end = Math.max(start + 1, minutes(item.end));
        return (
          <button
            key={item.id}
            type="button"
            onClick={item.onClick}
            className={cn("absolute left-11 right-2 overflow-hidden rounded-sm px-1.5 text-left text-[8px] font-semibold text-white shadow-sm ring-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", toneClasses[item.tone] || toneClasses.primary)}
            style={{ top: `${start / 14.4}%`, height: `${Math.max(0.2, (end - start) / 14.4)}%` }}
            title={`${item.label} · ${item.start}–${item.end}`}
            aria-label={`${item.label}, ${item.start} tot ${item.end}`}
          >
            {end - start >= 45 ? `${item.start}–${item.end} · ${item.label}` : ""}
          </button>
        );
      })}
      {items.length === 0 && <span className="absolute inset-0 flex items-center justify-center pl-8 text-[9px] text-muted-foreground/60">Geen planning</span>}
    </div>
  );
}