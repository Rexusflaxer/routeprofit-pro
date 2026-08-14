import React, { useMemo, useState } from "react";
import ObjectTaskSeriesDialog from "./ObjectTaskSeriesDialog";
import ObjectTaskWeekSchedule from "./ObjectTaskWeekSchedule";
import {
  addObjectTaskDays,
  createObjectTaskClientId,
  getAmsterdamNow,
  objectTaskWeekStart,
  projectObjectTaskDrafts,
  projectObjectTaskSchedules,
} from "./objectTaskScheduleDomain";

function withDraftLabel(entries, label) {
  return entries.map(entry => ({ ...entry, label: label || "Nieuwe taak" }));
}

export default function ObjectTaskSchedule({
  entries = [],
  contextData = null,
  onChange,
  executionMode,
  durationMinutes,
  taskLabel,
  weekStart,
  onWeekChange,
  serverClock = null,
}) {
  const fallbackWeek = getAmsterdamNow(
    serverClock?.iso && Number.isFinite(Date.parse(serverClock.iso))
      ? new Date(serverClock.iso)
      : new Date(),
  ).weekStart;
  const [localWeek, setLocalWeek] = useState(() => objectTaskWeekStart(weekStart) || fallbackWeek);
  const selectedWeek = objectTaskWeekStart(weekStart) || localWeek;
  const [editor, setEditor] = useState(null);

  const projectedEntries = useMemo(
    () => withDraftLabel(projectObjectTaskDrafts(entries, selectedWeek), taskLabel),
    [entries, selectedWeek, taskLabel],
  );
  const contextEntries = useMemo(() => (
    contextData
      ? projectObjectTaskSchedules({
        definitions: contextData.definitions,
        series: contextData.series,
        revisions: contextData.revisions,
        sourceChanges: contextData.source_changes,
        weekStart: selectedWeek,
      })
      : []
  ), [contextData, selectedWeek]);

  const changeWeek = value => {
    const normalized = objectTaskWeekStart(value) || fallbackWeek;
    setLocalWeek(normalized);
    onWeekChange?.(normalized);
  };

  const addEntry = interval => {
    const draft = {
      client_id: createObjectTaskClientId(),
      occurrence_date: interval.occurrence_date,
      start_time: interval.start_time,
      end_time: interval.end_time,
      end_day_offset: Number(interval.end_day_offset || 0),
      frequency: "once",
      repeat_until: null,
    };
    onChange([...entries, draft]);
    setEditor({
      ...draft,
      id: `${draft.client_id}:${draft.occurrence_date}`,
      draft_source_id: draft.client_id,
      draft: true,
      label: taskLabel || "Nieuwe taak",
    });
  };

  const openEntry = projected => {
    const source = entries.find(entry => entry.client_id === projected.draft_source_id);
    if (!source) return;
    setEditor({
      ...source,
      occurrence_date: projected.occurrence_date,
      id: projected.id,
      draft_source_id: source.client_id,
      draft: true,
      label: taskLabel || "Nieuwe taak",
    });
  };

  const saveEntry = next => {
    const sourceIndex = entries.findIndex(entry => entry.client_id === editor?.draft_source_id);
    if (sourceIndex < 0) return;
    const source = entries[sourceIndex];
    const appliesFromLaterOccurrence = source.frequency === "weekly"
      && editor.occurrence_date > source.occurrence_date;
    let nextEntries;
    if (appliesFromLaterOccurrence) {
      const previous = { ...source, repeat_until: addObjectTaskDays(editor.occurrence_date, -1) };
      const replacement = {
        ...source,
        ...next,
        client_id: createObjectTaskClientId(),
        occurrence_date: editor.occurrence_date,
      };
      nextEntries = entries.flatMap((entry, index) => index === sourceIndex ? [previous, replacement] : [entry]);
    } else {
      nextEntries = entries.map((entry, index) => index === sourceIndex ? { ...entry, ...next } : entry);
    }
    onChange(nextEntries);
    setEditor(null);
  };

  const deleteEntry = () => {
    const sourceIndex = entries.findIndex(entry => entry.client_id === editor?.draft_source_id);
    if (sourceIndex < 0) return;
    const source = entries[sourceIndex];
    const stopsLaterSeries = source.frequency === "weekly" && editor.occurrence_date > source.occurrence_date;
    onChange(stopsLaterSeries
      ? entries.map((entry, index) => index === sourceIndex
        ? { ...entry, repeat_until: addObjectTaskDays(editor.occurrence_date, -1) }
        : entry)
      : entries.filter((_, index) => index !== sourceIndex));
    setEditor(null);
  };

  return (
    <fieldset className="space-y-3">
      <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Taakrooster *</legend>
      <ObjectTaskWeekSchedule
        weekStart={selectedWeek}
        onWeekChange={changeWeek}
        entries={projectedEntries}
        contextEntries={contextEntries}
        editable
        allowDrawing
        allowEntryEditing
        executionMode={executionMode}
        durationMinutes={Number(durationMinutes || 0)}
        serverClock={serverClock}
        onDraw={addEntry}
        onEntryClick={openEntry}
      />
      <p className="text-xs leading-relaxed text-muted-foreground">
        Momenten van andere taken zijn gedempt zichtbaar om overlap te herkennen. Herhaling stel je per getekend taakmoment in; eerdere weken veranderen nooit mee.
      </p>
      <ObjectTaskSeriesDialog
        entry={editor}
        open={Boolean(editor)}
        fixedDuration={executionMode === "time_window" ? Number(durationMinutes || 0) : null}
        serverClock={serverClock}
        onOpenChange={open => !open && setEditor(null)}
        onSave={saveEntry}
        onDelete={deleteEntry}
      />
    </fieldset>
  );
}
