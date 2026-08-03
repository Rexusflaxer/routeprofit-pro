import React, { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Pencil } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WEEKDAY_OPTIONS } from "./objectWarningAddressConfig";
import { availableIntervalsByDay, scheduleIntervalsByKind } from "./warningAvailabilityTimeline";
import WarningAvailabilityHoverTooltip from "./WarningAvailabilityHoverTooltip";
import WarningOverrideInfoMenu from "./WarningOverrideInfoMenu";
import WarningOverrideSaveReasonDialog from "./WarningOverrideSaveReasonDialog";
import WarningTimelineEditToolbar from "./WarningTimelineEditToolbar";
import WarningTimelineRow from "./WarningTimelineRow";
import { intervalsToSlots, localDateKey, overrideForDate, overrideIntervalsByKind, slotsToOverridePeriods } from "./warningAvailabilityOverrides";

const TIME_LABELS = Array.from({ length: 13 }, (_, index) => index * 2);
const labelPosition = index => index === 0 ? "" : index === 12 ? "-translate-x-full" : "-translate-x-1/2";
const mondayOf = date => { const monday = new Date(date); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7)); return monday; };
const addDays = (date, days) => { const next = new Date(date); next.setDate(next.getDate() + days); return next; };
const formatDate = date => new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "short" }).format(date);

export default function WarningAvailabilityTimelineDialog({ record, open, onOpenChange, onOverridesChanged }) {
  const [hover, setHover] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const [weekCount, setWeekCount] = useState(12);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [editing, setEditing] = useState(false);
  const [tool, setTool] = useState("available");
  const [painting, setPainting] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [selection, setSelection] = useState(null);
  const [saveReasonOpen, setSaveReasonOpen] = useState(false);
  const draftsRef = useRef({});
  const scrollRef = useRef(null);
  const dates = Array.from({ length: weekCount * 7 }, (_, dayIndex) => addDays(mondayOf(new Date()), dayIndex));
  const schedule = record?.availability_mode === "schedule" ? scheduleIntervalsByKind(record) : { available: availableIntervalsByDay(record), emergency: WEEKDAY_OPTIONS.map(() => []) };
  const refresh = async () => { await onOverridesChanged?.(); };

  const saveDrafts = useMutation({
    mutationFn: async reason => {
      const keys = new Set(Object.keys(draftsRef.current));
      const existing = (record?.specific_availability_overrides || []).filter(item => item.dates?.some(date => keys.has(date)));
      await Promise.all(existing.map(item => {
        const remaining = item.dates.filter(date => !keys.has(date));
        return remaining.length ? base44.entities.WarningAddressAvailabilityOverride.update(item.id, { dates: remaining }) : base44.entities.WarningAddressAvailabilityOverride.delete(item.id);
      }));
      return base44.entities.WarningAddressAvailabilityOverride.bulkCreate([...keys].map(date => ({
        warning_address_id: record.id,
        customer_id: record.customer_id,
        object_id: record.object_id,
        dates: [date],
        availability_status: null,
        availability_periods: slotsToOverridePeriods(draftsRef.current[date]),
        reason: reason || null,
      })));
    },
    onSuccess: async () => { await refresh(); draftsRef.current = {}; setDrafts({}); setEditing(false); setSaveReasonOpen(false); },
  });
  const removeOverride = useMutation({
    mutationFn: async () => {
      const remaining = selection.override.dates.filter(date => date !== localDateKey(selection.date));
      return remaining.length ? base44.entities.WarningAddressAvailabilityOverride.update(selection.override.id, { dates: remaining }) : base44.entities.WarningAddressAvailabilityOverride.delete(selection.override.id);
    },
    onSuccess: async () => { await refresh(); setSelection(null); },
  });

  useEffect(() => {
    if (!open) return;
    setWeekCount(12); setCanScrollUp(false); setEditing(false); setSelection(null); setSaveReasonOpen(false); draftsRef.current = {}; setDrafts({});
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 0 }));
  }, [open, record?.id]);
  useEffect(() => {
    const stop = () => setPainting(false);
    window.addEventListener("pointerup", stop);
    return () => window.removeEventListener("pointerup", stop);
  }, []);
  useEffect(() => {
    if (!open) return;
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, [open]);

  const intervalsFor = date => {
    const key = localDateKey(date);
    if (drafts[key]) return overrideIntervalsByKind({ availability_periods: slotsToOverridePeriods(drafts[key]) });
    const override = overrideForDate(record, date);
    if (override) return overrideIntervalsByKind(override);
    const dayIndex = (date.getDay() + 6) % 7;
    return { available: schedule.available[dayIndex], emergency: schedule.emergency[dayIndex] };
  };
  const paint = (date, slot, start) => {
    if (start) setPainting(true);
    const key = localDateKey(date);
    const intervals = intervalsFor(date);
    const current = draftsRef.current[key] || intervalsToSlots(intervals.available, intervals.emergency);
    const next = [...current];
    next[slot] = tool;
    draftsRef.current = { ...draftsRef.current, [key]: next };
    setDrafts(draftsRef.current);
  };
  const showHover = (event, date, intervals, override) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const minute = Math.min(1410, Math.max(0, Math.floor((((event.clientX - bounds.left) / bounds.width) * 1440) / 30) * 30));
    const available = intervals.available.find(interval => minute >= interval.start && minute < interval.end);
    const emergency = intervals.emergency.find(interval => minute >= interval.start && minute < interval.end);
    setHover({ x: Math.min(event.clientX + 14, window.innerWidth - 190), y: Math.min(event.clientY + 14, window.innerHeight - 110), day: formatDate(date), minute, interval: available || emergency, kind: available ? "available" : emergency ? "emergency" : null, adjusted: Boolean(override), reason: override?.reason });
  };
  const jumpWeek = step => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    const week = Math.floor(viewport.scrollTop / 336);
    const onMonday = Math.abs(viewport.scrollTop - week * 336) < 2;
    viewport.scrollTo({ top: (step > 0 ? week + 1 : Math.max(0, week - (onMonday ? 1 : 0))) * 336, behavior: "smooth" });
  };
  const handleScroll = event => {
    const viewport = event.currentTarget;
    setCanScrollUp(viewport.scrollTop > 1);
    if (viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 672) setWeekCount(count => count + 12);
  };
  const cancelEditing = () => { draftsRef.current = {}; setDrafts({}); setEditing(false); };
  const mutationError = saveDrafts.error || removeOverride.error;

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-hidden p-0 sm:max-w-6xl">
      <DialogHeader className="flex-row items-center justify-between space-y-0 px-6 py-4 pr-14">
        <DialogTitle>Bereikbaarheid van {record?.display_name || "waarschuwingsadres"}</DialogTitle>
        <Button type="button" variant={editing ? "secondary" : "ghost"} size="sm" onClick={() => editing ? cancelEditing() : setEditing(true)}><Pencil className="h-4 w-4" /> {editing ? "Bewerken actief" : "Wijzigen"}</Button>
      </DialogHeader>
      <div className="overflow-auto px-4 pb-5">
        {editing && <WarningTimelineEditToolbar tool={tool} onToolChange={setTool} changedCount={Object.keys(drafts).length} saving={saveDrafts.isPending} onCancel={cancelEditing} onSave={() => setSaveReasonOpen(true)} />}
        <div className="min-w-[900px]">
          <div className="flex h-9 bg-background">
            <span className="flex w-14 shrink-0 items-center justify-center"><Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={!canScrollUp} onClick={() => jumpWeek(-1)} aria-label="Vorige week"><ChevronUp className="h-4 w-4" /></Button></span>
            <div className="relative flex-1">{TIME_LABELS.map((hour, index) => <span key={hour} className={`absolute bottom-2 text-[10px] text-muted-foreground ${labelPosition(index)}`} style={{ left: `${(index / 12) * 100}%` }}>{String(hour).padStart(2, "0")}:00</span>)}</div>
          </div>
          <div ref={scrollRef} className="h-[336px] touch-pan-y snap-y snap-mandatory overflow-y-auto overscroll-contain" onScroll={handleScroll}>
            {dates.map(date => {
              const dayIndex = (date.getDay() + 6) % 7;
              const override = overrideForDate(record, date);
              const intervals = intervalsFor(date);
              return <WarningTimelineRow key={date.toISOString()} date={date} dayIndex={dayIndex} now={now} available={intervals.available} emergency={intervals.emergency} override={override || Boolean(drafts[localDateKey(date)])} editing={editing} painting={painting} onPaint={(slot, start) => paint(date, slot, start)} onHover={event => showHover(event, date, intervals, override)} onHoverEnd={() => setHover(null)} onOpenOverride={event => setSelection({ date, override, x: event.clientX, y: event.clientY })} />;
            })}
          </div>
          <div className="flex h-9"><span className="flex w-14 shrink-0 items-center justify-center"><Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => jumpWeek(1)} aria-label="Volgende week"><ChevronDown className="h-4 w-4" /></Button></span></div>
        </div>
        {mutationError && <p className="mb-2 text-xs text-destructive">{mutationError.message}</p>}
        <div className="sticky bottom-0 flex flex-wrap items-center gap-4 bg-background py-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm border border-primary/40 bg-primary/25" /> Bereikbaar</span>
          <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm border border-chart-4/60 bg-chart-4/45" /> Alleen noodgevallen</span>
          <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm border border-border bg-card" /> Niet bereikbaar</span>
          <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm border border-dashed border-primary/60 bg-primary/5" /> Aangepaste datum — klik om te beheren</span>
        </div>
      </div>
      <WarningAvailabilityHoverTooltip hover={hover} />
      <WarningOverrideInfoMenu selection={selection} onClose={() => setSelection(null)} onRemove={() => removeOverride.mutate()} pending={removeOverride.isPending} />
      <WarningOverrideSaveReasonDialog open={saveReasonOpen} changedCount={Object.keys(drafts).length} pending={saveDrafts.isPending} onClose={() => setSaveReasonOpen(false)} onConfirm={reason => saveDrafts.mutate(reason)} />
    </DialogContent>
  </Dialog>;
}