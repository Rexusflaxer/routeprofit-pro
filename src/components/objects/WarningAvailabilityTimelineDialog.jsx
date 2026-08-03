import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WEEKDAY_OPTIONS } from "./objectWarningAddressConfig";
import { availableIntervalsByDay, scheduleIntervalsByKind } from "./warningAvailabilityTimeline";

const HOURS = Array.from({ length: 12 }, (_, index) => index * 2);
const TIME_LABELS = Array.from({ length: 13 }, (_, index) => index * 2);
const DAY_HEIGHT = 384;
const TIMELINE_PADDING = 16;

const formatMinutes = minutes => minutes === 1440 ? "24:00" : `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export default function WarningAvailabilityTimelineDialog({ record, open, onOpenChange }) {
  const [hover, setHover] = useState(null);
  const schedule = record?.availability_mode === "schedule" ? scheduleIntervalsByKind(record) : { available: availableIntervalsByDay(record), emergency: WEEKDAY_OPTIONS.map(() => []) };
  const handleTimelineMove = (event, dayIndex) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const minute = Math.min(1410, Math.max(0, Math.floor((((event.clientY - bounds.top) / bounds.height) * 1440) / 30) * 30));
    const available = schedule.available[dayIndex].find(interval => minute >= interval.start && minute < interval.end);
    const emergency = schedule.emergency[dayIndex].find(interval => minute >= interval.start && minute < interval.end);
    const interval = available || emergency;
    setHover({ x: Math.min(event.clientX + 14, window.innerWidth - 190), y: Math.min(event.clientY + 14, window.innerHeight - 76), day: WEEKDAY_OPTIONS[dayIndex].label, minute, interval, kind: available ? "available" : emergency ? "emergency" : null });
  };
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-hidden p-0 sm:max-w-6xl">
      <DialogHeader className="border-b border-border px-6 py-4">
        <DialogTitle>Bereikbaarheid van {record?.display_name || "waarschuwingsadres"}</DialogTitle>
        <DialogDescription>Weekoverzicht van bereikbaarheid, noodgevallen en momenten waarop deze contactpersoon niet bereikbaar is.</DialogDescription>
      </DialogHeader>
      <div className="overflow-auto px-4 pb-5">
        <div className="sticky top-0 z-20 grid min-w-[760px] grid-cols-[48px_repeat(7,minmax(96px,1fr))] bg-background py-2">
          <span />{WEEKDAY_OPTIONS.map(day => <span key={day.key} className="text-center text-xs font-semibold">{day.label}</span>)}
        </div>
        <div className="flex min-w-[760px]">
          <div className="relative w-12 shrink-0" style={{ height: DAY_HEIGHT + (TIMELINE_PADDING * 2) }}>{TIME_LABELS.map((hour, index) => <span key={hour} className="absolute right-2 -translate-y-1/2 text-[10px] text-muted-foreground" style={{ top: TIMELINE_PADDING + ((index / 12) * DAY_HEIGHT) }}>{String(hour).padStart(2, "0")}:00</span>)}</div>
          <div className="my-4 grid flex-1 grid-cols-7" style={{ height: DAY_HEIGHT }}>
            {WEEKDAY_OPTIONS.map((day, dayIndex) => <div key={day.key} className="relative border-b border-border" onMouseMove={event => handleTimelineMove(event, dayIndex)} onMouseLeave={() => setHover(null)}>
              {HOURS.map(hour => <div key={hour} className="h-8 border-t border-border/70"><div className="h-4 border-b border-border/30" /></div>)}
              {schedule.available[dayIndex].map((interval, index) => <div key={`available-${index}`} className="absolute inset-x-1 rounded-sm border border-primary/40 bg-primary/25" style={{ top: `${(interval.start / 1440) * 100}%`, height: `${((interval.end - interval.start) / 1440) * 100}%` }} title="Bereikbaar" />)}
              {schedule.emergency[dayIndex].map((interval, index) => <div key={`emergency-${index}`} className="absolute inset-x-1 rounded-sm border border-chart-4/60 bg-chart-4/45" style={{ top: `${(interval.start / 1440) * 100}%`, height: `${((interval.end - interval.start) / 1440) * 100}%` }} title="Alleen bij noodgevallen" />)}
            </div>)}
          </div>
        </div>
        <div className="sticky bottom-0 flex flex-wrap items-center gap-4 bg-background py-3 text-xs text-muted-foreground"><span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm border border-primary/40 bg-primary/25" /> Bereikbaar</span><span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm border border-chart-4/60 bg-chart-4/45" /> Alleen noodgevallen</span><span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm border border-border bg-card" /> Niet bereikbaar</span></div>
      </div>
      {hover && createPortal(<div className="pointer-events-none fixed z-[100] min-w-32 rounded-md border border-border bg-popover px-2.5 py-2 text-xs text-popover-foreground shadow-lg" style={{ left: hover.x, top: hover.y }}><div className="font-medium">{hover.day} · {formatMinutes(hover.minute)}</div>{hover.interval && <div className="mt-1 flex items-center gap-1.5 text-muted-foreground"><span className={`h-2.5 w-2.5 shrink-0 rounded-sm border ${hover.kind === "available" ? "border-primary/40 bg-primary/25" : "border-chart-4/60 bg-chart-4/45"}`} /><span>{formatMinutes(hover.interval.start)} – {formatMinutes(hover.interval.end)}</span></div>}</div>, document.body)}
    </DialogContent>
  </Dialog>;
}