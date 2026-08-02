import React from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WEEKDAY_OPTIONS } from "./objectWarningAddressConfig";
import { availableIntervalsByDay } from "./warningAvailabilityTimeline";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const DAY_HEIGHT = 768;

export default function WarningAvailabilityTimelineDialog({ record, open, onOpenChange }) {
  const available = availableIntervalsByDay(record);
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-hidden p-0 sm:max-w-6xl">
      <DialogHeader className="border-b border-border px-6 py-4">
        <DialogTitle>Bereikbaarheid van {record?.display_name || "waarschuwingsadres"}</DialogTitle>
        <DialogDescription>Weekoverzicht van de momenten waarop deze contactpersoon gebeld mag worden.</DialogDescription>
      </DialogHeader>
      <div className="overflow-auto px-4 pb-5">
        <div className="sticky top-0 z-20 grid min-w-[760px] grid-cols-[48px_repeat(7,minmax(96px,1fr))] border-b border-border bg-background py-2">
          <span />{WEEKDAY_OPTIONS.map(day => <span key={day.key} className="text-center text-xs font-semibold">{day.label}</span>)}
        </div>
        <div className="flex min-w-[760px]">
          <div className="w-12 shrink-0">{HOURS.map(hour => <div key={hour} className="h-8 -translate-y-2 text-[10px] text-muted-foreground">{String(hour).padStart(2, "0")}:00</div>)}</div>
          <div className="grid flex-1 grid-cols-7" style={{ height: DAY_HEIGHT }}>
            {WEEKDAY_OPTIONS.map((day, dayIndex) => <div key={day.key} className="relative border-l border-border">
              {HOURS.map(hour => <div key={hour} className="h-8 border-t border-border/70" />)}
              {available[dayIndex].map((interval, index) => <div key={index} className="absolute inset-x-1 rounded-sm border border-emerald-500/40 bg-emerald-500/25" style={{ top: `${(interval.start / 1440) * 100}%`, height: `${((interval.end - interval.start) / 1440) * 100}%` }} title={`Bereikbaar ${Math.floor(interval.start / 60).toString().padStart(2, "0")}:${(interval.start % 60).toString().padStart(2, "0")}–${Math.floor(interval.end / 60).toString().padStart(2, "0")}:${(interval.end % 60).toString().padStart(2, "0")}`} />)}
            </div>)}
          </div>
        </div>
        <div className="sticky bottom-0 flex items-center gap-2 border-t border-border bg-background py-3 text-xs text-muted-foreground"><span className="h-3 w-3 rounded-sm border border-emerald-500/40 bg-emerald-500/25" /> Bereikbaar</div>
      </div>
    </DialogContent>
  </Dialog>;
}