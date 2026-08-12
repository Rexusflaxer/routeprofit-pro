import React, { useEffect, useMemo, useRef, useState } from "react";
import { Droppable } from "@hello-pangea/dnd";
import {
  AlertTriangle,
  Check,
  Clock3,
  Copy,
  GripHorizontal,
  Layers3,
  Loader2,
  MapPin,
  MoreHorizontal,
  MoveRight,
  Route,
  Scissors,
  Trash2,
  UserMinus,
  UserRound,
  UserRoundPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  formatMinutesAsHours,
  getOccurrencePlanningState,
  getShiftInterval,
  getTaskOccurrenceDayProjection,
  isPlanningObjectActive,
  isPlanningPersonnelActive,
  parseDateKey,
  toDateKey,
} from "@/components/planning/planningDomain";
import {
  MAX_AUTOMATIC_TASK_SERVICE_MINUTES,
  clockToTimelineMinutes,
  getTaskTimelineDemand,
  getTaskTimelineGaps,
  resizeTimelineInterval,
  timelineMinutesToClock,
} from "@/components/planning/planningTimelineDomain";
import { cn } from "@/lib/utils";

const dayFormatter = new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "short" });

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function personnelName(personnel) {
  return personnel?.name
    || personnel?.display_name
    || [personnel?.call_name || personnel?.first_name, personnel?.name_prefix, personnel?.last_name]
      .filter(Boolean)
      .join(" ")
    || "Onbekende medewerker";
}

function activeAssignments(assignments) {
  return assignments.filter(item => item.status !== "removed");
}

function assignmentWarningCount(assignment) {
  if (Array.isArray(assignment?.warnings)) return assignment.warnings.length;
  if (Array.isArray(assignment?.warning_snapshot)) return assignment.warning_snapshot.length;
  return Number(assignment?.warning_count || 0);
}

function shiftWarningCount(shift, assignments) {
  const assignmentWarnings = assignments.reduce((sum, item) => sum + assignmentWarningCount(item), 0);
  const compositionWarnings = Array.isArray(shift?.service_context_snapshot?.composition_warnings)
    ? shift.service_context_snapshot.composition_warnings.length
    : 0;
  return assignmentWarnings + compositionWarnings;
}

function timeValue(value) {
  const [hours = 0, minutes = 0] = String(value || "00:00").split(":").map(Number);
  return (Number(hours) || 0) * 60 + (Number(minutes) || 0);
}

function sortByStart(items, getStart = item => item.start_time) {
  return [...items].sort((left, right) => (
    timeValue(getStart(left)) - timeValue(getStart(right))
    || String(left.name || left.task_name_snapshot || "").localeCompare(
      String(right.name || right.task_name_snapshot || ""),
      "nl",
    )
  ));
}

function appendToMap(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

function clockLabel(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function intervalDaySlices(record) {
  const interval = getShiftInterval(record);
  if (!interval.valid) return [];
  let dayStart = parseDateKey(toDateKey(interval.start));
  dayStart.setHours(0, 0, 0, 0);
  const slices = [];

  for (let index = 0; index < 370 && dayStart < interval.end; index += 1) {
    const nextDay = new Date(dayStart);
    nextDay.setDate(nextDay.getDate() + 1);
    const sliceStart = new Date(Math.max(interval.start.getTime(), dayStart.getTime()));
    const sliceEnd = new Date(Math.min(interval.end.getTime(), nextDay.getTime()));
    if (sliceEnd > sliceStart) {
      slices.push({
        date: toDateKey(dayStart),
        startTime: clockLabel(sliceStart),
        endTime: sliceEnd.getTime() === nextDay.getTime() ? "24:00" : clockLabel(sliceEnd),
        continuesBefore: interval.start < dayStart,
        continuesAfter: interval.end > nextDay,
      });
    }
    dayStart = nextDay;
  }
  return slices;
}

function mapAssignmentsToSlots(assignments, requiredCount) {
  const bySlot = new Map();
  const legacy = [];
  assignments.forEach(assignment => {
    const rawSlot = assignment.slot_index;
    const hasExplicitSlot = rawSlot !== null && rawSlot !== undefined && rawSlot !== "";
    const slotIndex = hasExplicitSlot ? Number(rawSlot) : null;
    if (Number.isInteger(slotIndex) && slotIndex >= 0 && slotIndex < requiredCount) {
      if (!bySlot.has(slotIndex)) bySlot.set(slotIndex, assignment);
      return;
    }
    if (!hasExplicitSlot) legacy.push(assignment);
  });
  let legacyIndex = 0;
  for (let slotIndex = 0; slotIndex < requiredCount && legacyIndex < legacy.length; slotIndex += 1) {
    if (bySlot.has(slotIndex)) continue;
    bySlot.set(slotIndex, legacy[legacyIndex]);
    legacyIndex += 1;
  }
  return bySlot;
}

function OpenTaskIntervalCard({
  occurrence,
  planningState,
  projection,
  gap,
  onSelectOccurrence,
  onCreateOpenTaskSlice,
  mutationPending,
}) {
  const dropServiceDate = projection?.date || occurrence.service_date;
  const proposedEnd = gap.startMinute + Math.min(
    MAX_AUTOMATIC_TASK_SERVICE_MINUTES,
    gap.allocatableMinutes,
  );
  const proposedEndTime = timelineMinutesToClock(proposedEnd);
  const droppableId = `occurrence-gap:${encodeURIComponent(String(occurrence.id))}:${dropServiceDate}:${String(gap.startMinute).padStart(4, "0")}:${String(proposedEnd).padStart(4, "0")}`;
  const flexible = occurrence.execution_mode === "time_window";
  const coverage = planningState?.coverage;

  return (
    <Droppable
      droppableId={droppableId}
      type="PERSONNEL"
      isDropDisabled={mutationPending}
    >
      {(provided, snapshot) => (
        <article
          ref={provided.innerRef}
          {...provided.droppableProps}
          data-droppable-id={droppableId}
          data-task-occurrence-id={occurrence.id}
          data-open-task-interval={`${gap.startTime}-${gap.endTime}`}
          data-planning-item-kind="open-task"
          data-planning-start-minute={gap.startMinute}
          data-planning-width="full"
          data-start-minute={gap.startMinute}
          className={cn(
            "w-full rounded-md border border-dashed border-rose-300 bg-rose-50/75 p-2 text-left shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-colors dark:border-rose-800 dark:bg-rose-950/30",
            coverage?.status === "partial" && "border-amber-300 bg-amber-50/80 dark:border-amber-800 dark:bg-amber-950/30",
            snapshot.isDraggingOver && "border-primary bg-primary/10 ring-2 ring-primary/25",
          )}
        >
          <div className="flex items-start gap-2">
            <button
              type="button"
              className="min-w-0 flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onSelectOccurrence?.(occurrence)}
            >
              <span className="flex min-w-0 items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-semibold">{occurrence.task_name_snapshot || "Open taak"}</span>
                  <span className="mt-0.5 flex items-center gap-1 text-[9px] font-medium tabular-nums text-muted-foreground">
                    <Clock3 className="h-2.5 w-2.5" />
                    {gap.startTime}–{gap.endTime}
                    {projection?.continuesBefore ? " · vervolg" : projection?.continuesAfter ? " · loopt door" : ""}
                  </span>
                </span>
                <span className="shrink-0 rounded bg-background/85 px-1.5 py-0.5 text-[9px] font-semibold text-rose-700 dark:text-rose-300">
                  Open
                </span>
              </span>
              <span className="compact-hide mt-1 block text-[9px] text-muted-foreground" data-planning-dimensions="open-time">
                {flexible
                  ? `${formatMinutesAsHours(gap.allocatableMinutes)} te plannen binnen dit venster`
                  : `${formatMinutesAsHours(gap.durationMinutes)} nog niet ingepland`}
              </span>
            </button>
            <button
              type="button"
              disabled={mutationPending}
              onClick={() => onCreateOpenTaskSlice?.({
                occurrence,
                serviceDate: dropServiceDate,
                startTime: gap.startTime,
                endTime: proposedEndTime,
              })}
              className="compact-hide inline-flex h-7 w-7 shrink-0 items-center justify-center rounded bg-background/85 text-muted-foreground shadow-sm hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Open dienst maken ${gap.startTime}–${proposedEndTime}`}
              title={`Open dienst maken ${gap.startTime}–${proposedEndTime}`}
            >
              <Scissors className="h-3 w-3" />
            </button>
          </div>
          <p className="compact-hide mt-1.5 flex items-center gap-1 border-t border-current/10 pt-1.5 text-[9px] font-medium text-muted-foreground">
            <UserRoundPlus className="h-2.5 w-2.5" />
            {snapshot.isDraggingOver
              ? `Loslaten voor dienst ${gap.startTime}–${proposedEndTime}`
              : "Sleep een medewerker naar dit open taakdeel"}
          </p>
          <div className="hidden">{provided.placeholder}</div>
        </article>
      )}
    </Droppable>
  );
}

function ShiftSlot({ shift, slotIndex, assignment, resourceKey, serviceDate, onSelect, onUnassign, disabled = false }) {
  const droppableId = `slot:${shift.id}:${slotIndex}:${serviceDate}:${encodeURIComponent(resourceKey)}`;
  return (
    <Droppable droppableId={droppableId} type="PERSONNEL" isDropDisabled={Boolean(assignment) || disabled}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          data-droppable-id={droppableId}
          className={cn(
            "flex min-h-7 items-center gap-1 rounded border px-1.5 py-1 text-[9px]",
            assignment ? "border-border bg-background/85" : "border-dashed border-border bg-background/55 text-muted-foreground",
            snapshot.isDraggingOver && "border-primary bg-primary/10 text-primary ring-2 ring-primary/25",
          )}
        >
          {assignment ? (
            <>
              <button type="button" disabled={disabled} onClick={onSelect} className="min-w-0 flex-1 truncate text-left font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait">
                {assignment.personnel_name || assignment.personnel_name_snapshot || "Medewerker"}
              </button>
              <button type="button" disabled={disabled} onClick={() => onUnassign?.(assignment)} className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:cursor-wait disabled:opacity-50" aria-label={`${assignment.personnel_name || "Medewerker"} vrijmaken`}>
                <UserMinus className="h-2.5 w-2.5" />
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={disabled}
              onClick={onSelect}
              className="flex min-w-0 flex-1 items-center gap-1 text-left font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait"
              aria-label={`Open plaats voor ${shift.name || shift.service_name_snapshot || "dienst"} bekijken`}
            >
              <UserRoundPlus className="h-2.5 w-2.5" />
              <span className="truncate">{snapshot.isDraggingOver ? "Loslaten" : "Open plaats"}</span>
            </button>
          )}
          <div className="hidden">{provided.placeholder}</div>
        </div>
      )}
    </Droppable>
  );
}

const SERVICE_RESIZE_PIXELS_PER_STEP = 2;

function ServiceCardResizeHandle({
  edge,
  startMinute,
  endMinute,
  minMinute,
  maxMinute,
  preview,
  onPreview,
  onCommit,
  onCancel,
  disabled,
  label,
}) {
  const cleanupRef = useRef(null);
  const current = preview || { startMinute, endMinute };
  const value = edge === "start" ? current.startMinute : current.endMinute;
  const propose = pointerMinute => resizeTimelineInterval({
    startMinute: current.startMinute,
    endMinute: current.endMinute,
    edge,
    pointerMinute,
    minMinute,
    maxMinute,
    snapMinutes: 5,
    minimumDurationMinutes: 5,
  });

  useEffect(() => () => cleanupRef.current?.(), []);

  const handlePointerDown = event => {
    if (disabled || (event.button != null && event.button !== 0)) return;
    event.preventDefault();
    event.stopPropagation();
    cleanupRef.current?.();
    const initialPointerY = Number(event.clientY) || 0;
    const initialBoundaryMinute = value;
    let latest = current;

    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      cleanupRef.current = null;
    };
    const move = pointerEvent => {
      const stepDelta = Math.round(
        ((Number(pointerEvent.clientY) || 0) - initialPointerY) / SERVICE_RESIZE_PIXELS_PER_STEP,
      );
      const proposal = propose(initialBoundaryMinute + stepDelta * 5);
      if (!proposal) return;
      latest = proposal;
      onPreview?.(proposal);
    };
    const finish = () => {
      cleanup();
      if (latest.startMinute !== startMinute || latest.endMinute !== endMinute) onCommit?.(latest);
      else onCancel?.();
    };
    const cancel = () => {
      cleanup();
      onCancel?.();
    };

    cleanupRef.current = cleanup;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
  };

  const handleKeyDown = event => {
    if (disabled) return;
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel?.();
      return;
    }
    if (event.key === "Enter" && preview) {
      event.preventDefault();
      onCommit?.(preview);
      return;
    }
    if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 60 : 5;
    const proposal = propose(value + (event.key === "ArrowUp" ? -step : step));
    if (proposal) onPreview?.(proposal);
  };

  return (
    <button
      type="button"
      role="slider"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={Math.round(minMinute)}
      aria-valuemax={Math.round(maxMinute)}
      aria-valuenow={Math.round(value)}
      aria-valuetext={timelineMinutesToClock(Math.round(value)) || ""}
      data-service-resize-edge={edge}
      disabled={disabled}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      onBlur={() => {
        if (preview) onCancel?.();
      }}
      className={cn(
        "absolute left-1/2 z-30 flex h-3 w-20 -translate-x-1/2 touch-none items-center justify-center text-primary/70 transition-colors hover:text-primary focus:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-35",
        edge === "start" ? "top-0 cursor-n-resize" : "bottom-0 cursor-s-resize",
      )}
      title={`${edge === "start" ? "Bovenrand" : "Onderrand"} slepen · pijltjes 5 min · Shift 60 min · Enter opslaan`}
    >
      <span className="flex h-1.5 w-12 items-center justify-center rounded-full border border-primary/25 bg-background/95 shadow-sm">
        <GripHorizontal className="h-2.5 w-2.5" />
      </span>
    </button>
  );
}

function MatrixShiftBlock({
  shift,
  projections = [],
  assignments,
  segments,
  occurrence,
  allOccurrenceSegments = [],
  resourceKey,
  serviceDate,
  selected,
  onSelect,
  onUnassign,
  onMove,
  onCopy,
  onEditComposition,
  onCancelComposition,
  onResizeTaskSegment,
  mutationPending,
}) {
  const requiredCount = Math.max(1, Number(shift.required_count || 1));
  const currentAssignments = activeAssignments(assignments);
  const assignmentsBySlot = mapAssignmentsToSlots(currentAssignments, requiredCount);
  const warnings = shiftWarningCount(shift, currentAssignments);
  const activeSegments = segments.filter(item => item.status !== "removed");
  const linkedObjectCount = new Set([
    ...(shift.object_ids || []),
    ...activeSegments.map(item => item.object_id),
  ].filter(Boolean).map(String)).size;
  const orderedProjections = [...projections].sort((left, right) => (
    timeValue(left.slice?.startTime || left.segment?.start_time || shift.start_time)
      - timeValue(right.slice?.startTime || right.segment?.start_time || shift.start_time)
  ));
  const firstProjection = orderedProjections[0] || null;
  const lastProjection = orderedProjections.at(-1) || firstProjection;
  const projectionSegment = firstProjection?.segment || null;
  const segmentProjections = orderedProjections.filter(item => item.segment);
  const baseStartTime = firstProjection?.slice?.startTime || projectionSegment?.start_time || shift.start_time || "--:--";
  const baseEndTime = lastProjection?.slice?.endTime || lastProjection?.segment?.end_time || shift.end_time || "--:--";
  const baseStartMinute = clockToTimelineMinutes(baseStartTime);
  const baseEndMinute = clockToTimelineMinutes(baseEndTime);
  const continuesBefore = orderedProjections.some(item => item.slice?.continuesBefore);
  const continuesAfter = orderedProjections.some(item => item.slice?.continuesAfter);
  const crossesDate = projectionSegment?.end_date
    && projectionSegment.end_date !== (projectionSegment.start_date || shift.service_date);
  const resizeEligible = Boolean(
    occurrence
    && shift.source_type === "task"
    && activeSegments.length === 1
    && segmentProjections.length === 1,
  );
  const demand = resizeEligible ? getTaskTimelineDemand(occurrence, serviceDate) : null;
  const canResizeDirectly = Boolean(
    resizeEligible
    && demand
    && baseStartMinute != null
    && baseEndMinute != null
    && baseEndMinute > baseStartMinute,
  );
  const otherProjections = canResizeDirectly
    ? allOccurrenceSegments
      .filter(item => item.status !== "removed" && String(item.id) !== String(projectionSegment.id))
      .map(item => getTaskOccurrenceDayProjection({
        service_date: item.start_date,
        end_date: item.end_date,
        window_start_time: item.start_time,
        window_end_time: item.end_time,
      }, serviceDate))
      .filter(Boolean)
      .map(item => ({
        startMinute: clockToTimelineMinutes(item.startTime),
        endMinute: clockToTimelineMinutes(item.endTime),
      }))
      .filter(item => item.startMinute != null && item.endMinute != null)
    : [];
  const previousEnd = canResizeDirectly
    ? Math.max(demand.startMinute, ...otherProjections
      .filter(item => item.endMinute <= baseStartMinute)
      .map(item => item.endMinute))
    : 0;
  const nextStart = canResizeDirectly
    ? Math.min(demand.endMinute, ...otherProjections
      .filter(item => item.startMinute >= baseEndMinute)
      .map(item => item.startMinute))
    : 24 * 60;
  const [resizePreview, setResizePreview] = useState(null);
  const [committedResizePreview, setCommittedResizePreview] = useState(null);
  const [resizeSaving, setResizeSaving] = useState(false);
  const shownResize = resizePreview || committedResizePreview;
  const displayedStartTime = shownResize
    ? timelineMinutesToClock(shownResize.startMinute)
    : baseStartTime;
  const displayedEndTime = shownResize
    ? timelineMinutesToClock(shownResize.endMinute)
    : baseEndTime;
  const isPending = shift._optimistic_pending === true;

  useEffect(() => {
    setResizePreview(null);
    setCommittedResizePreview(null);
    setResizeSaving(false);
  }, [projectionSegment?.id, serviceDate]);

  useEffect(() => {
    if (!committedResizePreview) return;
    if (
      committedResizePreview.startMinute === baseStartMinute
      && committedResizePreview.endMinute === baseEndMinute
    ) {
      setCommittedResizePreview(null);
    }
  }, [baseEndMinute, baseStartMinute, committedResizePreview]);

  const commitResize = async proposal => {
    const slice = firstProjection?.slice;
    const startBoundary = slice?.continuesBefore
      ? {
          date: projectionSegment.start_date || projectionSegment.service_date || shift.service_date,
          time: projectionSegment.start_time || shift.start_time,
        }
      : timelineBoundary(serviceDate, proposal.startMinute);
    const endBoundary = slice?.continuesAfter
      ? {
          date: projectionSegment.end_date || projectionSegment.start_date || projectionSegment.service_date || shift.end_date || shift.service_date,
          time: projectionSegment.end_time || shift.end_time,
        }
      : timelineBoundary(serviceDate, proposal.endMinute);
    setResizePreview(null);
    setCommittedResizePreview(proposal);
    setResizeSaving(true);
    try {
      const result = await onResizeTaskSegment?.({
        occurrence,
        serviceDate,
        shift,
        segment: projectionSegment,
        startDate: startBoundary.date,
        endDate: endBoundary.date,
        startTime: startBoundary.time,
        endTime: endBoundary.time,
      });
      if (!result) setCommittedResizePreview(null);
    } catch {
      setCommittedResizePreview(null);
    } finally {
      setResizeSaving(false);
    }
  };

  return (
    <article className={cn(
      "group/service relative w-full rounded-md border border-l-[3px] border-border border-l-primary bg-card p-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
      shift.status === "draft" && "border-primary/35 border-l-primary",
      currentAssignments.length < requiredCount && "border-amber-300 border-l-amber-500 bg-amber-50/55 dark:border-amber-800 dark:bg-amber-950/25",
      isPending && "animate-pulse border-primary/45 bg-primary/[0.04]",
      selected && "border-primary ring-2 ring-primary/20",
    )}
      data-shift-id={shift.id}
      data-service-block="true"
      data-planning-item-kind="service"
      data-planning-start-minute={timeValue(displayedStartTime)}
      data-planning-width="full"
      data-segment-id={segmentProjections.length === 1 ? projectionSegment?.id : undefined}
      data-resize-saving={resizeSaving ? "true" : "false"}
    >
      {canResizeDirectly && !firstProjection?.slice?.continuesBefore && (
        <ServiceCardResizeHandle
          edge="start"
          startMinute={baseStartMinute}
          endMinute={baseEndMinute}
          minMinute={previousEnd}
          maxMinute={baseEndMinute - 5}
          preview={shownResize}
          onPreview={setResizePreview}
          onCommit={commitResize}
          onCancel={() => setResizePreview(null)}
          disabled={mutationPending || isPending || resizeSaving || Boolean(committedResizePreview)}
          label={`Begintijd van ${shift.name || shift.service_name_snapshot || "dienst"} aanpassen`}
        />
      )}
      <div className="flex items-start gap-1">
        <button type="button" disabled={mutationPending || isPending} onClick={onSelect} className="min-w-0 flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait">
          <span className="flex min-w-0 items-center gap-1">
            {linkedObjectCount > 1 && <Layers3 className="h-3 w-3 shrink-0 text-primary" aria-label="Samengestelde dienst" />}
            <span className="truncate text-[10px] font-semibold">{shift.name || shift.service_name_snapshot || "Dienst"}</span>
            {isPending && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" aria-label="Dienst wordt opgeslagen" />}
            {resizeSaving && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" aria-label="Diensttijd wordt opgeslagen" />}
            {shift.status === "published" && <Check className="h-3 w-3 shrink-0 text-emerald-600" aria-label="Gepubliceerd" />}
          </span>
          <span className="mt-0.5 block text-[9px] text-muted-foreground">
            {displayedStartTime}–{displayedEndTime}
            {continuesBefore ? " · vervolg" : continuesAfter ? " · loopt door" : crossesDate ? " +1" : ""}
            {linkedObjectCount > 1 ? ` · ${linkedObjectCount} objecten` : ""}
          </span>
          {segmentProjections.length === 1 && (
            <span className="compact-hide mt-0.5 block truncate text-[9px] font-medium text-primary">
              {projectionSegment.task_name_snapshot || projectionSegment.object_name_snapshot || "Taaksegment"}
            </span>
          )}
          {segmentProjections.length > 1 && (
            <span className="compact-hide mt-1 block space-y-0.5 border-t border-border/70 pt-1">
              {segmentProjections.map(({ segment, slice }, index) => (
                <span
                  key={`${segment.id || index}:${slice?.date || ""}`}
                  className="flex min-w-0 items-center gap-1 text-[8px] text-muted-foreground"
                  data-segment-id={segment.id || undefined}
                >
                  <span className="shrink-0 tabular-nums">{slice?.startTime || segment.start_time}–{slice?.endTime || segment.end_time}</span>
                  <span className="truncate">{segment.task_name_snapshot || segment.object_name_snapshot || "Taaksegment"}</span>
                </span>
              ))}
            </span>
          )}
        </button>
        {!isPending && <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button disabled={mutationPending} variant="ghost" size="icon" className="h-6 w-6 shrink-0" aria-label={`Acties voor ${shift.name || "dienst"}`}>
              <MoreHorizontal className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {activeSegments.length > 0 ? (
              <>
                <DropdownMenuItem onSelect={() => onEditComposition?.(shift)}><Layers3 className="h-3.5 w-3.5" /> Dienstinhoud bewerken</DropdownMenuItem>
                {shift.status === "draft" && Number(shift.published_revision || 0) === 0 && (
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => onCancelComposition?.(shift)}><Trash2 className="h-3.5 w-3.5" /> Conceptdienst verwijderen</DropdownMenuItem>
                )}
              </>
            ) : (
              <>
                <DropdownMenuItem onSelect={() => onMove?.(shift)}><MoveRight className="h-3.5 w-3.5" /> Verplaatsen</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onCopy?.(shift)}><Copy className="h-3.5 w-3.5" /> Kopiëren</DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onSelect}><UserRoundPlus className="h-3.5 w-3.5" /> Bezetting bekijken</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>}
      </div>

      <p className="compact-hide mt-1.5 text-[9px] font-medium text-muted-foreground" data-planning-dimensions="time-staffing">
        Bezetting {Math.min(currentAssignments.length, requiredCount)}/{requiredCount}
      </p>
      <div className="mt-1 space-y-1">
        {Array.from({ length: requiredCount }, (_, slotIndex) => (
          <ShiftSlot
            key={slotIndex}
            shift={shift}
            slotIndex={slotIndex}
            assignment={assignmentsBySlot.get(slotIndex) || null}
            resourceKey={resourceKey}
            serviceDate={serviceDate}
            onSelect={onSelect}
            onUnassign={onUnassign}
            disabled={mutationPending || isPending}
          />
        ))}
      </div>
      {warnings > 0 && <p className="mt-1 flex items-center gap-1 text-[9px] font-semibold text-amber-700 dark:text-amber-300"><AlertTriangle className="h-2.5 w-2.5" /> {warnings} waarschuwingen</p>}
      {canResizeDirectly && !firstProjection?.slice?.continuesAfter && (
        <ServiceCardResizeHandle
          edge="end"
          startMinute={baseStartMinute}
          endMinute={baseEndMinute}
          minMinute={baseStartMinute + 5}
          maxMinute={nextStart}
          preview={shownResize}
          onPreview={setResizePreview}
          onCommit={commitResize}
          onCancel={() => setResizePreview(null)}
          disabled={mutationPending || isPending || resizeSaving || Boolean(committedResizePreview)}
          label={`Eindtijd van ${shift.name || shift.service_name_snapshot || "dienst"} aanpassen`}
        />
      )}
    </article>
  );
}

function EmployeeAssignmentBlock({ shift, assignment, segments, projectionSlice, onSelect, onUnassign }) {
  const warnings = shiftWarningCount(shift, [assignment]);
  const activeSegments = segments.filter(item => item.status !== "removed");
  return (
    <article className="rounded-md border border-border bg-card p-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]" data-shift-id={shift.id}>
      <div className="flex items-start gap-1">
        <button type="button" onClick={onSelect} className="min-w-0 flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="block truncate text-[10px] font-semibold">{shift.name || shift.service_name_snapshot || "Dienst"}</span>
          <span className="mt-0.5 block text-[9px] text-muted-foreground">
            {projectionSlice?.startTime || shift.start_time || "--:--"}–{projectionSlice?.endTime || shift.end_time || "--:--"}
            {projectionSlice?.continuesBefore ? " · vervolg" : projectionSlice?.continuesAfter ? " · loopt door" : ""}
          </span>
          <span className="compact-hide mt-0.5 block truncate text-[9px] text-muted-foreground">
            {shift.object_name || shift.object_name_snapshot || (activeSegments.length > 1 ? `${activeSegments.length} taken` : "Samengestelde of mobiele dienst")}
          </span>
        </button>
        <button type="button" onClick={() => onUnassign?.(assignment)} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`${shift.name || "Dienst"} vrijmaken`}>
          <UserMinus className="h-3 w-3" />
        </button>
      </div>
      {warnings > 0 && <p className="mt-1 flex items-center gap-1 text-[9px] font-semibold text-amber-700 dark:text-amber-300"><AlertTriangle className="h-2.5 w-2.5" /> {warnings}</p>}
    </article>
  );
}

function DayHeader({ day }) {
  const key = dateKey(day);
  const today = key === dateKey(new Date());
  return (
    <div className={cn("px-3 py-2.5", today && "bg-primary/[0.06]")}>
      <span className={cn("block text-[11px] font-semibold capitalize", today && "text-primary")}>{dayFormatter.format(day)}</span>
      {today && <span className="mt-0.5 block text-[9px] font-medium text-primary">Vandaag</span>}
    </div>
  );
}

function ResourceHeader({ resource, perspective }) {
  const Icon = perspective === "employee" ? UserRound : resource.kind === "route" ? Route : MapPin;
  return (
    <div className="flex h-full min-h-14 items-start gap-2 px-3 py-2.5 text-left">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Icon className="h-3.5 w-3.5" /></span>
      <span className="min-w-0">
        <span className="block truncate text-[11px] font-semibold" title={resource.label}>{resource.label}</span>
        <span className="mt-0.5 block truncate text-[9px] font-normal text-muted-foreground" title={resource.subtitle}>{resource.subtitle}</span>
      </span>
    </div>
  );
}

function buildObjectResources({ objects, routes, shifts, occurrences, segmentsByShift }) {
  const objectsById = new Map(objects.map(item => [String(item.id), item]));
  const routesById = new Map(routes.map(item => [String(item.id), item]));
  const currentOccurrences = occurrences.filter(item => item.lifecycle_status !== "cancelled");
  const currentSegments = segmentsByShift.allSegments || [];
  const relevantObjectIds = new Set([
    ...objects.filter(isPlanningObjectActive).map(item => item.id),
    ...currentOccurrences.map(item => item.object_id),
    ...currentSegments.map(item => item.object_id),
  ].filter(Boolean).map(String));
  const referencedObjectIds = new Set([
    ...currentOccurrences.map(item => item.object_id),
    ...currentSegments.map(item => item.object_id),
  ].filter(Boolean).map(String));
  const relevantRouteIds = new Set();
  let needsOther = false;

  shifts.forEach(shift => {
    const shiftSegments = segmentsByShift.get(String(shift.id)) || [];
    const objectIds = new Set([
      shift.object_id,
      ...(shift.object_ids || []),
      ...shiftSegments.map(item => item.object_id),
    ].filter(Boolean).map(String));
    objectIds.forEach(id => {
      relevantObjectIds.add(id);
      referencedObjectIds.add(id);
    });
    if (objectIds.size === 0 && shift.route_id) relevantRouteIds.add(String(shift.route_id));
    if (objectIds.size === 0 && !shift.route_id) needsOther = true;
  });

  const resources = [...relevantObjectIds].map(id => {
    const object = objectsById.get(id);
    const occurrence = currentOccurrences.find(item => String(item.object_id) === id);
    const segment = currentSegments.find(item => String(item.object_id) === id);
    const shift = shifts.find(item => (
      String(item.object_id || "") === id
      || (item.object_ids || []).some(objectId => String(objectId) === id)
    ));
    if (!isPlanningObjectActive(object || {}) && !referencedObjectIds.has(id)) return null;
    const preferSnapshot = object && !isPlanningObjectActive(object);
    return {
      key: `object:${id}`,
      id,
      kind: "object",
      label: preferSnapshot
        ? occurrence?.object_name_snapshot || segment?.object_name_snapshot || shift?.object_name_snapshot || object.name || "Onbekend object"
        : object?.name || occurrence?.object_name_snapshot || segment?.object_name_snapshot || shift?.object_name_snapshot || "Onbekend object",
      subtitle: preferSnapshot
        ? occurrence?.customer_name_snapshot || segment?.customer_name_snapshot || object.address || "Historische objectkoppeling"
        : object?.address || occurrence?.customer_name_snapshot || segment?.customer_name_snapshot || "Object",
    };
  }).filter(Boolean);

  relevantRouteIds.forEach(id => {
    const route = routesById.get(id);
    resources.push({ key: `route:${id}`, id, kind: "route", label: route?.name || "Mobiele route", subtitle: "Mobiele surveillance" });
  });
  if (needsOther) resources.push({ key: "other", id: "other", kind: "other", label: "Overige diensten", subtitle: "Geen object of route gekoppeld" });

  return resources.sort((left, right) => (
    (left.kind === right.kind ? 0 : left.kind === "object" ? -1 : 1)
    || left.label.localeCompare(right.label, "nl")
  ));
}

function buildEmployeeResources(personnel) {
  return personnel
    .filter(isPlanningPersonnelActive)
    .map(item => ({
      key: `personnel:${item.id}`,
      id: String(item.id),
      kind: "employee",
      label: personnelName(item),
      subtitle: item.cao_function_group || item.function_type || item.employee_type || "Functie niet vastgelegd",
      personnel: item,
    }))
    .sort((left, right) => left.label.localeCompare(right.label, "nl"));
}

function timelineBoundary(dayKey, minute) {
  if (minute === 24 * 60) {
    const day = parseDateKey(dayKey);
    day.setDate(day.getDate() + 1);
    return { date: toDateKey(day), time: "00:00" };
  }
  return { date: dayKey, time: timelineMinutesToClock(minute) };
}

function ObjectDayCell({
  resource,
  dayKey,
  occurrences,
  shifts,
  coverageSegmentsByOccurrence,
  coverageShiftsByOccurrence,
  assignmentsByShift,
  segmentsByShift,
  selectedShiftId,
  onSelectOccurrence,
  onSelectShift,
  onUnassign,
  onMove,
  onCopy,
  onEditComposition,
  onCancelComposition,
  onCreateOpenTaskSlice,
  onResizeTaskSegment,
  mutationPending,
}) {
  const cellOccurrences = sortByStart(occurrences, item => item.projection?.startTime || item.occurrence?.window_start_time);
  const occurrenceById = new Map(cellOccurrences.map(item => [String(item.occurrence.id), item]));
  const groupedShifts = new Map();
  sortByStart(shifts, item => item.slice?.startTime || item.segment?.start_time || item.shift?.start_time).forEach(projection => {
    const shiftId = String(projection.shift.id);
    if (!groupedShifts.has(shiftId)) groupedShifts.set(shiftId, { shift: projection.shift, projections: [] });
    groupedShifts.get(shiftId).projections.push(projection);
  });
  const openTaskItems = cellOccurrences.flatMap(({ occurrence, planningState, projection }) => {
    const occurrenceId = String(occurrence.id);
    const gaps = getTaskTimelineGaps({
      occurrence,
      serviceDate: dayKey,
      segments: coverageSegmentsByOccurrence.get(occurrenceId) || [],
      shifts: coverageShiftsByOccurrence.get(occurrenceId) || [],
    });
    return gaps.map(gap => ({
      kind: "open-task",
      key: `open:${occurrenceId}:${dayKey}:${gap.startMinute}-${gap.endMinute}`,
      startMinute: gap.startMinute,
      occurrence,
      planningState,
      projection,
      gap,
    }));
  });
  const serviceItems = [...groupedShifts.values()].map(({ shift, projections }) => ({
    kind: "service",
    key: `service:${shift.id}:${dayKey}`,
    startMinute: timeValue(projections[0]?.slice?.startTime || projections[0]?.segment?.start_time || shift.start_time),
    shift,
    projections,
  }));
  const cellItems = [...openTaskItems, ...serviceItems].sort((left, right) => (
    left.startMinute - right.startMinute
    || (left.kind === right.kind ? 0 : left.kind === "service" ? -1 : 1)
    || left.key.localeCompare(right.key)
  ));
  return (
    <div className="min-h-[112px] space-y-1.5 p-2" data-matrix-cell={`${resource.key}:${dayKey}`}>
      {cellItems.map(item => {
        if (item.kind === "open-task") {
          return (
            <OpenTaskIntervalCard
              key={item.key}
              occurrence={item.occurrence}
              planningState={item.planningState}
              projection={item.projection}
              gap={item.gap}
              onSelectOccurrence={onSelectOccurrence}
              onCreateOpenTaskSlice={onCreateOpenTaskSlice}
              mutationPending={mutationPending}
            />
          );
        }
        const { shift, projections } = item;
        const activeShiftSegments = segmentsByShift.get(String(shift.id)) || [];
        const projectionSegment = projections.length === 1 ? projections[0]?.segment : null;
        const occurrenceContext = projectionSegment
          ? occurrenceById.get(String(projectionSegment.task_occurrence_id))?.occurrence || null
          : null;
        return (
          <MatrixShiftBlock
            key={item.key}
            shift={shift}
            projections={projections}
            assignments={assignmentsByShift.get(String(shift.id)) || []}
            segments={activeShiftSegments}
            occurrence={occurrenceContext}
            allOccurrenceSegments={projectionSegment
              ? coverageSegmentsByOccurrence.get(String(projectionSegment.task_occurrence_id)) || []
              : []}
            resourceKey={`${resource.key}:${dayKey}:shift:${shift.id}`}
            serviceDate={dayKey}
            selected={String(selectedShiftId || "") === String(shift.id)}
            onSelect={() => onSelectShift?.(shift)}
            onUnassign={assignment => onUnassign?.(shift, assignment)}
            onMove={onMove}
            onCopy={onCopy}
            onEditComposition={onEditComposition}
            onCancelComposition={onCancelComposition}
            onResizeTaskSegment={onResizeTaskSegment}
            mutationPending={mutationPending}
          />
        );
      })}
      {cellItems.length === 0 && <span className="block px-1 py-2 text-[9px] text-muted-foreground/60">Geen planning</span>}
    </div>
  );
}

function EmployeeDayCell({ resource, dayKey, placements, segmentsByShift, onSelectShift, onUnassign }) {
  const droppableId = `employee-day:${resource.id}:${dayKey}`;
  return (
    <Droppable droppableId={droppableId} type="TASK">
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          data-droppable-id={droppableId}
          data-matrix-cell={`${resource.key}:${dayKey}`}
          className={cn(
            "min-h-[112px] space-y-1.5 p-2 transition-colors",
            snapshot.isDraggingOver && "bg-primary/[0.08] ring-2 ring-inset ring-primary/35",
          )}
        >
          {sortByStart(placements, item => item.slice?.startTime || item.shift.start_time).map(({ shift, assignment, slice }) => (
            <EmployeeAssignmentBlock
              key={`${shift.id}-${assignment.id || assignment.slot_index || 0}-${dayKey}`}
              shift={shift}
              assignment={assignment}
              segments={segmentsByShift.get(String(shift.id)) || []}
              projectionSlice={slice}
              onSelect={() => onSelectShift?.(shift)}
              onUnassign={item => onUnassign?.(shift, item)}
            />
          ))}
          {placements.length === 0 && (
            <p className={cn("flex min-h-12 items-center justify-center rounded border border-dashed border-transparent px-2 text-center text-[9px] text-muted-foreground/60", snapshot.isDraggingOver && "border-primary/40 text-primary")}>
              {snapshot.isDraggingOver ? "Loslaten om taak bij medewerker te plannen" : "Sleep hier een open taak"}
            </p>
          )}
          {provided.placeholder}
        </div>
      )}
    </Droppable>
  );
}

/**
 * Matrix contract for Planning-page integration:
 * - occurrences: visible PlanningTaskOccurrence records for the selected range.
 * - personnel drops: `slot:<shift>:<slot>:<YYYY-MM-DD>:<resource>` plus
 *   `occurrence-gap:<occurrence>:<YYYY-MM-DD>:<start>:<end>`; both preserve
 *   the visible day, while cross-day slots require full-shift confirmation.
 * - task drops: `employee-day:<personnel>:<YYYY-MM-DD>`; resolve this to an
 *   explicit compose/add-to-shift + assignment confirmation in Planning.jsx.
 */
export default function PlanningMatrix({
  perspective,
  compact = false,
  zoom = 1,
  days,
  shifts = [],
  coverageShifts = shifts,
  assignments = [],
  segments = [],
  occurrences = [],
  personnel = [],
  objects = [],
  routes = [],
  selectedShiftId,
  onSelectOccurrence,
  onSelectShift,
  onUnassign,
  onMove,
  onCopy,
  onEditComposition,
  onCancelComposition,
  onCreateOpenTaskSlice,
  onResizeTaskSegment,
  mutationPending = false,
}) {
  const orientation = perspective === "object" ? "days_horizontal" : "resources_horizontal";
  const shiftsById = useMemo(() => new Map(shifts.map(item => [String(item.id), item])), [shifts]);
  const assignmentsByShift = useMemo(() => {
    const map = new Map();
    activeAssignments(assignments).forEach(item => appendToMap(map, String(item.planning_shift_id || item.shift_id), item));
    return map;
  }, [assignments]);
  const segmentsByShift = useMemo(() => {
    const map = new Map();
    const activeShiftIds = new Set(shifts
      .filter(shift => shift.status !== "cancelled")
      .map(shift => String(shift.id)));
    const current = segments.filter(item => (
      item.status !== "removed" && activeShiftIds.has(String(item.shift_id))
    ));
    current.forEach(item => appendToMap(map, String(item.shift_id), item));
    map.allSegments = current;
    return map;
  }, [segments, shifts]);
  const coverageSegments = useMemo(() => {
    const activeShiftIds = new Set(coverageShifts
      .filter(shift => shift.status !== "cancelled")
      .map(shift => String(shift.id)));
    return segments.filter(item => (
      item.status !== "removed" && activeShiftIds.has(String(item.shift_id))
    ));
  }, [coverageShifts, segments]);
  const coverageSegmentsByOccurrence = useMemo(() => {
    const map = new Map();
    coverageSegments.forEach(segment => appendToMap(map, String(segment.task_occurrence_id), segment));
    return map;
  }, [coverageSegments]);
  const coverageShiftsByOccurrence = useMemo(() => {
    const shiftById = new Map(coverageShifts.map(shift => [String(shift.id), shift]));
    const map = new Map();
    coverageSegmentsByOccurrence.forEach((occurrenceSegments, occurrenceId) => {
      const seen = new Set();
      const occurrenceShifts = [];
      occurrenceSegments.forEach(segment => {
        const shiftId = String(segment.shift_id);
        const shift = shiftById.get(shiftId);
        if (!shift || seen.has(shiftId)) return;
        seen.add(shiftId);
        occurrenceShifts.push(shift);
      });
      map.set(occurrenceId, occurrenceShifts);
    });
    return map;
  }, [coverageSegmentsByOccurrence, coverageShifts]);
  const occurrencePlanningStates = useMemo(() => new Map(occurrences.map(occurrence => [
    String(occurrence.id),
    getOccurrencePlanningState({
      occurrence,
      segments: coverageSegmentsByOccurrence.get(String(occurrence.id)) || [],
      shifts: coverageShiftsByOccurrence.get(String(occurrence.id)) || [],
      assignments: (coverageShiftsByOccurrence.get(String(occurrence.id)) || [])
        .flatMap(shift => assignmentsByShift.get(String(shift.id)) || []),
    }),
  ])), [assignmentsByShift, coverageSegmentsByOccurrence, coverageShiftsByOccurrence, occurrences]);
  const resources = useMemo(() => perspective === "employee"
    ? buildEmployeeResources(personnel)
    : buildObjectResources({ objects, routes, shifts, occurrences, segmentsByShift }),
  [objects, occurrences, personnel, perspective, routes, segmentsByShift, shifts]);

  const occurrencesByCell = useMemo(() => {
    const map = new Map();
    const visibleDays = days.map(dateKey);
    occurrences.filter(item => item.lifecycle_status !== "cancelled").forEach(item => {
      if (!item.object_id) return;
      const planningState = occurrencePlanningStates.get(String(item.id));
      visibleDays.forEach(day => {
        const projection = getTaskOccurrenceDayProjection(item, day);
        if (!projection) return;
        appendToMap(map, `object:${item.object_id}:${day}`, { occurrence: item, planningState, projection });
      });
    });
    return map;
  }, [days, occurrencePlanningStates, occurrences]);
  const shiftsByObjectCell = useMemo(() => {
    const map = new Map();
    shifts.forEach(shift => {
      const shiftSegments = segmentsByShift.get(String(shift.id)) || [];
      if (shiftSegments.length > 0) {
        shiftSegments.forEach((segment, index) => {
          const fallbackDate = segment.start_date || segment.service_date || shift.service_date;
          const slices = intervalDaySlices(segment);
          const projections = slices.length > 0
            ? slices
            : [{ date: fallbackDate, startTime: segment.start_time, endTime: segment.end_time }];
          projections.forEach(slice => {
            const projectionKey = `segment:${segment.id || `${shift.id}:${index}:${slice.date}:${segment.start_time || ""}`}:${slice.date}`;
            if (segment.object_id) {
              appendToMap(map, `object:${segment.object_id}:${slice.date}`, { shift, segment, slice, projectionKey });
            } else if (shift.route_id) {
              appendToMap(map, `route:${shift.route_id}:${slice.date}`, { shift, segment, slice, projectionKey });
            } else {
              appendToMap(map, `other:${slice.date}`, { shift, segment, slice, projectionKey });
            }
          });
        });
        return;
      }
      const objectIds = new Set([
        shift.object_id,
        ...(shift.object_ids || []),
      ].filter(Boolean).map(String));
      const slices = intervalDaySlices(shift);
      const projections = slices.length > 0
        ? slices
        : [{ date: shift.service_date, startTime: shift.start_time, endTime: shift.end_time }];
      projections.forEach(slice => {
        const projection = { shift, segment: null, slice, projectionKey: `shift:${shift.id}:${slice.date}` };
        if (objectIds.size > 0) objectIds.forEach(id => appendToMap(map, `object:${id}:${slice.date}`, projection));
        else if (shift.route_id) appendToMap(map, `route:${shift.route_id}:${slice.date}`, projection);
        else appendToMap(map, `other:${slice.date}`, projection);
      });
    });
    return map;
  }, [segmentsByShift, shifts]);
  const placementsByEmployeeCell = useMemo(() => {
    const map = new Map();
    const visibleDays = new Set(days.map(dateKey));
    activeAssignments(assignments).forEach(assignment => {
      const shift = shiftsById.get(String(assignment.planning_shift_id || assignment.shift_id));
      if (!shift?.service_date || !assignment.personnel_id) return;
      const slices = intervalDaySlices(shift);
      const projections = slices.length > 0
        ? slices
        : [{ date: shift.service_date, startTime: shift.start_time, endTime: shift.end_time }];
      projections.filter(slice => visibleDays.has(slice.date)).forEach(slice => {
        appendToMap(map, `${assignment.personnel_id}:${slice.date}`, { assignment, shift, slice });
      });
    });
    return map;
  }, [assignments, days, shiftsById]);
  const renderCell = (resource, day) => {
    const key = dateKey(day);
    return perspective === "employee" ? (
      <EmployeeDayCell
        resource={resource}
        dayKey={key}
        placements={placementsByEmployeeCell.get(`${resource.id}:${key}`) || []}
        segmentsByShift={segmentsByShift}
        onSelectShift={onSelectShift}
        onUnassign={onUnassign}
      />
    ) : (
      <ObjectDayCell
        resource={resource}
        dayKey={key}
        occurrences={occurrencesByCell.get(`${resource.key}:${key}`) || []}
        shifts={shiftsByObjectCell.get(`${resource.key}:${key}`) || []}
        coverageSegmentsByOccurrence={coverageSegmentsByOccurrence}
        coverageShiftsByOccurrence={coverageShiftsByOccurrence}
        assignmentsByShift={assignmentsByShift}
        segmentsByShift={segmentsByShift}
        selectedShiftId={selectedShiftId}
        onSelectOccurrence={onSelectOccurrence}
        onSelectShift={onSelectShift}
        onUnassign={onUnassign}
        onMove={onMove}
        onCopy={onCopy}
        onEditComposition={onEditComposition}
        onCancelComposition={onCancelComposition}
        onCreateOpenTaskSlice={onCreateOpenTaskSlice}
        onResizeTaskSegment={onResizeTaskSegment}
        mutationPending={mutationPending}
      />
    );
  };

  return (
    <div className="h-full min-h-0">
      <div
        className="h-full min-h-0 overflow-auto overscroll-contain bg-background [scrollbar-gutter:stable]"
        data-testid="planning-matrix-scroll"
      >
      <table
        style={{ zoom }}
        className={cn(
          "min-w-max table-fixed border-separate border-spacing-0",
          compact && "[&_[data-matrix-cell]]:min-h-[72px] [&_[data-matrix-cell]]:p-1 [&_article]:p-1.5 [&_[data-inline-time-editor=true]]:p-2 [&_[data-planning-dimensions]]:hidden [&_.compact-hide]:hidden",
        )}
        aria-label={perspective === "employee" ? "Planning per medewerker" : "Planning per object"}
        data-planning-layout="cards"
      >
        {orientation === "resources_horizontal" ? (
          <>
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 top-0 z-50 w-[138px] min-w-[138px] border-b border-r border-border bg-card text-left shadow-[4px_4px_10px_rgba(15,23,42,0.04)]">
                  <span className="block px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Dag</span>
                </th>
                {resources.map(resource => (
                  <th key={resource.key} scope="col" className="sticky top-0 z-40 w-[238px] min-w-[238px] max-w-[238px] border-b border-r border-border bg-card/95 align-top backdrop-blur last:border-r-0">
                    <ResourceHeader resource={resource} perspective={perspective} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map(day => {
                const key = dateKey(day);
                return (
                  <tr key={key}>
                    <th scope="row" className="sticky left-0 z-30 w-[138px] min-w-[138px] border-b border-r border-border bg-card align-top text-left shadow-[4px_0_10px_rgba(15,23,42,0.025)]">
                      <DayHeader day={day} />
                    </th>
                    {resources.map(resource => (
                      <td key={`${resource.key}:${key}`} className="w-[238px] min-w-[238px] max-w-[238px] border-b border-r border-border/80 align-top last:border-r-0">
                        {renderCell(resource, day)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </>
        ) : (
          <>
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 top-0 z-50 w-[220px] min-w-[220px] border-b border-r border-border bg-card text-left shadow-[4px_4px_10px_rgba(15,23,42,0.04)]">
                  <span className="block px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {perspective === "employee" ? "Medewerker" : "Object"}
                  </span>
                </th>
                {days.map(day => {
                  const key = dateKey(day);
                  return (
                    <th key={key} scope="col" className="sticky top-0 z-40 w-[238px] min-w-[238px] max-w-[238px] border-b border-r border-border bg-card/95 align-top text-left backdrop-blur last:border-r-0">
                      <DayHeader day={day} />
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {resources.map(resource => (
                <tr key={resource.key}>
                  <th scope="row" className="sticky left-0 z-30 w-[220px] min-w-[220px] max-w-[220px] border-b border-r border-border bg-card align-top text-left shadow-[4px_0_10px_rgba(15,23,42,0.025)]">
                    <ResourceHeader resource={resource} perspective={perspective} />
                  </th>
                  {days.map(day => {
                    const key = dateKey(day);
                    return (
                      <td key={`${resource.key}:${key}`} className="w-[238px] min-w-[238px] max-w-[238px] border-b border-r border-border/80 align-top last:border-r-0">
                        {renderCell(resource, day)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </>
        )}
      </table>
      {resources.length === 0 && (
        <div className="sticky left-0 flex min-h-48 w-[min(100vw,680px)] items-center justify-center p-6 text-center">
          <div className="rounded-lg border border-dashed border-border bg-card p-6">
            <p className="text-[12px] font-semibold">Geen planningseenheden in deze selectie</p>
            <p className="mt-1 text-[10px] text-muted-foreground">Pas de periode of filters aan.</p>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
