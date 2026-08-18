import React, { useRef, useState } from "react";
import { Repeat2, Shuffle } from "lucide-react";
import { WEEKDAY_OPTIONS } from "./objectWarningAddressConfig";
import { SLOT_COUNT, SLOT_MINUTES } from "./warningAvailabilityScheduleModel";
import WarningAvailabilityHoverTooltip from "./WarningAvailabilityHoverTooltip";

const HOURS = Array.from({ length: 12 }, (_, index) => index * 2);
const TIME_LABELS = Array.from({ length: 13 }, (_, index) => index * 2);
const labelPosition = index => index === 0 ? "" : index === 12 ? "-translate-x-full" : "-translate-x-1/2";
const previewStyle = tool => tool === "available"
  ? "border-primary/70 bg-primary/40"
  : tool === "emergency_only"
    ? "border-chart-4/80 bg-chart-4/60"
    : "border-foreground/50 bg-background/80";
const BACKGROUND_STYLES = [
  "border-chart-2/25 bg-chart-2/10",
  "border-chart-4/25 bg-chart-4/10",
  "border-chart-5/25 bg-chart-5/10",
  "border-chart-3/25 bg-chart-3/10",
];

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
const toMinutes = value => value === "24:00" ? 1440 : Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
const matchesRow = (period, dayKey, dateKey) => dateKey ? period.date === dateKey : period.days?.includes(dayKey);
const exactIntervalsFor = (periods, dayKey, kind, dateKey = null) => (periods || []).filter(period => matchesRow(period, dayKey, dateKey) && (period.kind || "available") === kind).map(period => ({
  start: toMinutes(period.start_time),
  end: toMinutes(period.end_time),
  repeating: ["weekly", "week"].includes(String(period.entry?.frequency || period.entry?.recurrence_type || "").toLowerCase()),
  alternative: period.entry?.revision?.metadata?.planning_only_single_occurrence === true,
}));
const exactIntervalAt = (periods, dayKey, minute, dateKey = null) => { const period = (periods || []).find(item => matchesRow(item, dayKey, dateKey) && toMinutes(item.start_time) <= minute && toMinutes(item.end_time) > minute); return period ? { kind: period.kind || "available", interval: { start: toMinutes(period.start_time), end: toMinutes(period.end_time) } } : null; };

export default function WarningAvailabilityGrid({ schedule, exactPeriods = null, backgroundPeriods = [], previewDurationMinutes = null, onPaint, onIntervalClick, painting, tool, activeDayIndex = null, dayLabels = null, rowDates = null, weekNumbers = null, rowActive = null, showHeader = true, hoverOnlyActive = false }) {
  const [hover, setHover] = useState(null);
  const pointerStart = useRef(null);
  const rows = rowDates || WEEKDAY_OPTIONS.map(day => day.key);
  const weekdayAt = dayIndex => WEEKDAY_OPTIONS[dayIndex % 7];
  const dayDisabled = dayIndex => Number.isInteger(activeDayIndex) && dayIndex !== activeDayIndex;
  const activeAtPointer = (event, dayIndex, slot) => { if (!exactPeriods) return intervalAt(schedule[dayIndex], slot); const bounds = event.currentTarget.getBoundingClientRect(); const minute = slot * SLOT_MINUTES + ((event.clientX - bounds.left) / bounds.width) * SLOT_MINUTES; return exactIntervalAt(exactPeriods, weekdayAt(dayIndex).key, minute, rowDates?.[dayIndex]); };
  const showHover = (event, dayIndex, slot) => {
    const active = activeAtPointer(event, dayIndex, slot);
    if (hoverOnlyActive && !active) {
      setHover(null);
      return;
    }
    setHover({ x: Math.min(event.clientX + 14, window.innerWidth - 190), y: Math.min(event.clientY + 14, window.innerHeight - 76), dayIndex, slot, day: dayLabels?.[dayIndex] || weekdayAt(dayIndex).label, minute: slot * SLOT_MINUTES, interval: active?.interval || null, kind: active?.kind || null });
  };
  const startPointer = (event, dayIndex, slot) => { const active = activeAtPointer(event, dayIndex, slot); pointerStart.current = { dayIndex, slot, active, moved: false }; showHover(event, dayIndex, slot); if (!(active && tool === active.kind && onIntervalClick)) onPaint(dayIndex, slot, true, active); };
  const enterPointer = (event, dayIndex, slot) => { const active = activeAtPointer(event, dayIndex, slot); showHover(event, dayIndex, slot); if (painting) { if (pointerStart.current && pointerStart.current.slot !== slot) pointerStart.current.moved = true; onPaint(dayIndex, slot, false, active); } };
  const finishPointer = event => { const start = pointerStart.current; pointerStart.current = null; if (!start?.moved && start.active && tool === start.active.kind && onIntervalClick) { setHover(null); onIntervalClick({ dayIndex: start.dayIndex, ...start.active.interval, x: Math.min(event.clientX + 12, window.innerWidth - 272), y: Math.min(event.clientY + 12, window.innerHeight - 210) }); } };
  return <div className="overflow-auto">
    <div className="min-w-[900px] select-none">
      {showHeader && (
        <div className="sticky top-0 z-30 flex h-9 bg-card">
          <span className={`${dayLabels ? "sticky left-0 z-30 w-20 bg-card" : "w-10"} shrink-0`} />
          <div className="relative flex-1">{TIME_LABELS.map((hour, index) => <span key={hour} className={`absolute bottom-2 text-[10px] text-muted-foreground ${labelPosition(index)}`} style={{ left: `${(index / 12) * 100}%` }}>{String(hour).padStart(2, "0")}:00</span>)}</div>
        </div>
      )}
      {rows.map((row, dayIndex) => { const day = weekdayAt(dayIndex); return <div key={row} className={`flex ${dayDisabled(dayIndex) ? "opacity-30" : ""}`}>
        <span className={`${dayLabels ? `sticky left-0 z-20 w-20 flex-col justify-center bg-transparent leading-tight ${rowActive?.[dayIndex] ? "text-primary" : "text-foreground"}` : "w-10 items-center"} flex h-12 shrink-0 pr-2 text-xs font-semibold`}>
          <span>{day.label.slice(0, 2)}</span>
          {dayLabels?.[dayIndex] && <span className="text-[10px] font-normal text-muted-foreground">{dayLabels[dayIndex]}</span>}
        </span>
        <div className={`relative h-12 flex-1 border-b border-r border-border ${dayIndex === 0 ? "border-t" : ""}`} onPointerLeave={() => setHover(null)}>
          {weekNumbers?.[dayIndex] && <span className="pointer-events-none absolute left-3 top-1/2 z-[6] -translate-y-1/2 text-[40px] font-black leading-none text-muted-foreground/10">{weekNumbers[dayIndex]}</span>}
          {HOURS.map((hour, index) => <div key={hour} className="absolute inset-y-0 border-l border-border/70" style={{ left: `${(index / 12) * 100}%`, width: `${100 / 12}%` }}><div className="absolute inset-y-0 left-1/2 border-l border-border/30" /></div>)}
          {backgroundPeriods.filter(period => matchesRow(period, day.key, rowDates?.[dayIndex])).map((period, index) => { const start = toMinutes(period.start_time), end = toMinutes(period.end_time); return <div key={`${period.taskId}-${day.key}-${index}`} className={`pointer-events-none absolute inset-y-2 rounded-sm border ${BACKGROUND_STYLES[period.colorIndex % BACKGROUND_STYLES.length]}`} style={{ left: `${(start / 1440) * 100}%`, width: `${((end - start) / 1440) * 100}%` }} />; })}
          {(exactPeriods ? exactIntervalsFor(exactPeriods, day.key, "available", rowDates?.[dayIndex]) : intervalsFor(schedule[dayIndex], "available")).map((interval, index) => <div key={`available-${index}`} className="pointer-events-none absolute inset-y-1 flex items-center justify-center overflow-hidden rounded-sm border border-primary/40 bg-primary/25" style={{ left: `${(interval.start / 1440) * 100}%`, width: `${((interval.end - interval.start) / 1440) * 100}%` }}>{interval.alternative ? <Shuffle className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Aangepast alternatief taakmoment" /> : interval.repeating && <Repeat2 className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Wekelijks herhalende taak" />}</div>) }
          {(exactPeriods ? exactIntervalsFor(exactPeriods, day.key, "emergency_only", rowDates?.[dayIndex]) : intervalsFor(schedule[dayIndex], "emergency_only")).map((interval, index) => <div key={`emergency-${index}`} className="pointer-events-none absolute inset-y-1 rounded-sm border border-chart-4/60 bg-chart-4/45" style={{ left: `${(interval.start / 1440) * 100}%`, width: `${((interval.end - interval.start) / 1440) * 100}%` }} />)}
          {hover?.dayIndex === dayIndex && schedule[dayIndex][hover.slot] !== tool && (!previewDurationMinutes || hover.slot * SLOT_MINUTES + previewDurationMinutes <= 1440) && <div className={`pointer-events-none absolute inset-y-1 z-[5] rounded-sm border ${previewStyle(tool)}`} style={{ left: `${(hover.slot * SLOT_MINUTES / 1440) * 100}%`, width: `${((previewDurationMinutes || SLOT_MINUTES) / 1440) * 100}%` }} />}
          <div className="absolute inset-0 z-10 grid grid-cols-[repeat(48,minmax(0,1fr))]">{Array.from({ length: SLOT_COUNT }, (_, slot) => <button key={slot} type="button" disabled={dayDisabled(dayIndex)} aria-label={`${day.label} ${String(Math.floor(slot / 2)).padStart(2, "0")}:${slot % 2 ? "30" : "00"}`} className="h-full touch-none bg-transparent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed" onPointerDown={event => { event.preventDefault(); if (!dayDisabled(dayIndex)) startPointer(event, dayIndex, slot); }} onPointerUp={finishPointer} onPointerEnter={event => { if (!dayDisabled(dayIndex)) enterPointer(event, dayIndex, slot); }} onPointerMove={event => !dayDisabled(dayIndex) && showHover(event, dayIndex, slot)} />)}</div>
        </div>
      </div>})}
    </div>
    <WarningAvailabilityHoverTooltip hover={hover} />
  </div>;
}