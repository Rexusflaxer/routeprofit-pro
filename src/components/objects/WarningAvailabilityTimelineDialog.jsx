import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WEEKDAY_OPTIONS } from "./objectWarningAddressConfig";
import { availableIntervalsByDay, scheduleIntervalsByKind } from "./warningAvailabilityTimeline";
import WarningAvailabilityHoverTooltip from "./WarningAvailabilityHoverTooltip";

const HOURS = Array.from({ length: 12 }, (_, index) => index * 2);
const TIME_LABELS = Array.from({ length: 13 }, (_, index) => index * 2);

const labelPosition = index => index === 0 ? "" : index === 12 ? "-translate-x-full" : "-translate-x-1/2";
const mondayOf = date => {
  const monday = new Date(date);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
};
const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};
const formatDate = date => new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "short" }).format(date);
const formatWeekRange = dates => `${formatDate(dates[0])} – ${formatDate(dates[6])}`;

export default function WarningAvailabilityTimelineDialog({ record, open, onOpenChange }) {
  const [hover, setHover] = useState(null);
  const [weekCount, setWeekCount] = useState(12);
  const [visibleWeek, setVisibleWeek] = useState(0);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const scrollRef = useRef(null);
  const firstWeekStart = mondayOf(new Date());
  const dates = Array.from({ length: weekCount * 7 }, (_, dayIndex) => addDays(firstWeekStart, dayIndex));
  const displayedWeekDates = WEEKDAY_OPTIONS.map((_, dayIndex) => addDays(firstWeekStart, visibleWeek * 7 + dayIndex));
  useEffect(() => {
    if (!open) return;
    setWeekCount(12);
    setVisibleWeek(0);
    setCanScrollUp(false);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 0 }));
  }, [open, record?.id]);
  const jumpWeek = step => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    const currentWeek = Math.floor(viewport.scrollTop / 336);
    const isOnMonday = Math.abs(viewport.scrollTop - currentWeek * 336) < 2;
    const targetWeek = step > 0 ? currentWeek + 1 : Math.max(0, currentWeek - (isOnMonday ? 1 : 0));
    viewport.scrollTo({ top: targetWeek * 336, behavior: "smooth" });
  };
  const handleScroll = event => {
    const viewport = event.currentTarget;
    setCanScrollUp(viewport.scrollTop > 1);
    setVisibleWeek(Math.floor(viewport.scrollTop / 336));
    if (viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 672) setWeekCount(count => count + 12);
  };
  const schedule = record?.availability_mode === "schedule" ? scheduleIntervalsByKind(record) : { available: availableIntervalsByDay(record), emergency: WEEKDAY_OPTIONS.map(() => []) };
  const handleTimelineMove = (event, date, dayIndex) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const minute = Math.min(1410, Math.max(0, Math.floor((((event.clientX - bounds.left) / bounds.width) * 1440) / 30) * 30));
    const available = schedule.available[dayIndex].find(interval => minute >= interval.start && minute < interval.end);
    const emergency = schedule.emergency[dayIndex].find(interval => minute >= interval.start && minute < interval.end);
    const interval = available || emergency;
    setHover({ x: Math.min(event.clientX + 14, window.innerWidth - 190), y: Math.min(event.clientY + 14, window.innerHeight - 76), day: formatDate(date), minute, interval, kind: available ? "available" : emergency ? "emergency" : null });
  };
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-hidden p-0 sm:max-w-6xl">
      <DialogHeader className="border-b border-border px-6 py-4">
        <DialogTitle>Bereikbaarheid van {record?.display_name || "waarschuwingsadres"}</DialogTitle>
        <DialogDescription>{formatWeekRange(displayedWeekDates)} · De standaard bereikbaarheid wordt herhaald voor iedere toekomstige week.</DialogDescription>
      </DialogHeader>
      <div className="overflow-auto px-4 pb-5">
        <div className="min-w-[900px]">
          <div className="flex h-9 bg-background">
            <span className="flex w-14 shrink-0 items-center justify-center">
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={!canScrollUp} onClick={() => jumpWeek(-1)} aria-label="Vorige week"><ChevronUp className="h-4 w-4" /></Button>
            </span>
            <div className="relative flex-1">{TIME_LABELS.map((hour, index) => <span key={hour} className={`absolute bottom-2 text-[10px] text-muted-foreground ${labelPosition(index)}`} style={{ left: `${(index / 12) * 100}%` }}>{String(hour).padStart(2, "0")}:00</span>)}</div>
          </div>
          <div ref={scrollRef} className="h-[336px] touch-pan-y snap-y snap-mandatory overflow-y-auto overscroll-contain" onScroll={handleScroll}>
            {dates.map((date, dateIndex) => {
              const dayIndex = dateIndex % 7;
              return <div key={date.toISOString()} className="flex snap-start snap-always">
                <span className="flex h-12 w-14 shrink-0 flex-col justify-center pr-2 leading-tight"><strong className="text-xs">{WEEKDAY_OPTIONS[dayIndex].shortLabel}</strong><span className="text-[10px] text-muted-foreground">{formatDate(date)}</span></span>
                <div className="relative h-12 flex-1 border-b border-r border-border" onMouseMove={event => handleTimelineMove(event, date, dayIndex)} onMouseLeave={() => setHover(null)}>
                  {HOURS.map((hour, index) => <div key={hour} className="absolute inset-y-0 border-l border-border/70" style={{ left: `${(index / 12) * 100}%`, width: `${100 / 12}%` }}><div className="absolute inset-y-0 left-1/2 border-l border-border/30" /></div>)}
                  {schedule.available[dayIndex].map((interval, index) => <div key={`available-${index}`} className="absolute inset-y-1 rounded-sm border border-primary/40 bg-primary/25" style={{ left: `${(interval.start / 1440) * 100}%`, width: `${((interval.end - interval.start) / 1440) * 100}%` }} />)}
                  {schedule.emergency[dayIndex].map((interval, index) => <div key={`emergency-${index}`} className="absolute inset-y-1 rounded-sm border border-chart-4/60 bg-chart-4/45" style={{ left: `${(interval.start / 1440) * 100}%`, width: `${((interval.end - interval.start) / 1440) * 100}%` }} />)}
                </div>
              </div>;
            })}
          </div>
          <div className="flex h-9">
            <span className="flex w-14 shrink-0 items-center justify-center">
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => jumpWeek(1)} aria-label="Volgende week"><ChevronDown className="h-4 w-4" /></Button>
            </span>
          </div>
        </div>
        <div className="sticky bottom-0 flex flex-wrap items-center gap-4 bg-background py-3 text-xs text-muted-foreground"><span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm border border-primary/40 bg-primary/25" /> Bereikbaar</span><span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm border border-chart-4/60 bg-chart-4/45" /> Alleen noodgevallen</span><span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm border border-border bg-card" /> Niet bereikbaar</span></div>
      </div>
      <WarningAvailabilityHoverTooltip hover={hover} />
    </DialogContent>
  </Dialog>;
}