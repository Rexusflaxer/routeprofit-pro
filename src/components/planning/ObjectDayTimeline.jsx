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
  const height = Math.max(24, 8 + items.length * 14);
  return (
    <div className="rounded-md border border-border/80 bg-muted/35 px-1.5 pb-1.5 pt-1" aria-label="Dagplanning van 00:00 tot 24:00">
      <div className="flex justify-between text-[7px] font-medium tabular-nums text-muted-foreground">
        <span>00</span><span>06</span><span>12</span><span>18</span><span>24</span>
      </div>
      <div className="relative mt-0.5 overflow-hidden rounded-sm bg-background/70" style={{ height }}>
        {[0, 25, 50, 75, 100].map(position => (
          <span key={position} className="absolute inset-y-0 border-l border-border/70" style={{ left: `${position}%` }} />
        ))}
        {items.map((item, index) => {
          const start = minutes(item.start);
          const end = Math.max(start + 1, minutes(item.end));
          return (
            <span
              key={item.id}
              className={cn("absolute h-2.5 rounded-sm ring-1", toneClasses[item.tone] || toneClasses.primary)}
              style={{ left: `${start / 14.4}%`, width: `${Math.max(0.8, (end - start) / 14.4)}%`, top: 5 + index * 14 }}
              title={`${item.label} · ${item.start}–${item.end}`}
              aria-label={`${item.label}, ${item.start} tot ${item.end}`}
            />
          );
        })}
      </div>
    </div>
  );
}