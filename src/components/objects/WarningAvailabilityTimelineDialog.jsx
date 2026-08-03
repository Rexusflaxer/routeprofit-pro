import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
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
const WEEK_VARIANTS = {
  enter: direction => ({ y: direction * 336 }),
  center: { y: 0 },
  exit: direction => ({ y: direction * -336 }),
};

export default function WarningAvailabilityTimelineDialog({ record, open, onOpenChange }) {
  const [hover, setHover] = useState(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [direction, setDirection] = useState(1);
  const navigationLocked = useRef(false);
  const navigationTimer = useRef(null);
  const weekStart = addDays(mondayOf(new Date()), weekOffset * 7);
  const weekDates = WEEKDAY_OPTIONS.map((_, dayIndex) => addDays(weekStart, dayIndex));
  useEffect(() => { if (open) setWeekOffset(0); }, [open, record?.id]);
  useEffect(() => () => clearTimeout(navigationTimer.current), []);
  const changeWeek = step => {
    if (navigationLocked.current || (step < 0 && weekOffset === 0)) return;
    navigationLocked.current = true;
    setDirection(step);
    setHover(null);
    setWeekOffset(offset => Math.max(0, offset + step));
    clearTimeout(navigationTimer.current);
    navigationTimer.current = setTimeout(() => { navigationLocked.current = false; }, 420);
  };
  const schedule = record?.availability_mode === "schedule" ? scheduleIntervalsByKind(record) : { available: availableIntervalsByDay(record), emergency: WEEKDAY_OPTIONS.map(() => []) };
  const handleTimelineMove = (event, dayIndex) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const minute = Math.min(1410, Math.max(0, Math.floor((((event.clientX - bounds.left) / bounds.width) * 1440) / 30) * 30));
    const available = schedule.available[dayIndex].find(interval => minute >= interval.start && minute < interval.end);
    const emergency = schedule.emergency[dayIndex].find(interval => minute >= interval.start && minute < interval.end);
    const interval = available || emergency;
    setHover({ x: Math.min(event.clientX + 14, window.innerWidth - 190), y: Math.min(event.clientY + 14, window.innerHeight - 76), day: formatDate(weekDates[dayIndex]), minute, interval, kind: available ? "available" : emergency ? "emergency" : null });
  };
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-hidden p-0 sm:max-w-6xl">
      <DialogHeader className="border-b border-border px-6 py-4">
        <DialogTitle>Bereikbaarheid van {record?.display_name || "waarschuwingsadres"}</DialogTitle>
        <DialogDescription>{formatWeekRange(weekDates)} · De standaard bereikbaarheid wordt herhaald voor iedere toekomstige week.</DialogDescription>
      </DialogHeader>
      <div className="overflow-auto px-4 pb-5">
        <div className="min-w-[900px]">
          <div className="sticky top-0 z-20 flex h-9 bg-background">
            <span className="flex w-14 shrink-0 items-center justify-center">
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={weekOffset === 0} onClick={() => changeWeek(-1)} aria-label="Vorige week"><ChevronUp className="h-4 w-4" /></Button>
            </span>
            <div className="relative flex-1">{TIME_LABELS.map((hour, index) => <span key={hour} className={`absolute bottom-2 text-[10px] text-muted-foreground ${labelPosition(index)}`} style={{ left: `${(index / 12) * 100}%` }}>{String(hour).padStart(2, "0")}:00</span>)}</div>
          </div>
          <div className="relative h-[336px] overflow-hidden" onWheel={event => { if (Math.abs(event.deltaY) < 10) return; event.preventDefault(); changeWeek(event.deltaY > 0 ? 1 : -1); }}>
            <AnimatePresence initial={false} custom={direction}>
              <motion.div className="absolute inset-0" key={weekOffset} custom={direction} variants={WEEK_VARIANTS} initial="enter" animate="center" exit="exit" transition={{ duration: 0.38, ease: [0.4, 0, 0.2, 1] }}>
                {weekDates.map((date, dayIndex) => <div key={date.toISOString()} className="flex">
                  <span className="flex h-12 w-14 shrink-0 items-center pr-2 text-xs font-semibold">{formatDate(date)}</span>
                  <div className="relative h-12 flex-1 border-b border-r border-border" onMouseMove={event => handleTimelineMove(event, dayIndex)} onMouseLeave={() => setHover(null)}>
                    {HOURS.map((hour, index) => <div key={hour} className="absolute inset-y-0 border-l border-border/70" style={{ left: `${(index / 12) * 100}%`, width: `${100 / 12}%` }}><div className="absolute inset-y-0 left-1/2 border-l border-border/30" /></div>)}
                    {schedule.available[dayIndex].map((interval, index) => <div key={`available-${index}`} className="absolute inset-y-1 rounded-sm border border-primary/40 bg-primary/25" style={{ left: `${(interval.start / 1440) * 100}%`, width: `${((interval.end - interval.start) / 1440) * 100}%` }} />)}
                    {schedule.emergency[dayIndex].map((interval, index) => <div key={`emergency-${index}`} className="absolute inset-y-1 rounded-sm border border-chart-4/60 bg-chart-4/45" style={{ left: `${(interval.start / 1440) * 100}%`, width: `${((interval.end - interval.start) / 1440) * 100}%` }} />)}
                  </div>
                </div>)}
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="flex h-9">
            <span className="flex w-14 shrink-0 items-center justify-center">
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => changeWeek(1)} aria-label="Volgende week"><ChevronDown className="h-4 w-4" /></Button>
            </span>
          </div>
        </div>
        <div className="sticky bottom-0 flex flex-wrap items-center gap-4 bg-background py-3 text-xs text-muted-foreground"><span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm border border-primary/40 bg-primary/25" /> Bereikbaar</span><span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm border border-chart-4/60 bg-chart-4/45" /> Alleen noodgevallen</span><span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm border border-border bg-card" /> Niet bereikbaar</span></div>
      </div>
      <WarningAvailabilityHoverTooltip hover={hover} />
    </DialogContent>
  </Dialog>;
}