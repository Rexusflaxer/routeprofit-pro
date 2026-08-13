import React, { useMemo, useState } from "react";
import { Draggable, Droppable } from "@hello-pangea/dnd";
import {
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  GripVertical,
  Layers3,
  ListTodo,
  Plus,
  Search,
  UserRoundPlus,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  formatMinutesAsHours,
  getOccurrencePlanningState,
  getTaskOccurrenceDayProjection,
  getTaskOccurrenceCoverage,
  sortTaskSegments,
} from "@/components/planning/planningDomain";
import { cn } from "@/lib/utils";

const dateFormatter = new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "short" });

function dateLabel(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  return year && month && day ? dateFormatter.format(new Date(year, month - 1, day, 12)) : value;
}

function coverageLabel(coverage, planningState) {
  if (planningState?.readiness === "ready") return "Gereed";
  if (coverage.status === "full" && planningState?.openSlots > 0) {
    return `${planningState.openSlots} ${planningState.openSlots === 1 ? "plaats" : "plaatsen"} open`;
  }
  if (coverage.status === "partial") return `${formatMinutesAsHours(coverage.remainingMinutes)} resterend`;
  return "Nog niet gepland";
}

function statusClass(status, readiness) {
  if (readiness === "ready") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300";
  if (status === "full" && readiness === "needs_staffing") return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300";
  if (status === "partial") return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300";
  return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300";
}

function OccurrenceCardContent({ occurrence, coverage, planningState, projection, selectedShift, selectedShiftPending = false, onCreate, onAdd, onFillStaffing, dragEnabled, dragIndex, dragProvided, isDragging, disabled = false }) {
  const percentage = coverage.requiredMinutes > 0
    ? Math.min(100, Math.round((coverage.allocatedMinutes / coverage.requiredMinutes) * 100))
    : 0;
  const needsWork = planningState?.readiness !== "ready";
  return (
    <article
      ref={dragProvided?.innerRef}
      {...(dragProvided?.draggableProps || {})}
      data-task-draggable-id={dragEnabled ? `task:${occurrence.id}` : undefined}
      data-task-draggable-index={dragEnabled ? dragIndex : undefined}
      aria-busy={disabled ? "true" : "false"}
      className={cn(
        "rounded-[10px] border border-primary/20 border-l-[3px] border-l-primary bg-[linear-gradient(145deg,hsl(var(--card))_0%,hsl(var(--accent))_100%)] p-2.5 shadow-[0_6px_18px_hsl(var(--primary)/0.08),inset_0_1px_0_hsl(var(--primary-foreground)/0.65)] transition-[border-color,box-shadow,transform] hover:-translate-y-px hover:border-primary/35 hover:shadow-[0_9px_24px_hsl(var(--primary)/0.13)]",
        isDragging && "z-50 border-primary shadow-xl ring-2 ring-primary/25",
      )}
    >
      <div className="flex items-start gap-2">
        {!needsWork ? (
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" />
          </span>
        ) : dragEnabled ? (
          <button
            type="button"
            disabled={disabled}
            {...(dragProvided?.dragHandleProps || {})}
            className="mt-0.5 flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded-md bg-primary/10 text-primary hover:bg-primary/15 active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-40"
            aria-label={`${occurrence.task_name_snapshot || "Taak"} slepen`}
            title="Sleep deze taak naar een medewerker op een dag binnen het taakvenster"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        ) : (
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <ListTodo className="h-3.5 w-3.5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-semibold">{occurrence.task_name_snapshot || "Taak"}</p>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
            {occurrence.object_name_snapshot || "Onbekend object"} · {projection?.startTime || occurrence.window_start_time}–{projection?.endTime || occurrence.window_end_time}
            {projection?.continuesBefore ? " · vervolg" : projection?.continuesAfter ? " · loopt door" : ""}
          </p>
        </div>
        <Badge variant="outline" className={cn("h-5 shrink-0 rounded px-1.5 text-[9px]", statusClass(coverage.status, planningState?.readiness))}>
          {coverageLabel(coverage, planningState)}
        </Badge>
      </div>
      <div className="mt-2">
        <div className="mb-1 flex items-center justify-between text-[9px] text-muted-foreground">
          <span>{formatMinutesAsHours(coverage.allocatedMinutes)} van {formatMinutesAsHours(coverage.requiredMinutes)}</span>
          <span>{percentage}%</span>
        </div>
        <Progress value={percentage} className="h-1.5" />
      </div>
      {coverage.status !== "full" && (
        <div className="mt-2 flex flex-wrap justify-end gap-1.5">
          {selectedShift?.source_type === "task" && selectedShift.service_date === occurrence.service_date && (
            <Button disabled={disabled || selectedShiftPending} variant="outline" size="sm" className="h-7 px-2 text-[10px]" onClick={() => onAdd(occurrence)}>
              <Plus className="h-3 w-3" /> Aan deze dienst
            </Button>
          )}
          <Button disabled={disabled} size="sm" className="h-7 px-2 text-[10px]" onClick={() => onCreate(occurrence)}>
            Nieuwe dienst <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      )}
      {coverage.status === "full" && planningState?.readiness === "needs_staffing" && planningState.openSlots > 0 && (
        <div className="mt-2 flex justify-end">
          <Button disabled={disabled} size="sm" className="h-7 px-2 text-[10px]" onClick={() => onFillStaffing?.(occurrence)}>
            <UserRoundPlus className="h-3 w-3" /> Bezetting invullen
          </Button>
        </div>
      )}
    </article>
  );
}

function OccurrenceCard({ enableTaskDrag, index, ...props }) {
  if (!enableTaskDrag) return <OccurrenceCardContent {...props} dragEnabled={false} />;
  return (
    <Draggable draggableId={`task:${props.occurrence.id}`} index={index} isDragDisabled={props.planningState?.readiness === "ready" || props.disabled}>
      {(provided, snapshot) => (
        <OccurrenceCardContent {...props} dragEnabled dragIndex={index} dragProvided={provided} isDragging={snapshot.isDragging} />
      )}
    </Draggable>
  );
}

function BacklogGroups({ groups, itemIndexById, enableTaskDrag, selectedShift, selectedShiftPending, onCreateShift, onAddToShift, onFillStaffing }) {
  if (groups.length === 0) {
    return (
      <div className="m-2 rounded-lg border border-dashed border-border bg-card p-5 text-center">
        <CheckCircle2 className="mx-auto h-6 w-6 text-emerald-600" />
        <p className="mt-2 text-[11px] font-semibold">Geen taken in deze selectie</p>
        <p className="mt-1 text-[10px] text-muted-foreground">Alle taken zijn gepland of passen niet bij het gekozen filter.</p>
      </div>
    );
  }

  return groups.map(group => (
    <section key={group.date}>
      <h3 className="mb-1.5 flex items-center gap-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <CalendarClock className="h-3 w-3" /> {dateLabel(group.date)}
      </h3>
      <div className="space-y-1.5">
        {group.items.map(item => (
          <OccurrenceCard
            key={item.occurrence.id}
            {...item}
            index={itemIndexById.get(String(item.occurrence.id))}
            enableTaskDrag={enableTaskDrag}
            selectedShift={selectedShift}
            selectedShiftPending={selectedShiftPending}
            onCreate={onCreateShift}
            onAdd={onAddToShift}
            onFillStaffing={onFillStaffing}
          />
        ))}
      </div>
    </section>
  ));
}

export default function PlanningTaskBacklog({
  occurrences = [],
  segments = [],
  shifts = null,
  assignments = [],
  selectedShift,
  onCreateShift,
  onAddToShift,
  onFillStaffing,
  onEditShift,
  onClearShift,
  enableTaskDrag = false,
  periodStart = null,
  pendingResourceKeys = null,
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("work");
  const items = useMemo(() => occurrences.map(occurrence => {
    const planningState = Array.isArray(shifts)
      ? getOccurrencePlanningState({ occurrence, segments, shifts, assignments })
      : (() => {
          const coverage = getTaskOccurrenceCoverage(occurrence, segments);
          return {
            coverage,
            openSlots: 0,
            readiness: coverage.status === "full"
              ? "ready"
              : coverage.status === "open"
                ? "unplanned"
                : "needs_staffing",
          };
        })();
    const projectionDate = periodStart && String(occurrence.service_date) < String(periodStart)
      ? periodStart
      : occurrence.service_date;
    return {
      occurrence,
      coverage: planningState.coverage,
      planningState,
      projection: getTaskOccurrenceDayProjection(occurrence, projectionDate),
      disabled: pendingResourceKeys instanceof Set
        && pendingResourceKeys.has(`occurrence:${occurrence.id}`),
    };
  }).filter(item => {
    if (status === "work" && item.planningState.readiness === "ready") return false;
    if (status === "open" && item.planningState.readiness !== "unplanned") return false;
    if (status === "partial" && item.planningState.readiness !== "needs_staffing") return false;
    const query = search.trim().toLocaleLowerCase("nl-NL");
    return !query || [
      item.occurrence.task_name_snapshot,
      item.occurrence.object_name_snapshot,
      item.occurrence.customer_name_snapshot,
    ].filter(Boolean).some(value => String(value).toLocaleLowerCase("nl-NL").includes(query));
  }), [assignments, occurrences, pendingResourceKeys, periodStart, search, segments, shifts, status]);
  const groups = useMemo(() => [...new Set(items.map(item => item.projection?.date || item.occurrence.service_date))]
    .sort()
    .map(date => ({ date, items: items.filter(item => (item.projection?.date || item.occurrence.service_date) === date) })), [items]);
  const itemIndexById = useMemo(() => new Map(
    groups.flatMap(group => group.items).map((item, index) => [String(item.occurrence.id), index]),
  ), [groups]);
  const selectedSegments = selectedShift
    ? sortTaskSegments(segments.filter(segment => String(segment.shift_id) === String(selectedShift.id)))
    : [];
  const selectedShiftPending = Boolean(
    selectedShift
    && pendingResourceKeys instanceof Set
    && pendingResourceKeys.has(`shift:${selectedShift.id}`),
  );

  return (
    <section className="flex h-full min-h-0 flex-col bg-muted/20" aria-label="Taakwerkvoorraad">
      <div className="shrink-0 border-b border-border bg-card px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-1.5 text-[13px] font-semibold"><ListTodo className="h-4 w-4 text-primary" /> Taken om in te plannen</h2>
            <p className="mt-0.5 text-[10px] text-muted-foreground">Maak expliciet een dienst; na opslaan wordt de doeldienst gewist.</p>
          </div>
          <Badge variant="outline" className="rounded text-[9px]">{items.length} zichtbaar</Badge>
        </div>
        <div className="relative mt-2">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Zoek taak, object of klant" className="h-8 bg-background pl-8 text-[11px]" aria-label="Zoek in taakwerkvoorraad" />
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1 rounded-md bg-muted p-1">
          {[["work", "Te doen"], ["open", "Open"], ["partial", "Deels/bezet"], ["all", "Alles"]].map(([value, label]) => (
            <button key={value} type="button" aria-pressed={status === value} onClick={() => setStatus(value)} className={cn("rounded px-1.5 py-1 text-[9px] font-medium", status === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{label}</button>
          ))}
        </div>
      </div>

      {selectedShift?.source_type === "task" && (
        <div className="shrink-0 border-b border-border bg-primary/[0.04] p-3" aria-busy={selectedShiftPending ? "true" : "false"}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[11px] font-semibold">{selectedShift.name}</p>
              <p className="mt-0.5 text-[9px] text-muted-foreground">{selectedSegments.length} taaksegmenten · {selectedShift.start_time}–{selectedShift.end_time}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px]" onClick={onClearShift} aria-label="Doeldienst wissen">
                <X className="h-3 w-3" /> Doel wissen
              </Button>
              <Button
                disabled={selectedShiftPending}
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[10px]"
                onClick={() => onEditShift(selectedShift)}
              >
                <Layers3 className="h-3 w-3" /> Inhoud bewerken
              </Button>
            </div>
          </div>
        </div>
      )}

      {enableTaskDrag ? (
        <Droppable droppableId="task-pool" type="TASK" isDropDisabled>
          {provided => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2.5" data-droppable-id="task-pool">
              <BacklogGroups
                groups={groups}
                itemIndexById={itemIndexById}
                enableTaskDrag
                selectedShift={selectedShift}
                selectedShiftPending={selectedShiftPending}
                onCreateShift={onCreateShift}
                onAddToShift={onAddToShift}
                onFillStaffing={onFillStaffing}
              />
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      ) : (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2.5">
          <BacklogGroups
            groups={groups}
            itemIndexById={itemIndexById}
            enableTaskDrag={false}
            selectedShift={selectedShift}
            selectedShiftPending={selectedShiftPending}
            onCreateShift={onCreateShift}
            onAddToShift={onAddToShift}
            onFillStaffing={onFillStaffing}
          />
        </div>
      )}
    </section>
  );
}