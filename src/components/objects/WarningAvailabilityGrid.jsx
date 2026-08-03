import React, { useState } from "react";
import { WEEKDAY_OPTIONS } from "./objectWarningAddressConfig";
import { SLOT_COUNT, SLOT_MINUTES } from "./warningAvailabilityGrid";
import WarningAvailabilityHoverTooltip from "./WarningAvailabilityHoverTooltip";

const HOURS = Array.from({ length: 12 }, (_, index) => index * 2);
const TIME_LABELS = Array.from({ length: 13 }, (_, index) => index * 2);
const DAY_HEIGHT = 384;
const TIMELINE_PADDING = 16;

const intervalsFor = (slots, kind) => slots.flatMap((value, start) => {
  if (value !== kind || slots[start - 1] === kind) return [];
  let end = start + 1;
  while (end < SLOT_COUNT && slots[end] === kind) end += 1;
  return [{ start: start * SLOT_MINUTES, end: end * SLOT_MINUTES }];
});

const intervalAt = (slots, slot) => {
  const kind = slots[slot];
  if (!kind) return null;
  let start = slot;
  let end = slot + 1;
  while (start > 0 && slots[start - 1] === kind) start -= 1;
  while (end < SLOT_COUNT && slots[end] === kind) end += 1;
  return { kind, interval: { start: start * SLOT_MINUTES, end: end * SLOT_MINUTES } };
};

export default function WarningAvailabilityGrid({ schedule, onPaint, painting }) {
  const [hover, setHover] = useState(null);
  const showHover = (event, dayIndex, slot) => {
    const active = intervalAt(schedule[dayIndex], slot);
    setHover({ x: Math.min(event.clientX + 14, window.innerWidth - 190), y: Math.min(event.clientY + 14, window.innerHeight - 76), day: WEEKDAY_OPTIONS[dayIndex].label, minute: slot * SLOT_MINUTES, interval: active?.interval || null, kind: active?.kind || null });
  };
  return <div className="overflow-auto bg-background">
    <div className="sticky top-0 z-20 grid min-w-[760px] grid-cols-[48px_repeat(7,minmax(96px,1fr))] bg-background py-2">
      <span />{WEEKDAY_OPTIONS.map(day => <span key={day.key} className="text-center text-xs font-semibold">{day.label}</span>)}
    </div>
    <div className="flex min-w-[760px] select-none">
      <div className="relative w-12 shrink-0" style={{ height: DAY_HEIGHT + (TIMELINE_PADDING * 2) }}>{TIME_LABELS.map((hour, index) => <span key={hour} className="absolute right-2 -translate-y-1/2 text-[10px] text-muted-foreground" style={{ top: TIMELINE_PADDING + ((index / 12) * DAY_HEIGHT) }}>{String(hour).padStart(2, "0")}:00</span>)}</div>
      <div className="my-4 grid flex-1 grid-cols-7" style={{ height: DAY_HEIGHT }}>
        {WEEKDAY_OPTIONS.map((day, dayIndex) => <div key={day.key} className="relative border-b border-border" onPointerLeave={() => setHover(null)}>
          {HOURS.map(hour => <div key={hour} className="h-8 border-t border-border/70"><div className="h-4 border-b border-border/30" /></div>)}
          {intervalsFor(schedule[dayIndex], "available").map((interval, index) => <div key={`available-${index}`} className="pointer-events-none absolute inset-x-1 rounded-sm border border-primary/40 bg-primary/25" style={{ top: `${(interval.start / 1440) * 100}%`, height: `${((interval.end - interval.start) / 1440) * 100}%` }} />)}
          {intervalsFor(schedule[dayIndex], "emergency_only").map((interval, index) => <div key={`emergency-${index}`} className="pointer-events-none absolute inset-x-1 rounded-sm border border-chart-4/60 bg-chart-4/45" style={{ top: `${(interval.start / 1440) * 100}%`, height: `${((interval.end - interval.start) / 1440) * 100}%` }} />)}
          <div className="absolute inset-0 z-10 grid grid-rows-[repeat(48,minmax(0,1fr))]">{Array.from({ length: SLOT_COUNT }, (_, slot) => <button key={slot} type="button" aria-label={`${day.label} ${String(Math.floor(slot / 2)).padStart(2, "0")}:${slot % 2 ? "30" : "00"}`} className="w-full touch-none bg-transparent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" onPointerDown={event => { event.preventDefault(); showHover(event, dayIndex, slot); onPaint(dayIndex, slot, true); }} onPointerEnter={event => { showHover(event, dayIndex, slot); if (painting) onPaint(dayIndex, slot, false); }} onPointerMove={event => showHover(event, dayIndex, slot)} />)}</div>
        </div>)}
      </div>
    </div>
    <WarningAvailabilityHoverTooltip hover={hover} />
  </div>;
}