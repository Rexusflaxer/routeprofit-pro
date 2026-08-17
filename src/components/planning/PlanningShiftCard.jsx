import React from "react";
import { Droppable } from "@hello-pangea/dnd";
import {
  AlertTriangle,
  Check,
  Clock3,
  Layers3,
  UserRoundPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";

function initials(name) {
  return String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join("")
    .toUpperCase();
}

function warningCount(assignment) {
  return Array.isArray(assignment?.warnings)
    ? assignment.warnings.length
    : Array.isArray(assignment?.warning_snapshot)
    ? assignment.warning_snapshot.length
    : Number(assignment?.warning_count || 0);
}

function compositionWarnings(shift) {
  const warnings = shift?.service_context_snapshot?.composition_warnings;
  return Array.isArray(warnings) ? warnings : [];
}

function Slot({
  shift,
  slotIndex,
  assignment,
  onSelect,
  compact,
}) {
  const droppableId = `slot:${shift.id}:${slotIndex}`;
  const warnings = warningCount(assignment);

  return (
    <Droppable droppableId={droppableId} type="PERSONNEL" isDropDisabled={Boolean(assignment)}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          className={cn(
            "relative flex min-h-7 items-center gap-1.5 rounded border px-1.5 py-1 transition-colors",
            assignment
              ? "border-border bg-background/80"
              : "border-dashed border-border bg-muted/35 text-muted-foreground",
            snapshot.isDraggingOver && "border-primary bg-primary/10 ring-2 ring-primary/25",
          )}
        >
          {assignment ? (
            <>
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[9px] font-bold text-primary">
                {initials(assignment.personnel_name || assignment.personnel_name_snapshot || assignment.employee_name)}
              </span>
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left text-[11px] font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={event => {
                  event.stopPropagation();
                  onSelect();
                }}
                title={assignment.personnel_name || assignment.personnel_name_snapshot || assignment.employee_name}
              >
                {assignment.personnel_name || assignment.personnel_name_snapshot || assignment.employee_name || "Onbekende medewerker"}
              </button>
              {warnings > 0 && (
                <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-amber-700 dark:text-amber-300" title={`${warnings} waarschuwingen`}>
                  <AlertTriangle className="h-3 w-3" />
                  {warnings}
                </span>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={event => {
                event.stopPropagation();
                onSelect();
              }}
              className="flex min-w-0 flex-1 items-center gap-1 text-left text-[10px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Open bezettingsplaats ${slotIndex + 1} voor ${shift.name}`}
            >
              <UserRoundPlus className="h-3 w-3 shrink-0" />
              {!compact && <span className="truncate">Sleep of kies medewerker</span>}
              {compact && <span>Open</span>}
            </button>
          )}
          <div className="hidden">{provided.placeholder}</div>
        </div>
      )}
    </Droppable>
  );
}

export default function PlanningShiftCard({
  shift,
  assignments = [],
  segments = [],
  selected,
  onSelect,
  compact = false,
  className,
  style,
}) {
  const requiredCount = Math.max(1, Number(shift.required_count || 1));
  const activeAssignments = assignments.filter(item => item.status !== "removed");
  const openCount = Math.max(0, requiredCount - activeAssignments.length);
  const assignmentWarningTotal = activeAssignments.reduce((sum, item) => sum + warningCount(item), 0);
  const shiftCompositionWarnings = compositionWarnings(shift);
  const warningTotal = assignmentWarningTotal + shiftCompositionWarnings.length;
  const compositionWarningDetails = shiftCompositionWarnings
    .map(item => item.message || item.detail || item.title || item.code)
    .filter(Boolean)
    .join("\n");
  const activeSegments = segments
    .filter(item => item.status !== "removed")
    .sort((left, right) => Number(left.sequence_index || 0) - Number(right.sequence_index || 0));
  const objectCount = new Set(activeSegments.map(item => String(item.object_id)).filter(Boolean)).size;
  const slots = Array.from({ length: requiredCount }, (_, slotIndex) => ({
    slotIndex,
    assignment: activeAssignments.find(item => Number(item.slot_index || 0) === slotIndex)
      || activeAssignments[slotIndex]
      || null,
  }));

  return (
    <article
      aria-label={`${shift.name || "Dienst"}, ${shift.start_time || "--:--"} tot ${shift.end_time || "--:--"}, ${openCount} open plaatsen`}
      className={cn(
        "group relative min-w-0 rounded-md border bg-card p-2 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all hover:border-primary/45 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        shift.status === "draft" ? "border-dashed border-primary/45" : "border-border",
        selected && "border-primary ring-2 ring-primary/20",
        className,
      )}
      style={style}
    >
      <div className="flex items-start gap-1">
        <button type="button" onClick={onSelect} className="min-w-0 flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[11px] font-semibold leading-tight text-foreground">
              {shift.name || shift.route_name || "Naamloze dienst"}
            </p>
            {shift.status === "published" && (
              <Check className="h-3 w-3 shrink-0 text-emerald-600" aria-label="Gepubliceerd" />
            )}
          </div>
          <p className="mt-0.5 flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
            <Clock3 className="h-3 w-3" />
            {shift.start_time || "--:--"}–{shift.end_time || "--:--"}
            {Number(shift.required_count || 1) > 1 && <span>· {activeAssignments.length}/{requiredCount}</span>}
          </p>
        </button>


      </div>

      {activeSegments.length > 0 && (
        <button type="button" onClick={onSelect} className="mt-1.5 w-full rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="flex h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            {activeSegments.map((segment, index) => (
              <span key={segment.id || `${segment.task_occurrence_id}-${index}`} className={cn("h-full flex-1", index % 3 === 0 ? "bg-primary" : index % 3 === 1 ? "bg-sky-500" : "bg-violet-500")} />
            ))}
          </span>
          <span className="mt-1 flex items-center gap-1 text-[9px] font-medium text-muted-foreground">
            <Layers3 className="h-2.5 w-2.5" />
            {activeSegments.length} {activeSegments.length === 1 ? "taak" : "taken"}
            {objectCount > 1 && ` · ${objectCount} objecten`}
          </span>
        </button>
      )}

      <div className={cn("mt-1.5 space-y-1", compact && "mt-1")}>
        {slots.map(slot => (
          <Slot
            key={slot.slotIndex}
            shift={shift}
            slotIndex={slot.slotIndex}
            assignment={slot.assignment}
            onSelect={onSelect}
            compact={compact}
          />
        ))}
      </div>

      {(openCount > 0 || warningTotal > 0) && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[9px] font-semibold">
          {openCount > 0 && (
            <span className="rounded bg-rose-100 px-1.5 py-0.5 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
              {openCount} open
            </span>
          )}
          {warningTotal > 0 && (
            <span
              className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
              aria-label={`${warningTotal} waarschuwingen${shiftCompositionWarnings.length ? `, waarvan ${shiftCompositionWarnings.length} dienstcontroles` : ""}`}
              title={compositionWarningDetails || `${warningTotal} waarschuwingen`}
            >
              <AlertTriangle className="h-2.5 w-2.5" />
              {warningTotal}
              {shiftCompositionWarnings.length > 0 && <span>controle</span>}
            </span>
          )}
        </div>
      )}
    </article>
  );
}