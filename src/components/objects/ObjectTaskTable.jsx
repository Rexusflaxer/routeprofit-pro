import React, { useMemo } from "react";
import { AlertTriangle, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { WEEKDAYS, taskTypeLabel } from "./objectTaskConfig";

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function byDefinition(items, key = "task_definition_id") {
  return items.reduce((map, item) => {
    const id = String(item?.[key] || item?.object_task_definition_id || "");
    if (!id) return map;
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(item);
    return map;
  }, new Map());
}

function revisionsById(revisions) {
  return revisions.reduce((map, revision) => {
    const revisionId = String(revision?.id || "");
    if (revisionId) map.set(revisionId, revision);
    return map;
  }, new Map());
}

function activeSchedules(series, revisionMap) {
  return series.flatMap(item => {
    if (["archived", "stopped"].includes(item.status)) return [];
    const currentRevisionId = String(item.current_revision_id || "");
    if (!currentRevisionId) return [];
    const nestedCurrent = String(item.current_revision?.id || "") === currentRevisionId
      ? item.current_revision
      : null;
    const revision = nestedCurrent || revisionMap.get(currentRevisionId);
    if (!revision || revision.operation === "stop") return [];
    return [{ series: item, revision }];
  });
}

function legacySchedules(task) {
  if (task.schedule_periods?.length) {
    return task.schedule_periods.map(period => ({
      revision: {
        start_time: period.start_time,
        end_time: period.end_time,
        frequency: task.recurrence_type === "one_time" ? "once" : "weekly",
        weekday: DAY_KEYS.findIndex(day => period.days?.includes(day)) + 1,
      },
    }));
  }
  return (task.weekdays || []).map(weekday => ({
    revision: {
      start_time: task.start_time,
      end_time: task.end_time,
      frequency: task.recurrence_type === "one_time" ? "once" : "weekly",
      weekday,
    },
  }));
}

function taskSchedules(task, series, revisionMap) {
  const current = activeSchedules(series, revisionMap);
  return current.length || series.length ? current : legacySchedules(task);
}

function timeLabel(schedules) {
  if (!schedules.length) return "—";
  if (schedules.length > 1) return `${schedules.length} tijdvakken`;
  const revision = schedules[0].revision;
  return `${revision.start_time || "—"} – ${revision.end_time || "—"}${Number(revision.end_day_offset || 0) > 0 || (revision.end_time && revision.start_time && revision.end_time <= revision.start_time) ? " (+1)" : ""}`;
}

function recurrenceLabel(schedules) {
  if (!schedules.length) return "—";
  const weekly = schedules.filter(({ revision }) => ["weekly", "week"].includes(revision.frequency || revision.recurrence_type)).length;
  const once = schedules.length - weekly;
  if (weekly && once) return "Wekelijks en eenmalig";
  if (weekly) return "Wekelijks";
  return schedules.length === 1 ? "Eenmalig" : `${schedules.length} eenmalige momenten`;
}

function weekdayLabel(schedules) {
  const values = [...new Set(schedules
    .filter(({ revision }) => ["weekly", "week"].includes(revision.frequency || revision.recurrence_type))
    .map(({ revision }) => Number(revision.weekday))
    .filter(value => value >= 1 && value <= 7))]
    .sort((left, right) => left - right);
  if (!values.length) return "—";
  return values.map(value => WEEKDAYS.find(day => day.value === value)?.label).filter(Boolean).join(", ");
}

function executionLabel(task) {
  return task.execution_mode === "continuous"
    ? "Aaneengesloten"
    : `${Number(task.duration_minutes || 0)} min binnen venster`;
}

export default function ObjectTaskTable({
  rows,
  series = [],
  revisions = [],
  sourceChanges = [],
  selectedDefinitionId = null,
  disabled = false,
  onViewSchedule,
  onOpenSchedule,
}) {
  const seriesMap = useMemo(() => byDefinition(series), [series]);
  const revisionMap = useMemo(() => revisionsById(revisions), [revisions]);
  const changeMap = useMemo(
    () => byDefinition(sourceChanges.filter(change => !["resolved", "closed"].includes(change.status)), "object_task_definition_id"),
    [sourceChanges],
  );
  const model = rows.map(task => ({
    task,
    schedules: taskSchedules(task, seriesMap.get(String(task.id)) || [], revisionMap),
    changes: changeMap.get(String(task.id)) || [],
  }));

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-card/25 hover:bg-card/25">
              <TableHead>Taak</TableHead>
              <TableHead>Uitvoering</TableHead>
              <TableHead>Tijd</TableHead>
              <TableHead>Herhaling</TableHead>
              <TableHead>Dagen</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {model.map(({ task, schedules, changes }) => (
              <TableRow
                key={task.id}
                className="group cursor-pointer hover:bg-muted/20"
                onClick={() => !disabled && onViewSchedule?.(task)}
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{taskTypeLabel(task)}</span>
                    {changes.length > 0 && (
                      <span title={`${changes.length} ${changes.length === 1 ? "dienst vraagt" : "diensten vragen"} controle`}>
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-300" />
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell><Badge variant="outline">{executionLabel(task)}</Badge></TableCell>
                <TableCell>{timeLabel(schedules)}</TableCell>
                <TableCell>{recurrenceLabel(schedules)}</TableCell>
                <TableCell>{weekdayLabel(schedules)}</TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant={String(selectedDefinitionId) === String(task.id) ? "secondary" : "ghost"}
                      size="icon"
                      aria-label={`Rooster wijzigen voor ${taskTypeLabel(task)}`}
                      title="Rooster wijzigen"
                      disabled={disabled}
                      onClick={event => {
                        event.stopPropagation();
                        onOpenSchedule?.(task);
                      }}
                    >
                      <Pencil />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="divide-y divide-border md:hidden">
        {model.map(({ task, schedules, changes }) => (
          <article
            key={task.id}
            role="button"
            tabIndex={disabled ? -1 : 0}
            className="space-y-2 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            onClick={() => !disabled && onViewSchedule?.(task)}
            onKeyDown={event => {
              if (!disabled && ["Enter", " "].includes(event.key)) {
                event.preventDefault();
                onViewSchedule?.(task);
              }
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-sm font-medium">
                  {taskTypeLabel(task)}
                  {changes.length > 0 && <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-300" />}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{timeLabel(schedules)} · {task.execution_mode === "continuous" ? "aaneengesloten" : `${Number(task.duration_minutes || 0)} min`}</p>
              </div>
              <Button
                type="button"
                variant={String(selectedDefinitionId) === String(task.id) ? "secondary" : "ghost"}
                size="icon"
                aria-label={`Rooster wijzigen voor ${taskTypeLabel(task)}`}
                disabled={disabled}
                onClick={event => {
                  event.stopPropagation();
                  onOpenSchedule?.(task);
                }}
              >
                <Pencil />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{recurrenceLabel(schedules)}{weekdayLabel(schedules) !== "—" ? ` · ${weekdayLabel(schedules)}` : ""}</p>
          </article>
        ))}
      </div>
    </>
  );
}
