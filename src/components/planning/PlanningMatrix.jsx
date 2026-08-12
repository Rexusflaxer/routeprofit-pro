import React, { useMemo, useState } from "react";
import { Droppable } from "@hello-pangea/dnd";
import {
  AlertTriangle,
  Check,
  Clock3,
  Copy,
  GripHorizontal,
  Layers3,
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
  getTaskOccurrenceCoverage,
  isPlanningObjectActive,
  isPlanningPersonnelActive,
  parseDateKey,
  toDateKey,
} from "@/components/planning/planningDomain";
import {
  clockToTimelineMinutes,
  getTaskTimelineDemand,
  getTaskTimelineGaps,
  layoutTimelineIntervalLanes,
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

function taskStatusClass(status) {
  if (status === "full") return "border-emerald-300 bg-emerald-50/80 dark:border-emerald-800 dark:bg-emerald-950/30";
  if (status === "partial") return "border-amber-300 bg-amber-50/80 dark:border-amber-800 dark:bg-amber-950/30";
  return "border-rose-300 bg-rose-50/75 dark:border-rose-800 dark:bg-rose-950/30";
}

function TaskOccurrenceBlock({ occurrence, planningState, projection, onSelectOccurrence, onFillStaffing }) {
  const coverage = planningState?.coverage || getTaskOccurrenceCoverage(occurrence, []);
  const isFull = coverage.status === "full";
  const needsStaffing = isFull && planningState?.readiness === "needs_staffing";
  const dropServiceDate = projection?.date || occurrence.service_date;
  const droppableId = `occurrence:${occurrence.id}:${dropServiceDate}`;
  const label = isFull
    ? "Volledig gepland"
    : coverage.status === "partial"
      ? `${formatMinutesAsHours(coverage.remainingMinutes)} resterend`
      : "Nog niet gepland";

  return (
    <Droppable
      droppableId={droppableId}
      type="PERSONNEL"
      isDropDisabled={isFull && planningState?.readiness === "ready"}
    >
      {(provided, snapshot) => (
        <article
          ref={provided.innerRef}
          {...provided.droppableProps}
          data-droppable-id={droppableId}
          data-task-occurrence-id={occurrence.id}
          className={cn(
            "rounded-md border p-2 text-left shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-colors",
            taskStatusClass(coverage.status),
            snapshot.isDraggingOver && "border-primary bg-primary/10 ring-2 ring-primary/25",
          )}
        >
          <button
            type="button"
            className="block w-full rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => (needsStaffing ? onFillStaffing?.(occurrence) : onSelectOccurrence?.(occurrence))}
          >
            <span className="flex items-start justify-between gap-2">
              <span className="min-w-0">
                <span className="block truncate text-[11px] font-semibold">{occurrence.task_name_snapshot || "Taak"}</span>
                <span className="mt-0.5 flex items-center gap-1 text-[9px] text-muted-foreground">
                  <Clock3 className="h-2.5 w-2.5" />
                  {projection?.startTime || occurrence.window_start_time || "--:--"}–{projection?.endTime || occurrence.window_end_time || "--:--"}
                  {projection?.continuesBefore ? " · vervolg" : projection?.continuesAfter ? " · loopt door" : ""}
                </span>
              </span>
              <span className="shrink-0 rounded bg-background/80 px-1.5 py-0.5 text-[9px] font-semibold">{label}</span>
            </span>
          </button>
          <p className="mt-1 text-[9px] text-muted-foreground" data-planning-dimensions="time-staffing">
            Tijd {formatMinutesAsHours(coverage.allocatedMinutes)}/{formatMinutesAsHours(coverage.requiredMinutes)} · Bezetting {planningState?.assignedSlots || 0}/{planningState?.requiredSlots || 0}
          </p>
          {planningState?.readiness !== "ready" && (
            <p className="compact-hide mt-1.5 flex items-center gap-1 border-t border-current/10 pt-1.5 text-[9px] font-medium text-muted-foreground">
              <UserRoundPlus className="h-2.5 w-2.5" />
              {snapshot.isDraggingOver
                ? needsStaffing ? "Loslaten om de open plaats te bezetten" : "Loslaten om een dienst te maken"
                : needsStaffing ? "Sleep medewerker naar de open bezettingsplaats" : "Sleep medewerker naar deze taak"}
            </p>
          )}
          {needsStaffing && (
            <button
              type="button"
              className="compact-hide mt-1.5 inline-flex h-6 items-center gap-1 rounded bg-background/85 px-1.5 text-[9px] font-semibold text-foreground shadow-sm hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onFillStaffing?.(occurrence)}
            >
              <UserRoundPlus className="h-2.5 w-2.5" /> Bezetting invullen
            </button>
          )}
          <div className="hidden">{provided.placeholder}</div>
        </article>
      )}
    </Droppable>
  );
}

function ShiftSlot({ shift, slotIndex, assignment, resourceKey, serviceDate, onSelect, onUnassign }) {
  const droppableId = `slot:${shift.id}:${slotIndex}:${serviceDate}:${encodeURIComponent(resourceKey)}`;
  return (
    <Droppable droppableId={droppableId} type="PERSONNEL" isDropDisabled={Boolean(assignment)}>
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
              <button type="button" onClick={onSelect} className="min-w-0 flex-1 truncate text-left font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {assignment.personnel_name || assignment.personnel_name_snapshot || "Medewerker"}
              </button>
              <button type="button" onClick={() => onUnassign?.(assignment)} className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`${assignment.personnel_name || "Medewerker"} vrijmaken`}>
                <UserMinus className="h-2.5 w-2.5" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onSelect}
              className="flex min-w-0 flex-1 items-center gap-1 text-left font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

function MatrixShiftBlock({
  shift,
  projections = [],
  assignments,
  segments,
  resourceKey,
  serviceDate,
  selected,
  onSelect,
  onUnassign,
  onMove,
  onCopy,
  onEditComposition,
  onCancelComposition,
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
  const displayedStartTime = firstProjection?.slice?.startTime || projectionSegment?.start_time || shift.start_time || "--:--";
  const displayedEndTime = lastProjection?.slice?.endTime || lastProjection?.segment?.end_time || shift.end_time || "--:--";
  const continuesBefore = orderedProjections.some(item => item.slice?.continuesBefore);
  const continuesAfter = orderedProjections.some(item => item.slice?.continuesAfter);
  const crossesDate = projectionSegment?.end_date
    && projectionSegment.end_date !== (projectionSegment.start_date || shift.service_date);

  return (
    <article className={cn(
      "rounded-md border border-border bg-card p-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
      shift.status === "draft" && "border-dashed border-primary/45",
      selected && "border-primary ring-2 ring-primary/20",
    )} data-shift-id={shift.id} data-segment-id={segmentProjections.length === 1 ? projectionSegment?.id : undefined}>
      <div className="flex items-start gap-1">
        <button type="button" onClick={onSelect} className="min-w-0 flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="flex min-w-0 items-center gap-1">
            {linkedObjectCount > 1 && <Layers3 className="h-3 w-3 shrink-0 text-primary" aria-label="Samengestelde dienst" />}
            <span className="truncate text-[10px] font-semibold">{shift.name || shift.service_name_snapshot || "Dienst"}</span>
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" aria-label={`Acties voor ${shift.name || "dienst"}`}>
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
        </DropdownMenu>
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
          />
        ))}
      </div>
      {warnings > 0 && <p className="mt-1 flex items-center gap-1 text-[9px] font-semibold text-amber-700 dark:text-amber-300"><AlertTriangle className="h-2.5 w-2.5" /> {warnings} waarschuwingen</p>}
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

function timelinePosition(startMinute, endMinute, pixelsPerMinute, minimumHeight = 28, containerEndMinute = null) {
  const start = Math.max(0, Number(startMinute) || 0);
  const end = Math.max(start, Number(endMinute) || 0);
  const startPixel = start * pixelsPerMinute;
  const exactHeight = Math.max(1, (end - start) * pixelsPerMinute);
  const height = Math.max(minimumHeight, exactHeight);
  const containerEnd = Number(containerEndMinute);
  const containerEndPixel = Number.isFinite(containerEnd) && containerEnd >= 0
    ? containerEnd * pixelsPerMinute
    : null;
  return {
    top: containerEndPixel == null
      ? startPixel
      : Math.max(0, Math.min(startPixel, containerEndPixel - height)),
    height,
    exactHeight,
  };
}

function timelineBoundary(dayKey, minute) {
  if (minute === 24 * 60) {
    const day = parseDateKey(dayKey);
    day.setDate(day.getDate() + 1);
    return { date: toDateKey(day), time: "00:00" };
  }
  return { date: dayKey, time: timelineMinutesToClock(minute) };
}

function TimelineResizeHandle({
  edge,
  startMinute,
  endMinute,
  minMinute,
  maxMinute,
  pixelsPerMinute,
  preview,
  onPreview,
  onCommit,
  onCancel,
  disabled,
  label,
}) {
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

  const handlePointerDown = event => {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    const canvas = event.currentTarget.closest("[data-timeline-day-canvas]");
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    let latest = current;
    const move = pointerEvent => {
      const pointerMinute = (pointerEvent.clientY - rect.top) / Math.max(pixelsPerMinute, 0.001);
      const proposal = propose(pointerMinute);
      if (!proposal) return;
      latest = proposal;
      onPreview?.(proposal);
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      if (latest.startMinute !== startMinute || latest.endMinute !== endMinute) onCommit?.(latest);
      else onCancel?.();
    };
    const cancel = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      onCancel?.();
    };
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
    if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
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
      disabled={disabled}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      onBlur={() => {
        if (preview) onCancel?.();
      }}
      className={cn(
        "absolute left-1/2 z-30 flex h-5 w-11 -translate-x-1/2 touch-none items-center justify-center rounded-full border border-primary/35 bg-background/95 text-primary opacity-0 shadow-sm transition-opacity focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/segment:opacity-100",
        edge === "start" ? "-top-2.5 cursor-n-resize" : "-bottom-2.5 cursor-s-resize",
      )}
      title={`${edge === "start" ? "Begintijd" : "Eindtijd"} aanpassen · pijltjes 5 min · Shift 60 min · Enter opslaan`}
    >
      <GripHorizontal className="h-3.5 w-3.5" />
    </button>
  );
}

function TimelineShiftSegmentCard({
  occurrence,
  shift,
  segment,
  slice,
  assignments,
  resourceKey,
  dayKey,
  demand,
  allOccurrenceSegments,
  selected,
  pixelsPerMinute,
  mutationPending,
  onSelect,
  onUnassign,
  onResizeTaskSegment,
  shiftSegmentCount,
}) {
  const startMinute = clockToTimelineMinutes(slice?.startTime || segment.start_time);
  const endMinute = clockToTimelineMinutes(slice?.endTime || segment.end_time);
  const [preview, setPreview] = useState(null);
  if (startMinute == null || endMinute == null || endMinute <= startMinute) return null;
  const shown = preview || { startMinute, endMinute };
  const position = timelinePosition(
    shown.startMinute - demand.startMinute,
    shown.endMinute - demand.startMinute,
    pixelsPerMinute,
    28,
    demand.endMinute - demand.startMinute,
  );
  const currentAssignments = activeAssignments(assignments);
  const primaryAssignment = currentAssignments[0] || null;
  const requiredCount = Math.max(1, Number(shift.required_count || 1));
  const isOpen = currentAssignments.length < requiredCount;
  const slotIndex = Array.from({ length: requiredCount }, (_, index) => index)
    .find(index => !new Set(currentAssignments.map(item => Number(item.slot_index || 0))).has(index)) ?? 0;
  const otherProjections = allOccurrenceSegments
    .filter(item => String(item.id) !== String(segment.id))
    .map(item => getTaskOccurrenceDayProjection({
      service_date: item.start_date,
      end_date: item.end_date,
      window_start_time: item.start_time,
      window_end_time: item.end_time,
    }, dayKey))
    .filter(Boolean)
    .map(item => ({
      startMinute: clockToTimelineMinutes(item.startTime),
      endMinute: clockToTimelineMinutes(item.endTime),
    }))
    .filter(item => item.startMinute != null && item.endMinute != null);
  const previousEnd = Math.max(demand.startMinute, ...otherProjections
    .filter(item => item.endMinute <= startMinute)
    .map(item => item.endMinute));
  const nextStart = Math.min(demand.endMinute, ...otherProjections
    .filter(item => item.startMinute >= endMinute)
    .map(item => item.startMinute));
  const directResize = shiftSegmentCount === 1 && shift.source_type === "task";
  const commitResize = proposal => {
    const startBoundary = slice?.continuesBefore
      ? {
          date: segment.start_date || segment.service_date || shift.service_date,
          time: segment.start_time || shift.start_time,
        }
      : timelineBoundary(dayKey, proposal.startMinute);
    const endBoundary = slice?.continuesAfter
      ? {
          date: segment.end_date || segment.start_date || segment.service_date || shift.end_date || shift.service_date,
          time: segment.end_time || shift.end_time,
        }
      : timelineBoundary(dayKey, proposal.endMinute);
    setPreview(null);
    onResizeTaskSegment?.({
      occurrence,
      shift,
      segment,
      startDate: startBoundary.date,
      endDate: endBoundary.date,
      startTime: startBoundary.time,
      endTime: endBoundary.time,
    });
  };
  const card = (
    <article
      className={cn(
        "group/segment absolute inset-x-1 z-20 rounded-md border bg-card/95 px-2 py-1.5 shadow-md backdrop-blur-sm transition-[top,height]",
        primaryAssignment ? "border-primary/50" : "border-dashed border-amber-500/70 bg-amber-50/95 dark:bg-amber-950/60",
        selected && "ring-2 ring-primary/40",
      )}
      style={{ top: position.top, height: position.height }}
      data-shift-id={shift.id}
      data-segment-id={segment.id}
      data-timeline-shift-segment="true"
      data-timeline-exact-top={(startMinute - demand.startMinute) * pixelsPerMinute}
      data-timeline-exact-height={(endMinute - startMinute) * pixelsPerMinute}
    >
      {directResize && !slice?.continuesBefore && (
        <TimelineResizeHandle
          edge="start"
          startMinute={startMinute}
          endMinute={endMinute}
          minMinute={previousEnd}
          maxMinute={endMinute - 5}
          pixelsPerMinute={pixelsPerMinute}
          preview={preview}
          onPreview={setPreview}
          onCommit={commitResize}
          onCancel={() => setPreview(null)}
          disabled={mutationPending}
          label={`Begintijd van ${shift.name || shift.service_name_snapshot || "dienst"} aanpassen`}
        />
      )}
      <button type="button" onClick={onSelect} className="block w-full min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="flex min-w-0 items-center gap-1">
          <span className={cn("h-2 w-2 shrink-0 rounded-full", primaryAssignment ? "bg-primary" : "bg-amber-500")} />
          <span className="truncate text-[10px] font-semibold">{primaryAssignment?.personnel_name || primaryAssignment?.personnel_name_snapshot || "Open dienst"}</span>
          {shift.status === "published" && <Check className="h-3 w-3 shrink-0 text-emerald-600" aria-label="Gepubliceerd" />}
        </span>
        <span className="mt-0.5 block truncate text-[9px] font-medium tabular-nums text-muted-foreground">
          {timelineMinutesToClock(shown.startMinute)}–{timelineMinutesToClock(shown.endMinute)} · {shift.name || shift.service_name_snapshot || "Dienst"}
        </span>
      </button>
      {primaryAssignment && (
        <button type="button" onClick={() => onUnassign?.(primaryAssignment)} className="absolute right-1 top-1 rounded p-0.5 text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive focus:opacity-100 group-hover/segment:opacity-100" aria-label={`${primaryAssignment.personnel_name || "Medewerker"} vrijmaken`}>
          <UserMinus className="h-3 w-3" />
        </button>
      )}
      {directResize && !slice?.continuesAfter && (
        <TimelineResizeHandle
          edge="end"
          startMinute={startMinute}
          endMinute={endMinute}
          minMinute={startMinute + 5}
          maxMinute={nextStart}
          pixelsPerMinute={pixelsPerMinute}
          preview={preview}
          onPreview={setPreview}
          onCommit={commitResize}
          onCancel={() => setPreview(null)}
          disabled={mutationPending}
          label={`Eindtijd van ${shift.name || shift.service_name_snapshot || "dienst"} aanpassen`}
        />
      )}
    </article>
  );

  if (!isOpen) return card;
  const droppableId = `slot:${shift.id}:${slotIndex}:${dayKey}:${encodeURIComponent(`${resourceKey}:timeline:${segment.id}`)}`;
  return (
    <Droppable droppableId={droppableId} type="PERSONNEL" isDropDisabled={mutationPending}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          data-droppable-id={droppableId}
          className={cn("absolute inset-x-0 z-20", snapshot.isDraggingOver && "ring-2 ring-primary/50")}
          style={{ top: position.top, height: position.height }}
        >
          <div className="relative h-full" style={{ transform: `translateY(${-position.top}px)` }}>{card}</div>
          <div className="hidden">{provided.placeholder}</div>
        </div>
      )}
    </Droppable>
  );
}

function TaskDemandTimelineOverlay({
  occurrence,
  planningState,
  dayKey,
  timelineSegments,
  allSegments,
  coverageShifts,
  assignmentsByShift,
  segmentsByShift,
  lane,
  laneCount,
  pixelsPerMinute,
  selectedShiftId,
  mutationPending,
  onSelectOccurrence,
  onSelectShift,
  onUnassign,
  onCreateOpenTaskSlice,
  onResizeTaskSegment,
}) {
  const demand = getTaskTimelineDemand(occurrence, dayKey);
  if (!demand) return null;
  const position = timelinePosition(demand.startMinute, demand.endMinute, pixelsPerMinute, 28, 24 * 60);
  const gaps = getTaskTimelineGaps({ occurrence, serviceDate: dayKey, segments: allSegments, shifts: coverageShifts });
  const coverage = planningState?.coverage || getTaskOccurrenceCoverage(occurrence, allSegments);
  const laneWidth = 100 / Math.max(1, laneCount);
  const suggestedByGap = new Map(gaps.map(gap => {
    const durationMinutes = Math.min(8 * 60, gap.allocatableMinutes);
    return [gap.id, { ...gap, endMinute: gap.startMinute + durationMinutes, durationMinutes }];
  }));
  return (
    <section
      className={cn(
        "absolute z-10 overflow-visible rounded-md border border-primary/25 bg-primary/[0.035] shadow-[inset_3px_0_0_hsl(var(--primary)/0.5)]",
        demand.isFlexible && "border-violet-300 bg-violet-50/30 shadow-[inset_3px_0_0_rgb(139_92_246/0.55)] dark:border-violet-800 dark:bg-violet-950/20",
      )}
      style={{
        top: position.top,
        height: position.height,
        left: `calc(${lane * laneWidth}% + 3px)`,
        width: `calc(${laneWidth}% - 6px)`,
      }}
      data-task-occurrence-id={occurrence.id}
      data-timeline-task-overlay="true"
      data-timeline-exact-top={demand.startMinute * pixelsPerMinute}
      data-timeline-exact-height={(demand.endMinute - demand.startMinute) * pixelsPerMinute}
    >
      <button
        type="button"
        onClick={() => onSelectOccurrence?.(occurrence)}
        className="sticky top-0 z-30 mx-1 mt-1 flex max-w-[calc(100%-8px)] items-center gap-1 rounded bg-background/90 px-1.5 py-1 text-left shadow-sm backdrop-blur focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        title={`${occurrence.task_name_snapshot || "Taak"} ${demand.startTime}–${demand.endTime}`}
      >
        <span className="min-w-0 flex-1 truncate text-[9px] font-semibold">{occurrence.task_name_snapshot || "Taak"}</span>
        <span className="shrink-0 text-[8px] font-medium tabular-nums text-muted-foreground">{demand.startTime}–{demand.endTime}</span>
        <span
          className={cn("h-1.5 w-1.5 shrink-0 rounded-full", coverage.status === "full" ? "bg-emerald-500" : coverage.status === "partial" ? "bg-amber-500" : "bg-rose-500")}
          aria-hidden="true"
        />
        <span className="sr-only">
          {coverage.status === "full" ? "Taak volledig verdeeld" : coverage.status === "partial" ? "Taak deels verdeeld" : "Taak nog niet verdeeld"}
        </span>
      </button>
      {demand.isFlexible && (
        <span className="absolute right-1 top-8 z-30 rounded bg-violet-100/95 px-1 py-0.5 text-[8px] font-semibold text-violet-700 dark:bg-violet-950 dark:text-violet-300">
          {formatMinutesAsHours(demand.totalRequiredMinutes)} binnen venster
        </span>
      )}
      {gaps.map(gap => {
        const suggested = suggestedByGap.get(gap.id);
        const start = gap.startMinute - demand.startMinute;
        const end = gap.endMinute - demand.startMinute;
        const gapPosition = timelinePosition(start, end, pixelsPerMinute, 24, demand.endMinute - demand.startMinute);
        const dropEnd = suggested.endMinute;
        const droppableId = `occurrence-gap:${encodeURIComponent(String(occurrence.id))}:${dayKey}:${String(gap.startMinute).padStart(4, "0")}:${String(dropEnd).padStart(4, "0")}`;
        return (
          <Droppable key={gap.id} droppableId={droppableId} type="PERSONNEL" isDropDisabled={mutationPending}>
            {(provided, snapshot) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                data-droppable-id={droppableId}
                data-timeline-gap={`${occurrence.id}:${dayKey}:${gap.startTime}-${gap.endTime}`}
                className={cn(
                  "absolute inset-x-1 z-10 flex min-h-6 flex-col items-center justify-center rounded border border-dashed border-amber-400/70 bg-[repeating-linear-gradient(135deg,rgba(245,158,11,0.08)_0,rgba(245,158,11,0.08)_5px,transparent_5px,transparent_10px)] px-1 text-center text-amber-800 transition-colors dark:text-amber-300",
                  snapshot.isDraggingOver && "border-primary bg-primary/15 text-primary ring-2 ring-primary/40",
                )}
                style={{ top: gapPosition.top, height: gapPosition.height }}
              >
                <span className="pointer-events-none text-[8px] font-semibold tabular-nums">
                  {snapshot.isDraggingOver ? `Maak dienst ${gap.startTime}–${timelineMinutesToClock(dropEnd)}` : `Open ${gap.startTime}–${gap.endTime}`}
                </span>
                {gapPosition.height >= 44 && !snapshot.isDraggingOver && (
                  <button
                    type="button"
                    disabled={mutationPending}
                    onClick={() => onCreateOpenTaskSlice?.({
                      occurrence,
                      serviceDate: dayKey,
                      startTime: gap.startTime,
                      endTime: timelineMinutesToClock(dropEnd),
                    })}
                    className="mt-1 inline-flex items-center gap-1 rounded bg-background/90 px-1.5 py-1 text-[8px] font-semibold text-foreground shadow-sm hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Scissors className="h-2.5 w-2.5" /> Open dienst maken
                  </button>
                )}
                {gapPosition.height < 44 && !snapshot.isDraggingOver && (
                  <button
                    type="button"
                    disabled={mutationPending}
                    onClick={() => onCreateOpenTaskSlice?.({
                      occurrence,
                      serviceDate: dayKey,
                      startTime: gap.startTime,
                      endTime: timelineMinutesToClock(dropEnd),
                    })}
                    className="absolute right-0.5 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded bg-background/95 text-foreground shadow-sm hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Open dienst maken ${gap.startTime}–${timelineMinutesToClock(dropEnd)}`}
                    title={`Open dienst maken ${gap.startTime}–${timelineMinutesToClock(dropEnd)}`}
                  >
                    <Scissors className="h-2.5 w-2.5" />
                  </button>
                )}
                <div className="hidden">{provided.placeholder}</div>
              </div>
            )}
          </Droppable>
        );
      })}
      {timelineSegments.map(({ shift, segment, slice }) => (
        <TimelineShiftSegmentCard
          key={`${segment.id}:${slice.date}`}
          occurrence={occurrence}
          shift={shift}
          segment={segment}
          slice={slice}
          assignments={assignmentsByShift.get(String(shift.id)) || []}
          resourceKey={`object:${occurrence.object_id}:${dayKey}`}
          dayKey={dayKey}
          demand={demand}
          allOccurrenceSegments={allSegments.filter(item => item.status !== "removed" && String(item.task_occurrence_id) === String(occurrence.id))}
          selected={String(selectedShiftId || "") === String(shift.id)}
          pixelsPerMinute={pixelsPerMinute}
          mutationPending={mutationPending}
          onSelect={() => onSelectShift?.(shift)}
          onUnassign={assignment => onUnassign?.(shift, assignment)}
          onResizeTaskSegment={onResizeTaskSegment}
          shiftSegmentCount={(segmentsByShift.get(String(shift.id)) || []).filter(item => item.status !== "removed").length}
        />
      ))}
    </section>
  );
}

function ObjectTimelineDayCell({
  resource,
  dayKey,
  occurrences,
  shifts,
  coverageShifts,
  allSegments,
  assignmentsByShift,
  segmentsByShift,
  selectedShiftId,
  pixelsPerMinute,
  canvasHeight,
  mutationPending,
  onSelectOccurrence,
  onSelectShift,
  onUnassign,
  onCreateOpenTaskSlice,
  onResizeTaskSegment,
}) {
  const projected = occurrences.map(({ occurrence, planningState }) => {
    const demand = getTaskTimelineDemand(occurrence, dayKey);
    return demand ? { occurrence, planningState, ...demand, id: String(occurrence.id) } : null;
  }).filter(Boolean);
  const laidOut = layoutTimelineIntervalLanes(projected, {
    minimumVisualDurationMinutes: Math.ceil(30 / pixelsPerMinute),
  });
  const linkedOccurrenceIds = new Set(projected.map(item => String(item.occurrence.id)));
  const linkedSegments = shifts.filter(item => item.segment && linkedOccurrenceIds.has(String(item.segment.task_occurrence_id)));
  const unlinked = shifts.filter(item => !item.segment || !linkedOccurrenceIds.has(String(item.segment.task_occurrence_id)));
  return (
    <div
      className="relative min-w-0 overflow-hidden bg-[linear-gradient(to_bottom,hsl(var(--border)/0.45)_1px,transparent_1px)] [background-size:100%_var(--timeline-hour-height)]"
      style={{ height: canvasHeight, "--timeline-hour-height": `${pixelsPerMinute * 60}px` }}
      data-matrix-cell={`${resource.key}:${dayKey}`}
      data-timeline-day-canvas={dayKey}
    >
      {laidOut.map(item => (
        <TaskDemandTimelineOverlay
          key={item.occurrence.id}
          occurrence={item.occurrence}
          planningState={item.planningState}
          dayKey={dayKey}
          timelineSegments={linkedSegments.filter(entry => String(entry.segment?.task_occurrence_id) === String(item.occurrence.id))}
          allSegments={allSegments}
          coverageShifts={coverageShifts}
          assignmentsByShift={assignmentsByShift}
          segmentsByShift={segmentsByShift}
          lane={item.lane}
          laneCount={item.laneCount}
          pixelsPerMinute={pixelsPerMinute}
          selectedShiftId={selectedShiftId}
          mutationPending={mutationPending}
          onSelectOccurrence={onSelectOccurrence}
          onSelectShift={onSelectShift}
          onUnassign={onUnassign}
          onCreateOpenTaskSlice={onCreateOpenTaskSlice}
          onResizeTaskSegment={onResizeTaskSegment}
        />
      ))}
      {unlinked.map(({ shift, slice }, index) => {
        const start = clockToTimelineMinutes(slice?.startTime || shift.start_time);
        const end = clockToTimelineMinutes(slice?.endTime || shift.end_time);
        if (start == null || end == null || end <= start) return null;
        const position = timelinePosition(start, end, pixelsPerMinute, 28, 24 * 60);
        return (
          <button
            key={`${shift.id}:${index}`}
            type="button"
            onClick={() => onSelectShift?.(shift)}
            className="absolute inset-x-2 z-20 overflow-hidden rounded-md border border-border bg-card/95 p-2 text-left shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{ top: position.top, height: position.height }}
            data-shift-id={shift.id}
          >
            <span className="block truncate text-[10px] font-semibold">{shift.name || shift.service_name_snapshot || "Dienst"}</span>
            <span className="block text-[9px] tabular-nums text-muted-foreground">{slice?.startTime || shift.start_time}–{slice?.endTime || shift.end_time}</span>
          </button>
        );
      })}
      {projected.length === 0 && unlinked.length === 0 && (
        <span className="absolute left-2 top-2 text-[9px] text-muted-foreground/55">Geen klantvraag</span>
      )}
    </div>
  );
}

function EmployeeTimelineDayCell({ resource, dayKey, placements, segmentsByShift, pixelsPerMinute, canvasHeight, onSelectShift, onUnassign }) {
  const droppableId = `employee-day:${resource.id}:${dayKey}`;
  const projected = placements.map((placement, index) => {
    const startMinute = clockToTimelineMinutes(placement.slice?.startTime || placement.shift.start_time);
    const endMinute = clockToTimelineMinutes(placement.slice?.endTime || placement.shift.end_time);
    return startMinute != null && endMinute != null && endMinute > startMinute
      ? { ...placement, id: `${placement.shift.id}:${placement.assignment.id || index}`, startMinute, endMinute }
      : null;
  }).filter(Boolean);
  const lanes = layoutTimelineIntervalLanes(projected, { minimumVisualDurationMinutes: Math.ceil(30 / pixelsPerMinute) });
  return (
    <Droppable droppableId={droppableId} type="TASK">
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          data-droppable-id={droppableId}
          data-matrix-cell={`${resource.key}:${dayKey}`}
          data-timeline-day-canvas={dayKey}
          className={cn(
            "relative min-w-0 overflow-hidden bg-[linear-gradient(to_bottom,hsl(var(--border)/0.45)_1px,transparent_1px)] [background-size:100%_var(--timeline-hour-height)] transition-colors",
            snapshot.isDraggingOver && "bg-primary/[0.08] ring-2 ring-inset ring-primary/35",
          )}
          style={{ height: canvasHeight, "--timeline-hour-height": `${pixelsPerMinute * 60}px` }}
        >
          {lanes.map(item => {
            const position = timelinePosition(item.startMinute, item.endMinute, pixelsPerMinute, 28, 24 * 60);
            const width = 100 / item.laneCount;
            const activeSegments = (segmentsByShift.get(String(item.shift.id)) || []).filter(segment => segment.status !== "removed");
            return (
              <article
                key={item.id}
                className="absolute z-20 overflow-hidden rounded-md border border-primary/35 bg-card/95 p-2 shadow-md"
                style={{ top: position.top, height: position.height, left: `calc(${item.lane * width}% + 3px)`, width: `calc(${width}% - 6px)` }}
                data-shift-id={item.shift.id}
              >
                <button type="button" onClick={() => onSelectShift?.(item.shift)} className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="block truncate text-[10px] font-semibold">{item.shift.name || item.shift.service_name_snapshot || "Dienst"}</span>
                  <span className="block text-[9px] tabular-nums text-muted-foreground">{item.slice?.startTime || item.shift.start_time}–{item.slice?.endTime || item.shift.end_time}</span>
                  <span className="block truncate text-[8px] text-muted-foreground">{activeSegments.length > 1 ? `${activeSegments.length} taken` : item.shift.object_name || item.shift.object_name_snapshot || "Planning"}</span>
                </button>
                <button type="button" onClick={() => onUnassign?.(item.assignment)} className="absolute right-1 top-1 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`${item.shift.name || "Dienst"} vrijmaken`}>
                  <UserMinus className="h-3 w-3" />
                </button>
              </article>
            );
          })}
          {projected.length === 0 && (
            <p className="absolute left-2 top-2 rounded border border-dashed border-border px-2 py-1 text-[9px] text-muted-foreground/60">
              {snapshot.isDraggingOver ? "Loslaten om taak hier te plannen" : "Sleep hier een open taak"}
            </p>
          )}
          <div className="hidden">{provided.placeholder}</div>
        </div>
      )}
    </Droppable>
  );
}

function TimelineDayRuler({ day, canvasHeight, pixelsPerMinute }) {
  return (
    <div className="relative" style={{ height: canvasHeight }}>
      <div className="sticky top-14 z-20 border-b border-border bg-card/95 shadow-sm backdrop-blur">
        <DayHeader day={day} />
      </div>
      {Array.from({ length: 13 }, (_, index) => index * 2).map(hour => (
        <span
          key={hour}
          className="absolute right-2 -translate-y-1/2 text-[9px] font-medium tabular-nums text-muted-foreground"
          style={{ top: hour * 60 * pixelsPerMinute }}
        >
          {String(hour).padStart(2, "0")}:00
        </span>
      ))}
    </div>
  );
}

function ObjectDayCell({
  resource,
  dayKey,
  occurrences,
  shifts,
  assignmentsByShift,
  segmentsByShift,
  selectedShiftId,
  onSelectOccurrence,
  onFillStaffing,
  onSelectShift,
  onUnassign,
  onMove,
  onCopy,
  onEditComposition,
  onCancelComposition,
}) {
  const cellOccurrences = sortByStart(occurrences, item => item.projection?.startTime || item.occurrence?.window_start_time);
  const groupedShifts = new Map();
  sortByStart(shifts, item => item.slice?.startTime || item.segment?.start_time || item.shift?.start_time).forEach(projection => {
    const shiftId = String(projection.shift.id);
    if (!groupedShifts.has(shiftId)) groupedShifts.set(shiftId, { shift: projection.shift, projections: [] });
    groupedShifts.get(shiftId).projections.push(projection);
  });
  const cellShifts = [...groupedShifts.values()];
  return (
    <div className="min-h-[112px] space-y-1.5 p-2" data-matrix-cell={`${resource.key}:${dayKey}`}>
      {cellOccurrences.map(({ occurrence, planningState, projection }) => (
        <TaskOccurrenceBlock
          key={occurrence.id}
          occurrence={occurrence}
          planningState={planningState}
          projection={projection}
          onSelectOccurrence={onSelectOccurrence}
          onFillStaffing={onFillStaffing}
        />
      ))}
      {cellShifts.map(({ shift, projections }) => (
        <MatrixShiftBlock
          key={shift.id}
          shift={shift}
          projections={projections}
          assignments={assignmentsByShift.get(String(shift.id)) || []}
          segments={segmentsByShift.get(String(shift.id)) || []}
          resourceKey={`${resource.key}:${dayKey}:shift:${shift.id}`}
          serviceDate={dayKey}
          selected={String(selectedShiftId || "") === String(shift.id)}
          onSelect={() => onSelectShift?.(shift)}
          onUnassign={assignment => onUnassign?.(shift, assignment)}
          onMove={onMove}
          onCopy={onCopy}
          onEditComposition={onEditComposition}
          onCancelComposition={onCancelComposition}
        />
      ))}
      {cellOccurrences.length === 0 && cellShifts.length === 0 && <span className="block px-1 py-2 text-[9px] text-muted-foreground/60">Geen planning</span>}
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
 *   `occurrence:<occurrence>:<YYYY-MM-DD>`; both preserve the visible day,
 *   while cross-day slots require full-shift confirmation.
 * - task drops: `employee-day:<personnel>:<YYYY-MM-DD>`; resolve this to an
 *   explicit compose/add-to-shift + assignment confirmation in Planning.jsx.
 */
export default function PlanningMatrix({
  perspective,
  orientation = "days_horizontal",
  layout = "cards",
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
  onFillStaffing,
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
  const occurrencePlanningStates = useMemo(() => new Map(occurrences.map(occurrence => [
    String(occurrence.id),
    getOccurrencePlanningState({
      occurrence,
      segments: coverageSegments,
      shifts: coverageShifts,
      assignments,
    }),
  ])), [assignments, coverageSegments, coverageShifts, occurrences]);
  const resources = useMemo(() => perspective === "employee"
    ? buildEmployeeResources(personnel)
    : buildObjectResources({ objects, routes, shifts, occurrences, segmentsByShift }),
  [objects, occurrences, personnel, perspective, routes, segmentsByShift, shifts]);

  const occurrencesByCell = useMemo(() => {
    const map = new Map();
    const visibleDays = days.map(dateKey);
    const displayedOccurrenceIds = new Set(segmentsByShift.allSegments
      .map(segment => segment.task_occurrence_id)
      .filter(Boolean)
      .map(String));
    occurrences.filter(item => item.lifecycle_status !== "cancelled").forEach(item => {
      if (!item.object_id) return;
      const projection = visibleDays
        .map(day => getTaskOccurrenceDayProjection(item, day))
        .find(Boolean);
      if (!projection) return;
      const planningState = occurrencePlanningStates.get(String(item.id));
      const coverage = planningState?.coverage || getTaskOccurrenceCoverage(item, coverageSegments);
      if (coverage.status === "full" && displayedOccurrenceIds.has(String(item.id))) return;
      appendToMap(map, `object:${item.object_id}:${projection.date}`, { occurrence: item, planningState, projection });
    });
    return map;
  }, [coverageSegments, days, occurrencePlanningStates, occurrences, segmentsByShift]);
  const occurrencesByTimelineCell = useMemo(() => {
    const map = new Map();
    const visibleDays = days.map(dateKey);
    occurrences.filter(item => item.lifecycle_status !== "cancelled").forEach(item => {
      if (!item.object_id) return;
      visibleDays.forEach(day => {
        const projection = getTaskOccurrenceDayProjection(item, day);
        if (!projection) return;
        appendToMap(map, `object:${item.object_id}:${day}`, {
          occurrence: item,
          planningState: occurrencePlanningStates.get(String(item.id)),
          projection,
        });
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
        assignmentsByShift={assignmentsByShift}
        segmentsByShift={segmentsByShift}
        selectedShiftId={selectedShiftId}
        onSelectOccurrence={onSelectOccurrence}
        onFillStaffing={onFillStaffing}
        onSelectShift={onSelectShift}
        onUnassign={onUnassign}
        onMove={onMove}
        onCopy={onCopy}
        onEditComposition={onEditComposition}
        onCancelComposition={onCancelComposition}
      />
    );
  };

  if (layout === "timeline") {
    const hourHeight = Math.max(22, Math.round((compact ? 25 : 32) * zoom));
    const pixelsPerMinute = hourHeight / 60;
    const canvasHeight = hourHeight * 24;
    const renderTimelineCell = (resource, day) => {
      const key = dateKey(day);
      return perspective === "employee" ? (
        <EmployeeTimelineDayCell
          resource={resource}
          dayKey={key}
          placements={placementsByEmployeeCell.get(`${resource.id}:${key}`) || []}
          segmentsByShift={segmentsByShift}
          pixelsPerMinute={pixelsPerMinute}
          canvasHeight={canvasHeight}
          onSelectShift={onSelectShift}
          onUnassign={item => {
            const shift = shiftsById.get(String(item.planning_shift_id || item.shift_id));
            onUnassign?.(shift, item);
          }}
        />
      ) : (
        <ObjectTimelineDayCell
          resource={resource}
          dayKey={key}
          occurrences={occurrencesByTimelineCell.get(`${resource.key}:${key}`) || []}
          shifts={shiftsByObjectCell.get(`${resource.key}:${key}`) || []}
          coverageShifts={coverageShifts}
          allSegments={coverageSegments}
          assignmentsByShift={assignmentsByShift}
          segmentsByShift={segmentsByShift}
          selectedShiftId={selectedShiftId}
          pixelsPerMinute={pixelsPerMinute}
          canvasHeight={canvasHeight}
          mutationPending={mutationPending}
          onSelectOccurrence={onSelectOccurrence}
          onSelectShift={onSelectShift}
          onUnassign={onUnassign}
          onCreateOpenTaskSlice={onCreateOpenTaskSlice}
          onResizeTaskSegment={onResizeTaskSegment}
        />
      );
    };

    return (
      <div className="h-full min-h-0">
        <div className="h-full min-h-0 overflow-auto overscroll-contain bg-background [scrollbar-gutter:stable]" data-testid="planning-matrix-scroll">
          <table className="min-w-max table-fixed border-separate border-spacing-0" aria-label={perspective === "employee" ? "Planning per medewerker" : "Planning per object"} data-planning-layout="timeline">
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 top-0 z-50 w-[138px] min-w-[138px] border-b border-r border-border bg-card text-left shadow-[4px_4px_10px_rgba(15,23,42,0.04)]">
                  <span className="block px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Dag · tijd</span>
                </th>
                {resources.map(resource => (
                  <th key={resource.key} scope="col" className="sticky top-0 z-40 w-[260px] min-w-[260px] max-w-[260px] border-b border-r border-border bg-card/95 align-top backdrop-blur last:border-r-0">
                    <ResourceHeader resource={resource} perspective={perspective} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map(day => {
                const key = dateKey(day);
                return (
                  <tr key={key} style={{ contentVisibility: "auto", containIntrinsicSize: `${canvasHeight}px` }}>
                    <th scope="row" className="sticky left-0 z-30 w-[138px] min-w-[138px] border-b border-r border-border bg-card align-top text-left shadow-[4px_0_10px_rgba(15,23,42,0.025)]">
                      <TimelineDayRuler day={day} canvasHeight={canvasHeight} pixelsPerMinute={pixelsPerMinute} />
                    </th>
                    {resources.map(resource => (
                      <td key={`${resource.key}:${key}`} className="w-[260px] min-w-[260px] max-w-[260px] border-b border-r border-border/80 align-top last:border-r-0">
                        {renderTimelineCell(resource, day)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
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
          compact && "[&_[data-matrix-cell]]:min-h-[72px] [&_[data-matrix-cell]]:p-1 [&_article]:p-1.5 [&_[data-planning-dimensions]]:hidden [&_.compact-hide]:hidden",
        )}
        aria-label={perspective === "employee" ? "Planning per medewerker" : "Planning per object"}
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
