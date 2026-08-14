import React, { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, LockKeyhole, Plus, Repeat2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  OBJECT_TASK_DAY_MINUTES,
  addObjectTaskWeeks,
  formatObjectTaskDay,
  getAmsterdamNow,
  isObjectTaskMomentEditable,
  objectTaskEditableBoundary,
  objectTaskEntryInterval,
  objectTaskMinutesToClock,
  objectTaskWeek,
  objectTaskWeekStart,
  objectTaskWeekStrip,
  snapObjectTaskMinute,
} from "./objectTaskScheduleDomain";

const HOUR_MARKERS = Array.from({ length: 13 }, (_, index) => index * 120);

function liveAmsterdamNow(serverClock) {
  const serverInstant = serverClock?.iso && Number.isFinite(Date.parse(serverClock.iso))
    ? Date.parse(serverClock.iso)
    : null;
  const baseClient = Date.now();
  const resolve = () => getAmsterdamNow(new Date(serverInstant == null ? Date.now() : serverInstant + (Date.now() - baseClient)));
  return { resolve };
}

function useLiveAmsterdamNow(serverClock) {
  const sourceRef = useRef(liveAmsterdamNow(serverClock));
  const [now, setNow] = useState(() => sourceRef.current.resolve());
  useEffect(() => {
    sourceRef.current = liveAmsterdamNow(serverClock);
    const update = () => setNow(sourceRef.current.resolve());
    update();
    let interval = null;
    const align = globalThis.setTimeout(() => {
      update();
      interval = globalThis.setInterval(update, 60_000);
    }, Math.max(250, 60_000 - (Date.now() % 60_000) + 25));
    const onVisibility = () => { if (document.visibilityState === "visible") update(); };
    globalThis.addEventListener("focus", update);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      globalThis.clearTimeout(align);
      if (interval) globalThis.clearInterval(interval);
      globalThis.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [serverClock]);
  return now;
}

function minuteAtPointer(event) {
  const bounds = event.currentTarget.getBoundingClientRect();
  if (!bounds.width) return 0;
  return snapObjectTaskMinute(((event.clientX - bounds.left) / bounds.width) * OBJECT_TASK_DAY_MINUTES);
}

function layoutDayEntries(entries) {
  const laneEnds = [];
  return [...entries]
    .map(entry => ({ entry, interval: objectTaskEntryInterval(entry) }))
    .filter(item => item.interval)
    .sort((left, right) => left.interval.start - right.interval.start || left.interval.end - right.interval.end)
    .map(item => {
      let lane = laneEnds.findIndex(end => end <= item.interval.start);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = item.interval.end;
      return { ...item, lane };
    });
}

function TaskBlock({ item, contextual, editable, now, onClick }) {
  const { entry, interval, lane } = item;
  const start = Math.max(0, interval.start);
  const end = Math.min(OBJECT_TASK_DAY_MINUTES, interval.end);
  const canOpen = editable && isObjectTaskMomentEditable(entry.occurrence_date, start, now);
  const sourceChanged = Boolean(entry.source_change);
  return (
    <button
      type="button"
      aria-disabled={!canOpen}
      tabIndex={canOpen ? 0 : -1}
      onPointerDown={event => event.stopPropagation()}
      onClick={() => canOpen && onClick?.(entry)}
      aria-label={`${entry.label || "Taak"}, ${entry.start_time} tot ${entry.end_time}${entry.frequency === "weekly" ? ", wekelijks" : ""}${sourceChanged ? ", bron gewijzigd" : ""}`}
      title={`${entry.label || "Taak"}\n${entry.start_time}–${entry.end_time}${Number(entry.end_day_offset || 0) > 0 ? " (+1)" : ""}${entry.frequency === "weekly" ? "\nWekelijks" : ""}`}
      className={cn(
        "absolute z-20 flex h-8 min-w-[28px] items-center gap-1 overflow-hidden rounded-md border px-2 text-left text-[10px] shadow-sm backdrop-blur-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        contextual
          ? "border-slate-400/25 bg-slate-500/10 text-muted-foreground"
          : entry.draft
            ? "border-primary/50 bg-primary/20 text-foreground hover:bg-primary/25"
            : "border-primary/35 bg-primary/15 text-foreground hover:border-primary/55 hover:bg-primary/20",
        sourceChanged && "border-amber-500/60 bg-amber-500/15 text-amber-900 dark:text-amber-100",
        !canOpen && !contextual && "cursor-not-allowed opacity-65",
      )}
      style={{
        left: `${(start / OBJECT_TASK_DAY_MINUTES) * 100}%`,
        width: `${Math.max(0.45, ((end - start) / OBJECT_TASK_DAY_MINUTES) * 100)}%`,
        top: 8 + lane * 36,
      }}
    >
      {entry.frequency === "weekly" && <Repeat2 className="h-3 w-3 shrink-0" />}
      <span className="min-w-0 truncate"><span className="font-semibold tabular-nums">{entry.start_time}–{entry.end_time}</span><span className="ml-1 hidden xl:inline">{entry.label}</span></span>
      {sourceChanged && <span className="ml-auto shrink-0 rounded bg-amber-500/20 px-1 py-0.5 text-[8px] font-bold">Bron gewijzigd</span>}
    </button>
  );
}

export default function ObjectTaskWeekSchedule({
  weekStart,
  onWeekChange,
  entries = [],
  contextEntries = [],
  editable = false,
  allowDrawing = editable,
  allowEntryEditing = editable,
  executionMode = "continuous",
  durationMinutes = 0,
  serverClock = null,
  onDraw,
  onEntryClick,
  emptyLabel = "Klik of sleep in de toekomst om een taakmoment toe te voegen.",
}) {
  const now = useLiveAmsterdamNow(serverClock);
  const currentWeekStart = now.weekStart;
  const selectedWeekStart = objectTaskWeekStart(weekStart) || currentWeekStart;
  const week = objectTaskWeek(selectedWeekStart);
  const strip = objectTaskWeekStrip(selectedWeekStart, currentWeekStart);
  const [drag, setDrag] = useState(null);
  const selectedInPast = selectedWeekStart < currentWeekStart;

  useEffect(() => {
    if (selectedInPast) onWeekChange?.(currentWeekStart);
  }, [currentWeekStart, onWeekChange, selectedInPast]);

  const grouped = useMemo(() => {
    const map = new Map(week.days.map(day => [day, { own: [], context: [] }]));
    entries.forEach(entry => map.get(entry.occurrence_date)?.own.push(entry));
    contextEntries.forEach(entry => map.get(entry.occurrence_date)?.context.push(entry));
    return map;
  }, [contextEntries, entries, week.days]);

  const finishDraw = (event, dateKey) => {
    if (!drag || drag.dateKey !== dateKey) return;
    const pointerMinute = minuteAtPointer(event);
    const boundary = objectTaskEditableBoundary(dateKey, now);
    let start = drag.startMinute;
    let end = pointerMinute;
    let endDayOffset = 0;
    if (executionMode === "time_window") {
      end = start + Number(durationMinutes || 0);
    } else if (end === start) {
      end = start + 30;
    } else if (end < start) {
      [start, end] = [end, start];
    }
    start = Math.max(boundary, snapObjectTaskMinute(start));
    end = Math.max(start + 5, snapObjectTaskMinute(end));
    if (executionMode === "time_window" && end > OBJECT_TASK_DAY_MINUTES) {
      endDayOffset = 1;
    }
    if (
      start >= OBJECT_TASK_DAY_MINUTES
      || end > OBJECT_TASK_DAY_MINUTES * 2
      || !isObjectTaskMomentEditable(dateKey, start, now)
    ) {
      setDrag(null);
      return;
    }
    const storedEnd = endDayOffset > 0 ? end - OBJECT_TASK_DAY_MINUTES : end;
    onDraw?.({
      occurrence_date: dateKey,
      start_time: objectTaskMinutesToClock(start),
      end_time: objectTaskMinutesToClock(storedEnd),
      end_day_offset: endDayOffset,
    });
    setDrag(null);
  };

  const quickAdd = dateKey => {
    const boundary = objectTaskEditableBoundary(dateKey, now);
    const start = Math.max(boundary, 8 * 60);
    if (start >= OBJECT_TASK_DAY_MINUTES) return;
    const duration = executionMode === "time_window" ? Number(durationMinutes || 0) : 30;
    const absoluteEnd = start + duration;
    if (duration < 5 || absoluteEnd > OBJECT_TASK_DAY_MINUTES * 2) return;
    const endDayOffset = absoluteEnd > OBJECT_TASK_DAY_MINUTES ? 1 : 0;
    onDraw?.({
      occurrence_date: dateKey,
      start_time: objectTaskMinutesToClock(start),
      end_time: objectTaskMinutesToClock(endDayOffset ? absoluteEnd - OBJECT_TASK_DAY_MINUTES : absoluteEnd),
      end_day_offset: endDayOffset,
    });
  };

  const go = next => {
    const normalized = objectTaskWeekStart(next);
    onWeekChange?.(normalized < currentWeekStart ? currentWeekStart : normalized);
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-border/70 bg-card/30 shadow-sm backdrop-blur-xl" aria-label="Taakrooster per week">
      <header className="border-b border-border/70 bg-card/35 p-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary"><CalendarDays className="h-4 w-4" /></span>
            <div><h4 className="text-sm font-semibold">{week.label}</h4><p className="text-xs text-muted-foreground">{week.rangeLabel} {week.year}</p></div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button type="button" size="icon" variant="outline" className="h-8 w-8" disabled={selectedWeekStart <= currentWeekStart} onClick={() => go(addObjectTaskWeeks(selectedWeekStart, -1))} aria-label="Vorige week"><ChevronLeft className="h-4 w-4" /></Button>
            <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => go(currentWeekStart)} disabled={selectedWeekStart === currentWeekStart}><RotateCcw className="h-3.5 w-3.5" /> Deze week</Button>
            <Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={() => go(addObjectTaskWeeks(selectedWeekStart, 1))} aria-label="Volgende week"><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Week kiezen">
          {strip.map(item => <button key={item.start} type="button" role="tab" aria-selected={item.start === selectedWeekStart} onClick={() => go(item.start)} className={cn("min-w-[86px] shrink-0 rounded-lg border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", item.start === selectedWeekStart ? "border-primary/55 bg-primary/10 text-primary" : "border-border/70 bg-card/35 text-muted-foreground hover:border-primary/30 hover:text-foreground")}><span className="block text-xs font-semibold">Week {item.week}</span><span className="mt-0.5 block text-[9px]">{item.rangeLabel}</span></button>)}
        </div>
      </header>

      <div className="overflow-x-auto">
        <div className="min-w-[980px]">
          <div className="sticky top-0 z-30 grid grid-cols-[116px_1fr] border-b border-border/70 bg-card/90 backdrop-blur-xl">
            <span className="border-r border-border/70 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Dag</span>
            <div className="relative h-9">{HOUR_MARKERS.map((minute, index) => <span key={minute} className={cn("absolute top-2 text-[9px] tabular-nums text-muted-foreground", index === 0 ? "" : index === HOUR_MARKERS.length - 1 ? "-translate-x-full" : "-translate-x-1/2")} style={{ left: `${(minute / OBJECT_TASK_DAY_MINUTES) * 100}%` }}>{objectTaskMinutesToClock(minute)}</span>)}</div>
          </div>

          {week.days.map(dateKey => {
            const day = grouped.get(dateKey) || { own: [], context: [] };
            const allLayout = layoutDayEntries([
              ...day.context.map(entry => ({ ...entry, _contextual: true })),
              ...day.own,
            ]);
            const laneCount = Math.max(1, ...allLayout.map(item => item.lane + 1));
            const rowHeight = Math.max(58, 16 + laneCount * 36);
            const today = dateKey === now.dateKey;
            const whollyPast = dateKey < now.dateKey;
            const boundary = objectTaskEditableBoundary(dateKey, now);
            const pastWidth = whollyPast ? 100 : today ? (boundary / OBJECT_TASK_DAY_MINUTES) * 100 : 0;
            const dragPreview = drag?.dateKey === dateKey ? (() => {
              let start = drag.startMinute;
              let end = drag.currentMinute;
              if (executionMode === "time_window") end = start + Number(durationMinutes || 0);
              if (end < start) [start, end] = [end, start];
              if (end === start) end = start + 5;
              return { start, end: Math.min(OBJECT_TASK_DAY_MINUTES, end) };
            })() : null;
            return (
              <div key={dateKey} className={cn("grid grid-cols-[116px_1fr] border-b border-border/60 last:border-b-0", today && "bg-primary/[0.035]")} style={{ minHeight: rowHeight }}>
                <div className={cn("sticky left-0 z-20 flex items-start justify-between gap-1 border-r border-border/70 bg-card/90 px-3 py-2 backdrop-blur-xl", today ? "text-primary" : "text-foreground")}><div><span className="block text-xs font-semibold capitalize">{formatObjectTaskDay(dateKey)}</span>{today ? <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold text-primary"><Clock3 className="h-2.5 w-2.5" /> Vandaag · {now.clock}</span> : whollyPast ? <span className="mt-1 inline-flex items-center gap-1 text-[9px] text-muted-foreground"><LockKeyhole className="h-2.5 w-2.5" /> Verleden</span> : null}</div>{allowDrawing && !whollyPast && boundary < OBJECT_TASK_DAY_MINUTES && <button type="button" className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => quickAdd(dateKey)} aria-label={`Taakmoment handmatig toevoegen op ${formatObjectTaskDay(dateKey)}`} title="Tijd handmatig instellen"><Plus className="h-3.5 w-3.5" /></button>}</div>
                <div
                  className={cn("relative touch-none select-none", allowDrawing && !whollyPast && "cursor-crosshair")}
                  style={{ height: rowHeight }}
                  onPointerDown={event => {
                    if (!allowDrawing || event.button !== 0 || whollyPast) return;
                    const minute = minuteAtPointer(event);
                    if (!isObjectTaskMomentEditable(dateKey, minute, now)) return;
                    event.currentTarget.setPointerCapture?.(event.pointerId);
                    setDrag({ dateKey, startMinute: minute, currentMinute: minute });
                  }}
                  onPointerMove={event => {
                    if (!drag || drag.dateKey !== dateKey) return;
                    setDrag(current => ({ ...current, currentMinute: minuteAtPointer(event) }));
                  }}
                  onPointerUp={event => finishDraw(event, dateKey)}
                  onPointerCancel={() => setDrag(null)}
                >
                  {HOUR_MARKERS.map(minute => <span key={minute} className="pointer-events-none absolute inset-y-0 border-l border-border/35" style={{ left: `${(minute / OBJECT_TASK_DAY_MINUTES) * 100}%` }} />)}
                  {pastWidth > 0 && <span className="pointer-events-none absolute inset-y-0 left-0 z-10 border-r border-border/60 bg-muted/45 [background-image:repeating-linear-gradient(135deg,transparent,transparent_5px,hsl(var(--border)/0.18)_5px,hsl(var(--border)/0.18)_6px)]" style={{ width: `${pastWidth}%` }} />}
                  {today && <span className="pointer-events-none absolute inset-y-0 z-30 w-px bg-destructive/80" style={{ left: `${(now.minute / OBJECT_TASK_DAY_MINUTES) * 100}%` }}><span className="absolute -top-px left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-destructive shadow-sm" /><span className="absolute left-1/2 top-1 -translate-x-1/2 rounded bg-destructive px-1 py-0.5 text-[8px] font-bold text-destructive-foreground shadow">{now.clock}</span></span>}
                  {allLayout.map(item => <TaskBlock key={`${item.entry._contextual ? "context" : "own"}:${item.entry.id}`} item={item} contextual={Boolean(item.entry._contextual)} editable={allowEntryEditing && !item.entry._contextual} now={now} onClick={onEntryClick} />)}
                  {dragPreview && <span className="pointer-events-none absolute top-2 z-40 h-8 rounded-md border border-primary/70 bg-primary/30 shadow-sm" style={{ left: `${(dragPreview.start / OBJECT_TASK_DAY_MINUTES) * 100}%`, width: `${Math.max(0.45, ((dragPreview.end - dragPreview.start) / OBJECT_TASK_DAY_MINUTES) * 100)}%` }}><span className="absolute left-1 top-1 text-[9px] font-semibold tabular-nums">{objectTaskMinutesToClock(dragPreview.start)}–{objectTaskMinutesToClock(dragPreview.end)}</span></span>}
                  {allLayout.length === 0 && !whollyPast && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground/60">{allowDrawing ? emptyLabel : "Geen taakmomenten"}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 bg-card/25 px-3 py-2 text-[10px] text-muted-foreground"><span>{allowDrawing ? executionMode === "continuous" ? "Sleep over de tijdlijn. Tijden snappen op 5 minuten; klik daarna op het blok voor herhaling." : `Klik op de tijdlijn om ${durationMinutes} minuten te plaatsen; klik daarna op het blok voor herhaling.` : allowEntryEditing ? "Klik op een toekomstig taakmoment om de reeks vanaf die datum te wijzigen." : "De taakmomenten in deze week zijn alleen-lezen."}</span><span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm border border-primary/40 bg-primary/20" /> Taakmoment <span className="ml-2 h-2 w-2 rounded-sm border border-amber-500/50 bg-amber-500/20" /> Planning controleren</span></footer>
    </section>
  );
}
