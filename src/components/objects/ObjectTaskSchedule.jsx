import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import WarningAvailabilityGrid from "./WarningAvailabilityGrid";
import ObjectTaskTimePopup from "./ObjectTaskTimePopup";
import { WEEKDAY_OPTIONS } from "./objectWarningAddressConfig";
import { periodsToSchedule } from "./warningAvailabilityScheduleModel";
import {
  OBJECT_TASK_DAY_KEYS,
  addObjectTaskDays,
  addObjectTaskWeeks,
  createObjectTaskClientId,
  formatObjectTaskCompactDate,
  formatObjectTaskFullDate,
  getAmsterdamNow,
  objectTaskClockToMinutes,
  objectTaskEditableBoundary,
  objectTaskWeek,
  objectTaskWeekStart,
  objectTaskWeekday,
  projectObjectTaskDrafts,
  projectObjectTaskSchedules,
} from "./objectTaskScheduleDomain";
import { eraseTaskOccurrence, remainingTaskIntervals } from "./objectTaskScheduleEditing";

const GRID_HEADER_HEIGHT = 36;
const GRID_DAY_HEIGHT = 48;
const GRID_LABEL_WIDTH = 56;

function liveAmsterdamClock(serverClock) {
  const serverInstant = serverClock?.iso && Number.isFinite(Date.parse(serverClock.iso))
    ? Date.parse(serverClock.iso)
    : null;
  const clientInstant = Date.now();
  return () => getAmsterdamNow(new Date(
    serverInstant == null ? Date.now() : serverInstant + (Date.now() - clientInstant),
  ));
}

function useLiveAmsterdamNow(serverClock) {
  const source = useRef(liveAmsterdamClock(serverClock));
  const [now, setNow] = useState(() => source.current());
  useEffect(() => {
    source.current = liveAmsterdamClock(serverClock);
    const update = () => setNow(source.current());
    update();
    let interval = null;
    const align = globalThis.setTimeout(() => {
      update();
      interval = globalThis.setInterval(update, 60_000);
    }, Math.max(250, 60_000 - (Date.now() % 60_000) + 25));
    const onVisibility = () => document.visibilityState === "visible" && update();
    globalThis.addEventListener("focus", update);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      globalThis.clearTimeout(align);
      if (interval) globalThis.clearInterval(interval);
      globalThis.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [serverClock]);
  return now;
}

function toMinutes(value) {
  return objectTaskClockToMinutes(value) ?? 0;
}

function toTime(value) {
  if (value === 1440) return "24:00";
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function entryPeriod(entry) {
  const dayIndex = objectTaskWeekday(entry.occurrence_date) - 1;
  if (dayIndex < 0) return null;
  return {
    days: [OBJECT_TASK_DAY_KEYS[dayIndex]],
    start_time: entry.start_time,
    end_time: entry.end_time,
    kind: "available",
    entry,
  };
}

function occurrenceReplacement(source, occurrenceDate, values) {
  const startsLater = source.frequency === "weekly" && occurrenceDate > source.occurrence_date;
  const next = {
    ...source,
    ...values,
    end_day_offset: 0,
  };
  if (!startsLater) return [next];
  return [
    { ...source, repeat_until: addObjectTaskDays(occurrenceDate, -1) },
    {
      ...next,
      client_id: createObjectTaskClientId(),
      occurrence_date: occurrenceDate,
    },
  ];
}

function occurrenceRemoval(source, occurrenceDate) {
  if (source.frequency === "weekly" && occurrenceDate > source.occurrence_date) {
    return [{ ...source, repeat_until: addObjectTaskDays(occurrenceDate, -1) }];
  }
  return [];
}

function replaceSource(entries, sourceId, replacement) {
  return entries.flatMap(entry => entry.client_id === sourceId ? replacement : [entry]);
}

function persistedEntryKey(entry) {
  return `${entry.series_id || entry.id}:${entry.occurrence_date}`;
}

function remainingAfterRanges(entry, ranges) {
  return ranges.reduce(
    (segments, range) => segments.flatMap(segment => remainingTaskIntervals(
      { start_time: toTime(segment.start), end_time: toTime(segment.end) },
      range.start,
      range.end,
    )),
    [{ start: toMinutes(entry.start_time), end: toMinutes(entry.end_time) }],
  );
}

function recurrenceIdentity(entry) {
  const frequency = ["weekly", "week"].includes(String(entry.frequency || entry.recurrence_type || "").toLowerCase())
    ? "weekly"
    : "once";
  return {
    occurrenceDate: entry.occurrence_date || entry.effective_from || "",
    frequency,
    repeatUntil: entry.repeat_until || entry.recurrence_end_date || entry.valid_until || "",
    endDayOffset: Number(entry.end_day_offset || 0),
    definitionId: String(entry.definition_id || entry.task_definition_id || entry.object_task_definition_id || ""),
    seriesId: String(entry.series_id || entry.schedule_series_id || entry.object_task_schedule_series_id || ""),
  };
}

function sameOptionalIdentity(left, right) {
  return !left && !right || Boolean(left) && left === right;
}

function entriesCanJoin(left, right) {
  const leftIdentity = recurrenceIdentity(left);
  const rightIdentity = recurrenceIdentity(right);
  return leftIdentity.occurrenceDate === rightIdentity.occurrenceDate
    && leftIdentity.frequency === rightIdentity.frequency
    && leftIdentity.repeatUntil === rightIdentity.repeatUntil
    && leftIdentity.endDayOffset === rightIdentity.endDayOffset
    && sameOptionalIdentity(leftIdentity.definitionId, rightIdentity.definitionId)
    && sameOptionalIdentity(leftIdentity.seriesId, rightIdentity.seriesId);
}

function entriesTouchOrOverlap(left, right) {
  return toMinutes(left.start_time) <= toMinutes(right.end_time)
    && toMinutes(right.start_time) <= toMinutes(left.end_time);
}

function mergeConnectedDraftEntries(entries, preferredSourceId) {
  const preferredIndex = entries.findIndex(entry => entry.client_id === preferredSourceId);
  if (preferredIndex < 0) return entries;

  let merged = { ...entries[preferredIndex] };
  const consumed = new Set([preferredSourceId]);
  let foundConnection = true;
  while (foundConnection) {
    foundConnection = false;
    entries.forEach(entry => {
      if (
        consumed.has(entry.client_id)
        || !entriesCanJoin(merged, entry)
        || !entriesTouchOrOverlap(merged, entry)
      ) return;
      consumed.add(entry.client_id);
      merged = {
        ...merged,
        start_time: toTime(Math.min(toMinutes(merged.start_time), toMinutes(entry.start_time))),
        end_time: toTime(Math.max(toMinutes(merged.end_time), toMinutes(entry.end_time))),
      };
      foundConnection = true;
    });
  }

  if (consumed.size === 1) return entries;
  return entries.flatMap((entry, index) => {
    if (index === preferredIndex) return [merged];
    return consumed.has(entry.client_id) ? [] : [entry];
  });
}

export default function ObjectTaskSchedule({
  entries = [],
  contextData = null,
  taskDefinitionId = null,
  onChange,
  executionMode,
  durationMinutes,
  weekStart,
  onWeekChange,
  serverClock = null,
  pending = false,
  error = null,
  onPersistedCreate = null,
  onPersistedChange = null,
  onPersistedStop = null,
  onCancel = null,
  onSaved = null,
}) {
  const now = useLiveAmsterdamNow(serverClock);
  const currentWeekStart = now.weekStart;
  const [localWeek, setLocalWeek] = useState(() => objectTaskWeekStart(weekStart) || currentWeekStart);
  const controlledWeek = objectTaskWeekStart(weekStart);
  const selectedWeek = controlledWeek || localWeek;
  const week = objectTaskWeek(selectedWeek);
  const persistedMode = Boolean(taskDefinitionId);
  const continuous = executionMode === "continuous";
  const [tool, setTool] = useState("available");
  const [painting, setPainting] = useState(false);
  const [editor, setEditor] = useState(null);
  const [localError, setLocalError] = useState(null);
  const [scratchEntries, setScratchEntries] = useState([]);
  const [stagedErases, setStagedErases] = useState([]);
  const [savingDrafts, setSavingDrafts] = useState(false);
  const entriesRef = useRef(entries);
  const scratchRef = useRef(scratchEntries);
  const stagedErasesRef = useRef(stagedErases);
  const paintingSourceRef = useRef(null);

  useEffect(() => { entriesRef.current = entries; }, [entries]);
  useEffect(() => { scratchRef.current = scratchEntries; }, [scratchEntries]);
  useEffect(() => { stagedErasesRef.current = stagedErases; }, [stagedErases]);
  useEffect(() => {
    const stop = () => {
      setPainting(false);
      paintingSourceRef.current = null;
    };
    window.addEventListener("pointerup", stop);
    return () => window.removeEventListener("pointerup", stop);
  }, []);
  useEffect(() => {
    if (selectedWeek < currentWeekStart) {
      setLocalWeek(currentWeekStart);
      onWeekChange?.(currentWeekStart);
    }
  }, [currentWeekStart, onWeekChange, selectedWeek]);

  const projectedLocalEntries = useMemo(
    () => projectObjectTaskDrafts(entries, selectedWeek),
    [entries, selectedWeek],
  );
  const projectedScratchEntries = useMemo(
    () => projectObjectTaskDrafts(scratchEntries, selectedWeek),
    [scratchEntries, selectedWeek],
  );
  const projectedContextEntries = useMemo(() => contextData ? projectObjectTaskSchedules({
    definitions: contextData.definitions,
    series: contextData.series,
    revisions: contextData.revisions,
    sourceChanges: contextData.source_changes,
    weekStart: selectedWeek,
  }) : [], [contextData, selectedWeek]);
  const persistedOwnEntries = persistedMode
    ? projectedContextEntries.filter(entry => String(entry.definition_id) === String(taskDefinitionId))
    : [];
  const displayedPersistedEntries = useMemo(() => persistedOwnEntries.flatMap(entry => {
    const staged = stagedErases.find(item => item.key === persistedEntryKey(entry));
    if (!staged) return [entry];
    return remainingAfterRanges(entry, staged.ranges).map((interval, index) => ({
      ...entry,
      id: `staged:${entry.id}:${index}:${interval.start}`,
      start_time: toTime(interval.start),
      end_time: toTime(interval.end),
      _staged_original: entry,
    }));
  }), [persistedOwnEntries, stagedErases]);
  const ownEntries = persistedMode
    ? [...displayedPersistedEntries, ...projectedScratchEntries]
    : projectedLocalEntries;
  const contextEntries = persistedMode
    ? projectedContextEntries.filter(entry => String(entry.definition_id) !== String(taskDefinitionId))
    : projectedContextEntries;
  const exactPeriods = ownEntries.map(entryPeriod).filter(Boolean);
  const schedule = useMemo(() => periodsToSchedule(exactPeriods), [exactPeriods]);
  const contextGroups = useMemo(() => {
    const colors = new Map();
    return contextEntries.map(entry => {
      const label = entry.label || "Andere taak";
      if (!colors.has(label)) colors.set(label, colors.size % 4);
      return { entry, label, colorIndex: colors.get(label) };
    });
  }, [contextEntries]);
  const backgroundPeriods = contextGroups.map(group => ({
    ...entryPeriod(group.entry),
    taskId: group.entry.id,
    colorIndex: group.colorIndex,
  }));
  const contextLegend = [...new Map(contextGroups.map(group => [group.label, group])).values()];

  const commitEntries = value => {
    entriesRef.current = value;
    onChange?.(value);
  };
  const commitScratch = value => {
    scratchRef.current = value;
    setScratchEntries(value);
  };
  const editableBoundary = dayIndex => objectTaskEditableBoundary(week.days[dayIndex], now);
  const momentEditable = (dayIndex, minute) => minute >= editableBoundary(dayIndex);

  const projectedEntryAt = (dayIndex, interval) => {
    const occurrenceDate = week.days[dayIndex];
    return ownEntries.find(entry => entry.occurrence_date === occurrenceDate
      && toMinutes(entry.start_time) === interval.start
      && toMinutes(entry.end_time) === interval.end) || null;
  };

  const removeEntry = (entry, eraseStart = null, eraseEnd = null) => {
    if (!entry) return;
    setLocalError(null);
    const sourceId = entry.draft_source_id || entry.client_id;
    if (persistedMode && !entry.draft) {
      const original = entry._staged_original || entry;
      const key = persistedEntryKey(original);
      const range = eraseStart == null
        ? { start: toMinutes(original.start_time), end: toMinutes(original.end_time) }
        : { start: eraseStart, end: eraseEnd };
      setStagedErases(current => {
        const existing = current.find(item => item.key === key);
        const next = existing
          ? current.map(item => item.key === key ? { ...item, ranges: [...item.ranges, range] } : item)
          : [...current, { key, original, ranges: [range] }];
        stagedErasesRef.current = next;
        return next;
      });
      return;
    }
    const collection = persistedMode ? scratchRef.current : entriesRef.current;
    const source = collection.find(item => item.client_id === sourceId);
    if (!source) return;
    const replacement = eraseStart == null
      ? occurrenceRemoval(source, entry.occurrence_date)
      : eraseTaskOccurrence(source, entry.occurrence_date, eraseStart, eraseEnd);
    const next = replaceSource(collection, sourceId, replacement);
    if (persistedMode) commitScratch(next);
    else commitEntries(next);
  };

  const currentOwnEntries = () => persistedMode
    ? [
      ...displayedPersistedEntries,
      ...projectObjectTaskDrafts(scratchRef.current, selectedWeek),
    ]
    : projectObjectTaskDrafts(entriesRef.current, selectedWeek);

  const createEntry = (occurrenceDate, startMinute, endMinute) => ({
    client_id: createObjectTaskClientId(),
    occurrence_date: occurrenceDate,
    start_time: toTime(startMinute),
    end_time: toTime(endMinute),
    end_day_offset: 0,
    frequency: "once",
    repeat_until: null,
  });

  const paintContinuousSlot = (dayIndex, startMinute, start) => {
    const occurrenceDate = week.days[dayIndex];
    const endMinute = startMinute + 30;
    if (start) {
      setPainting(true);
      paintingSourceRef.current = null;
    }
    const sourceId = paintingSourceRef.current;
    const current = currentOwnEntries();
    const blocked = current.some(entry => {
      const entrySourceId = entry.draft_source_id || entry.client_id;
      return entrySourceId !== sourceId
        && entry.occurrence_date === occurrenceDate
        && toMinutes(entry.start_time) < endMinute
        && toMinutes(entry.end_time) > startMinute;
    });
    if (blocked) {
      paintingSourceRef.current = null;
      return;
    }

    const collection = persistedMode ? scratchRef.current : entriesRef.current;
    const source = sourceId ? collection.find(entry => entry.client_id === sourceId) : null;
    if (source && source.occurrence_date === occurrenceDate) {
      const nextStart = Math.min(toMinutes(source.start_time), startMinute);
      const nextEnd = Math.max(toMinutes(source.end_time), endMinute);
      const expanded = collection.map(entry => entry.client_id === sourceId
        ? { ...entry, start_time: toTime(nextStart), end_time: toTime(nextEnd) }
        : entry);
      const next = mergeConnectedDraftEntries(expanded, sourceId);
      if (persistedMode) commitScratch(next);
      else commitEntries(next);
      return;
    }

    const entry = createEntry(occurrenceDate, startMinute, endMinute);
    const adjacentSource = collection.find(candidate => (
      entriesCanJoin(candidate, entry)
      && entriesTouchOrOverlap(candidate, entry)
    ));
    const preferredSourceId = adjacentSource?.client_id || entry.client_id;
    const next = mergeConnectedDraftEntries([...collection, entry], preferredSourceId);
    paintingSourceRef.current = preferredSourceId;
    if (persistedMode) commitScratch(next);
    else commitEntries(next);
  };

  const paint = (dayIndex, slot, start, active) => {
    const startMinute = slot * 30;
    if (!momentEditable(dayIndex, startMinute)) return;
    if (!continuous) {
      if (tool === null) {
        if (active) removeEntry(projectedEntryAt(dayIndex, active.interval));
        return;
      }
      const endMinute = startMinute + Number(durationMinutes || 0);
      if (!durationMinutes || endMinute > 1440) return;
      const overlaps = currentOwnEntries().some(entry => entry.occurrence_date === week.days[dayIndex]
        && toMinutes(entry.start_time) < endMinute
        && toMinutes(entry.end_time) > startMinute);
      if (overlaps) return;
      const nextEntry = createEntry(week.days[dayIndex], startMinute, endMinute);
      if (persistedMode) commitScratch([...scratchRef.current, nextEntry]);
      else commitEntries([...entriesRef.current, nextEntry]);
      return;
    }
    if (tool === null) {
      if (start) setPainting(true);
      if (active) removeEntry(
        projectedEntryAt(dayIndex, active.interval),
        continuous ? startMinute : null,
        continuous ? startMinute + 30 : null,
      );
      return;
    }
    paintContinuousSlot(dayIndex, startMinute, start);
  };

  const preset = type => {
    if (persistedMode) return;
    if (type === "empty") {
      let next = [...entriesRef.current];
      const handled = new Set();
      projectObjectTaskDrafts(entriesRef.current, selectedWeek).forEach(entry => {
        const sourceId = entry.draft_source_id || entry.client_id;
        if (handled.has(sourceId)) return;
        handled.add(sourceId);
        const source = next.find(item => item.client_id === sourceId);
        if (source) next = replaceSource(next, sourceId, occurrenceRemoval(source, entry.occurrence_date));
      });
      commitEntries(next);
      return;
    }
    const projected = projectObjectTaskDrafts(entriesRef.current, selectedWeek);
    const additions = [];
    week.days.forEach((occurrenceDate, dayIndex) => {
      if (type === "business" && dayIndex >= 5) return;
      let cursor = type === "business"
        ? Math.max(8 * 60, Math.ceil(editableBoundary(dayIndex) / 30) * 30)
        : Math.ceil(editableBoundary(dayIndex) / 30) * 30;
      const limit = type === "business" ? 18 * 60 : 1440;
      const occupied = projected
        .filter(entry => entry.occurrence_date === occurrenceDate)
        .map(entry => ({ start: toMinutes(entry.start_time), end: toMinutes(entry.end_time) }))
        .sort((left, right) => left.start - right.start);
      occupied.forEach(interval => {
        if (interval.end <= cursor || interval.start >= limit) return;
        if (interval.start > cursor) additions.push(createEntry(occurrenceDate, cursor, Math.min(interval.start, limit)));
        cursor = Math.max(cursor, interval.end);
      });
      if (cursor < limit) additions.push(createEntry(occurrenceDate, cursor, limit));
    });
    commitEntries([...entriesRef.current, ...additions]);
  };

  const openEditor = interval => {
    const entry = projectedEntryAt(interval.dayIndex, interval);
    if (!entry || !momentEditable(interval.dayIndex, interval.start)) return;
    const occurrenceDate = week.days[interval.dayIndex];
    setLocalError(null);
    setEditor({
      ...entry,
      ...interval,
      occurrence_date: occurrenceDate,
      dayLabel: WEEKDAY_OPTIONS[interval.dayIndex].label,
      dateLabel: formatObjectTaskFullDate(occurrenceDate),
      start_time: entry.start_time || toTime(interval.start),
      end_time: entry.end_time || toTime(interval.end),
    });
  };

  const saveEditor = async values => {
    if (!editor) return;
    const startMinute = toMinutes(values.start_time);
    if (!momentEditable(editor.dayIndex, startMinute)) {
      setLocalError(new Error("Kies een starttijd die na het huidige tijdstip ligt."));
      return;
    }
    const collision = ownEntries.some(entry => entry.id !== editor.id
      && entry.occurrence_date === editor.occurrence_date
      && toMinutes(entry.start_time) < toMinutes(values.end_time)
      && toMinutes(entry.end_time) > startMinute);
    if (collision) {
      setLocalError(new Error("Dit tijdvak overlapt een ander moment van dezelfde taak."));
      return;
    }
    setLocalError(null);
    if (persistedMode && !editor.draft) {
      try {
        await onPersistedChange?.(editor, values);
        setEditor(null);
      } catch {
        // De mutatiefout wordt via de callback/error-prop in de pop-up getoond.
      }
      return;
    }
    if (persistedMode) {
      try {
        await onPersistedCreate?.({ ...editor, ...values, end_day_offset: 0 });
        commitScratch(scratchRef.current.filter(entry => entry.client_id !== (editor.draft_source_id || editor.client_id)));
        setEditor(null);
      } catch {
        // De mutatiefout wordt via de callback/error-prop in de pop-up getoond.
      }
      return;
    }
    const sourceId = editor.draft_source_id || editor.client_id;
    const source = entriesRef.current.find(entry => entry.client_id === sourceId);
    if (!source) return;
    commitEntries(replaceSource(
      entriesRef.current,
      sourceId,
      occurrenceReplacement(source, editor.occurrence_date, values),
    ));
    setEditor(null);
  };

  const deleteEditor = async () => {
    if (!editor) return;
    if (persistedMode && !editor.draft) {
      try {
        await onPersistedStop?.(editor);
        setEditor(null);
      } catch {
        // De mutatiefout wordt via de callback/error-prop in de pop-up getoond.
      }
      return;
    }
    removeEntry(editor);
    setEditor(null);
  };

  const saveDrafts = async () => {
    if (!persistedMode || (scratchRef.current.length === 0 && stagedErasesRef.current.length === 0) || savingDrafts || pending) return;
    setLocalError(null);
    setSavingDrafts(true);
    try {
      for (const staged of [...stagedErasesRef.current]) {
        const remaining = remainingAfterRanges(staged.original, staged.ranges);
        if (remaining.length === 0) {
          await onPersistedStop?.(staged.original);
        } else {
          await onPersistedChange?.(staged.original, {
            start_time: toTime(remaining[0].start),
            end_time: toTime(remaining[0].end),
            frequency: staged.original.frequency,
            repeat_until: staged.original.repeat_until || null,
          });
          for (const interval of remaining.slice(1)) {
            await onPersistedCreate?.({
              ...staged.original,
              start_time: toTime(interval.start),
              end_time: toTime(interval.end),
            });
          }
        }
        const next = stagedErasesRef.current.filter(item => item.key !== staged.key);
        stagedErasesRef.current = next;
        setStagedErases(next);
      }
      for (const entry of [...scratchRef.current]) {
        await onPersistedCreate?.(entry);
        commitScratch(scratchRef.current.filter(item => item.client_id !== entry.client_id));
      }
      onSaved?.();
    } catch (saveError) {
      setLocalError(saveError);
    } finally {
      setSavingDrafts(false);
    }
  };

  const cancelDrafts = () => {
    if (savingDrafts || pending) return;
    commitScratch([]);
    stagedErasesRef.current = [];
    setStagedErases([]);
    setEditor(null);
    setLocalError(null);
    onCancel?.();
  };

  const changeWeek = value => {
    const normalized = objectTaskWeekStart(value);
    if (!normalized || normalized < currentWeekStart) return;
    setLocalWeek(normalized);
    setEditor(null);
    setLocalError(null);
    if (persistedMode) {
      commitScratch([]);
      stagedErasesRef.current = [];
      setStagedErases([]);
    }
    onWeekChange?.(normalized);
  };

  const todayIndex = week.days.indexOf(now.dateKey);
  const nowLeft = `calc(${GRID_LABEL_WIDTH}px + (100% - ${GRID_LABEL_WIDTH}px) * ${Math.min(1, now.minute / 1440)})`;

  return (
    <fieldset role="region" className="space-y-3" aria-label="Taakrooster per week">
      <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Taakrooster *</legend>

      <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-card/40 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold">Week {week.week} · {week.year}</p>
          <p className="text-[10px] text-muted-foreground">{week.rangeLabel}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button type="button" size="icon" variant="outline" className="h-7 w-7" disabled={selectedWeek <= currentWeekStart} onClick={() => changeWeek(addObjectTaskWeeks(selectedWeek, -1))} aria-label="Vorige week"><ChevronLeft className="h-3.5 w-3.5" /></Button>
          <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[10px]" disabled={selectedWeek === currentWeekStart} onClick={() => changeWeek(currentWeekStart)}><RotateCcw className="h-3 w-3" /> Deze week</Button>
          <Button type="button" size="icon" variant="outline" className="h-7 w-7" onClick={() => changeWeek(addObjectTaskWeeks(selectedWeek, 1))} aria-label="Volgende week"><ChevronRight className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      {!persistedMode && (
        <div className="flex flex-wrap gap-2">
          {continuous && <button type="button" onClick={() => preset("business")} className="rounded-xl border border-border/70 bg-card/45 px-3 py-2 text-xs font-medium hover:border-primary/40">Werkdagen 08:00–18:00</button>}
          {continuous && <button type="button" onClick={() => preset("all")} className="rounded-xl border border-border/70 bg-card/45 px-3 py-2 text-xs font-medium hover:border-primary/40">24/7 invullen</button>}
          <button type="button" onClick={() => preset("empty")} className="rounded-xl border border-border/70 bg-card/45 px-3 py-2 text-xs font-medium hover:border-primary/40">Rooster wissen</button>
        </div>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={() => setTool("available")} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium ${tool === "available" ? "border-primary/60 bg-primary/10" : "border-border/70 bg-card/45"}`}><span className="h-3 w-3 rounded-sm border border-primary/40 bg-primary/25" />{continuous ? "Taak uitvoeren" : `Taak plaatsen (${durationMinutes} min.)`}</button>
        <button type="button" onClick={() => setTool(null)} disabled={pending} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${tool === null ? "border-primary/60 bg-primary/10" : "border-border/70 bg-card/45"}`}><span className="h-3 w-3 rounded-sm border border-border bg-card" />Wissen</button>
      </div>

      <div className="max-h-[288px] touch-pan-y overflow-auto overscroll-contain rounded-md border border-border/50">
        <div className="relative min-w-[900px]">
          <div className="[&>div]:overflow-visible [&>div>div]:min-w-0">
            <WarningAvailabilityGrid
              schedule={schedule}
              exactPeriods={exactPeriods}
              backgroundPeriods={backgroundPeriods}
              previewDurationMinutes={continuous ? null : durationMinutes}
              onPaint={paint}
              onIntervalClick={openEditor}
              painting={painting}
              tool={tool}
              dayLabels={week.days.map(formatObjectTaskCompactDate)}
            />
          </div>
          {week.days.map((dateKey, dayIndex) => {
            const past = dateKey < now.dateKey;
            const today = dateKey === now.dateKey;
            if (!past && !today) return null;
            const width = past ? `calc(100% - ${GRID_LABEL_WIDTH}px)` : `calc((100% - ${GRID_LABEL_WIDTH}px) * ${Math.min(1, objectTaskEditableBoundary(dateKey, now) / 1440)})`;
            return <span key={dateKey} className="pointer-events-auto absolute z-20 border-r border-border/50 bg-muted/35 [background-image:repeating-linear-gradient(135deg,transparent,transparent_5px,hsl(var(--border)/0.16)_5px,hsl(var(--border)/0.16)_6px)]" aria-hidden="true" style={{ left: GRID_LABEL_WIDTH, top: GRID_HEADER_HEIGHT + dayIndex * GRID_DAY_HEIGHT, width, height: GRID_DAY_HEIGHT }} />;
          })}
          {todayIndex >= 0 && (
            <span className="pointer-events-none absolute z-30 w-px bg-destructive/80" style={{ left: nowLeft, top: GRID_HEADER_HEIGHT + todayIndex * GRID_DAY_HEIGHT + 2, height: GRID_DAY_HEIGHT - 4 }}>
              <span className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 rounded-full bg-destructive" />
              <span className="absolute left-1/2 top-1 -translate-x-1/2 rounded bg-destructive px-1 py-0.5 text-[8px] font-bold text-destructive-foreground shadow">{now.clock}</span>
            </span>
          )}
        </div>
      </div>

      {contextLegend.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
          <span>Andere geplande taken:</span>
          {contextLegend.map(group => <span key={group.label} className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm border ${["border-chart-2/40 bg-chart-2/20", "border-chart-4/40 bg-chart-4/20", "border-chart-5/40 bg-chart-5/20", "border-chart-3/40 bg-chart-3/20"][group.colorIndex % 4]}`} />{group.label}</span>)}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {continuous
          ? "Sleep over blokken van 30 minuten. Met Wissen verwijder je alleen de gekozen tijdblokken; klik op een taak voor exacte tijden en herhaling."
          : `Klik in het rooster om een losse taak van ${durationMinutes} minuten te plaatsen. Klik op de taak om de exacte starttijd en herhaling in te stellen.`}
      </p>

      {persistedMode && (
        <div className="flex items-center justify-end gap-2 border-t border-border/70 pt-3">
          <Button type="button" size="sm" variant="ghost" disabled={savingDrafts || pending} onClick={cancelDrafts}>Annuleren</Button>
          <Button type="button" size="sm" disabled={(scratchEntries.length === 0 && stagedErases.length === 0) || savingDrafts || pending} onClick={saveDrafts}>
            {savingDrafts ? "Opslaan..." : "Opslaan"}
          </Button>
        </div>
      )}

      {editor && (
        <ObjectTaskTimePopup
          editor={editor}
          fixedDuration={continuous ? null : durationMinutes}
          pending={pending}
          error={localError || error}
          onClose={() => !pending && setEditor(null)}
          onSave={saveEditor}
          onDelete={persistedMode ? deleteEditor : null}
        />
      )}
    </fieldset>
  );
}