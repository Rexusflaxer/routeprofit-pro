import React, { useMemo } from "react";
import { AlertTriangle, CalendarClock, Plus, Repeat2 } from "lucide-react";
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
import { taskTypeLabel } from "./objectTaskConfig";

function byDefinition(items, key = "task_definition_id") {
  return items.reduce((map, item) => {
    const id = String(item?.[key] || item?.object_task_definition_id || "");
    if (!id) return map;
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(item);
    return map;
  }, new Map());
}

function seriesSummary(items, task = null) {
  const active = items.filter(item => !["archived", "stopped"].includes(item.status));
  if (!active.length) {
    if (items.length) return "Geen actieve momenten";
    const legacyCount = task?.schedule_periods?.length || task?.weekdays?.length || 0;
    return legacyCount ? `${legacyCount} bestaand ${legacyCount === 1 ? "tijdvak" : "tijdvakken"}` : "Geen actieve momenten";
  }
  const weekly = active.filter(item => item.current_revision?.frequency === "weekly" || item.current_revision?.recurrence_type === "weekly").length;
  const oneTime = active.length - weekly;
  return [
    weekly ? `${weekly} wekelijks` : null,
    oneTime ? `${oneTime} eenmalig` : null,
  ].filter(Boolean).join(" · ");
}

function executionLabel(task) {
  return task.execution_mode === "continuous"
    ? "Aaneengesloten tijdvak"
    : `${Number(task.duration_minutes || 0)} min. per uitvoering`;
}

export default function ObjectTaskTable({
  rows,
  series = [],
  sourceChanges = [],
  addingDefinitionId = null,
  disabled = false,
  onAddSeries,
}) {
  const seriesMap = useMemo(() => byDefinition(series), [series]);
  const changeMap = useMemo(
    () => byDefinition(sourceChanges.filter(change => !["resolved", "closed"].includes(change.status)), "object_task_definition_id"),
    [sourceChanges],
  );
  const model = rows.map(task => ({
    task,
    schedules: seriesMap.get(String(task.id)) || [],
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
              <TableHead>Roosterreeksen</TableHead>
              <TableHead>Aandacht</TableHead>
              <TableHead className="w-40" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {model.map(({ task, schedules, changes }) => (
              <TableRow key={task.id} className="hover:bg-muted/20">
                <TableCell>
                  <p className="font-medium">{taskTypeLabel(task)}</p>
                  {task.instructions && <p className="mt-0.5 max-w-lg truncate text-xs text-muted-foreground">{task.instructions}</p>}
                </TableCell>
                <TableCell><Badge variant="outline">{executionLabel(task)}</Badge></TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Repeat2 className="h-3.5 w-3.5" /> {seriesSummary(schedules, task)}
                  </span>
                </TableCell>
                <TableCell>
                  {changes.length ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-900 dark:text-amber-100">
                      <AlertTriangle className="h-3.5 w-3.5" /> {changes.length} {changes.length === 1 ? "dienst controleren" : "diensten controleren"}
                    </span>
                  ) : <span className="text-sm text-muted-foreground">Geen</span>}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    size="sm"
                    variant={String(addingDefinitionId) === String(task.id) ? "secondary" : "ghost"}
                    disabled={disabled}
                    onClick={() => onAddSeries?.(task)}
                  >
                    <Plus className="h-3.5 w-3.5" /> {String(addingDefinitionId) === String(task.id) ? "Aan het tekenen" : "Rooster aanvullen"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="divide-y divide-border md:hidden">
        {model.map(({ task, schedules, changes }) => (
          <article key={task.id} className="space-y-2 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{taskTypeLabel(task)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{executionLabel(task)}</p>
              </div>
              <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground">{seriesSummary(schedules, task)}</p>
            {changes.length > 0 && <p className="flex items-center gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-200"><AlertTriangle className="h-3.5 w-3.5" /> {changes.length} {changes.length === 1 ? "ingeplande dienst vraagt controle" : "ingeplande diensten vragen controle"}</p>}
            <Button type="button" size="sm" variant={String(addingDefinitionId) === String(task.id) ? "secondary" : "outline"} disabled={disabled} onClick={() => onAddSeries?.(task)}><Plus className="h-3.5 w-3.5" /> {String(addingDefinitionId) === String(task.id) ? "Tekenmodus actief" : "Rooster aanvullen"}</Button>
          </article>
        ))}
      </div>
    </>
  );
}
