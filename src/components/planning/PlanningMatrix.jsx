import React, { useMemo } from "react";
import { Droppable } from "@hello-pangea/dnd";
import {
  AlertTriangle,
  Check,
  Clock3,
  Copy,
  Layers3,
  MapPin,
  MoreHorizontal,
  MoveRight,
  Route,
  Trash2,
  UserMinus,
  UserRound,
  UserRoundPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import ObjectDayTimeline from "@/components/planning/ObjectDayTimeline";
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
  const timelineItems = [
    ...cellOccurrences.map(({ occurrence, planningState, projection }) => ({
      id: `occurrence:${occurrence.id}`,
      label: occurrence.task_name_snapshot || "Taak",
      start: projection?.startTime || occurrence.window_start_time || "00:00",
      end: projection?.endTime || occurrence.window_end_time || "24:00",
      tone: planningState?.coverage?.status || "open",
      onClick: () => planningState?.coverage?.status === "full" && planningState?.readiness === "needs_staffing"
        ? onFillStaffing?.(occurrence)
        : onSelectOccurrence?.(occurrence),
    })),
    ...cellShifts.flatMap(({ shift, projections }) => projections.map((projection, index) => ({
      id: projection.projectionKey || `shift:${shift.id}:${index}`,
      label: projection.segment?.task_name_snapshot || shift.name || shift.service_name_snapshot || "Dienst",
      start: projection.slice?.startTime || projection.segment?.start_time || shift.start_time || "00:00",
      end: projection.slice?.endTime || projection.segment?.end_time || shift.end_time || "24:00",
      tone: "primary",
      onClick: () => onSelectShift?.(shift),
    }))),
  ];
  return (
    <div className={cn("min-h-[112px] space-y-1.5", resource.kind === "object" ? "p-0" : "p-2")} data-matrix-cell={`${resource.key}:${dayKey}`}>
      {resource.kind === "object" ? (
        <ObjectDayTimeline items={timelineItems} />
      ) : (
        <>
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
        </>
      )}
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