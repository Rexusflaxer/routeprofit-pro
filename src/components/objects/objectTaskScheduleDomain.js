const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

export const OBJECT_TASK_TIMEZONE = "Europe/Amsterdam";
export const OBJECT_TASK_SNAP_MINUTES = 5;
export const OBJECT_TASK_DAY_MINUTES = 24 * 60;
export const OBJECT_TASK_DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const dayFormatter = new Intl.DateTimeFormat("nl-NL", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const compactDateFormatter = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const fullDateFormatter = new Intl.DateTimeFormat("nl-NL", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const amsterdamClockFormatter = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  timeZone: OBJECT_TASK_TIMEZONE,
});

function dateFromKey(value) {
  const match = String(value || "").match(DATE_KEY);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  if (
    date.getUTCFullYear() !== Number(match[1])
    || date.getUTCMonth() !== Number(match[2]) - 1
    || date.getUTCDate() !== Number(match[3])
  ) return null;
  return date;
}

function keyFromDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function addObjectTaskDays(value, amount) {
  const date = dateFromKey(value);
  if (!date) return "";
  date.setUTCDate(date.getUTCDate() + Number(amount || 0));
  return keyFromDate(date);
}

export function addObjectTaskWeeks(value, amount) {
  return addObjectTaskDays(value, Number(amount || 0) * 7);
}

export function objectTaskWeekStart(value) {
  const date = dateFromKey(value);
  if (!date) return "";
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return keyFromDate(date);
}

export function objectTaskWeekday(value) {
  const date = dateFromKey(value);
  return date ? ((date.getUTCDay() + 6) % 7) + 1 : 0;
}

export function objectTaskIsoWeek(value) {
  const date = dateFromKey(value);
  if (!date) return { week: 0, year: 0 };
  const thursday = new Date(date.getTime());
  thursday.setUTCDate(thursday.getUTCDate() + 3 - ((thursday.getUTCDay() + 6) % 7));
  const weekYear = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(weekYear, 0, 4, 12));
  firstThursday.setUTCDate(firstThursday.getUTCDate() + 3 - ((firstThursday.getUTCDay() + 6) % 7));
  return {
    year: weekYear,
    week: 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / 604_800_000),
  };
}

export function objectTaskWeek(value) {
  const start = objectTaskWeekStart(value);
  const days = Array.from({ length: 7 }, (_, index) => addObjectTaskDays(start, index));
  const end = days[6] || start;
  const iso = objectTaskIsoWeek(start);
  return {
    start,
    end,
    days,
    ...iso,
    label: `Week ${iso.week}`,
    rangeLabel: `${formatObjectTaskCompactDate(start)} – ${formatObjectTaskCompactDate(end)}`,
  };
}

export function objectTaskWeekStrip(selectedWeekStart, currentWeekStart, count = 8) {
  const current = objectTaskWeekStart(currentWeekStart);
  const selected = objectTaskWeekStart(selectedWeekStart) || current;
  let stripStart = addObjectTaskWeeks(selected, -2);
  if (!stripStart || stripStart < current) stripStart = current;
  return Array.from({ length: Math.max(4, count) }, (_, index) => objectTaskWeek(addObjectTaskWeeks(stripStart, index)));
}

export function formatObjectTaskDay(value) {
  const date = dateFromKey(value);
  return date ? dayFormatter.format(date).replace(/\.$/, "") : "—";
}

export function formatObjectTaskCompactDate(value) {
  const date = dateFromKey(value);
  return date ? compactDateFormatter.format(date).replace(/\.$/, "") : "—";
}

export function formatObjectTaskFullDate(value) {
  const date = dateFromKey(value);
  return date ? fullDateFormatter.format(date) : "—";
}

export function getAmsterdamNow(value = new Date()) {
  const parts = Object.fromEntries(amsterdamClockFormatter.formatToParts(value).map(part => [part.type, part.value]));
  const dateKey = `${parts.year}-${parts.month}-${parts.day}`;
  const hour = Number(parts.hour || 0);
  const minute = Number(parts.minute || 0);
  const second = Number(parts.second || 0);
  return {
    dateKey,
    minute: hour * 60 + minute + second / 60,
    clock: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    weekStart: objectTaskWeekStart(dateKey),
    timestamp: value.getTime(),
  };
}

export function snapObjectTaskMinute(value, mode = "round") {
  const number = Math.max(0, Math.min(OBJECT_TASK_DAY_MINUTES, Number(value || 0)));
  const scaled = number / OBJECT_TASK_SNAP_MINUTES;
  const snapped = mode === "ceil" ? Math.ceil(scaled) : mode === "floor" ? Math.floor(scaled) : Math.round(scaled);
  return Math.max(0, Math.min(OBJECT_TASK_DAY_MINUTES, snapped * OBJECT_TASK_SNAP_MINUTES));
}

export function objectTaskClockToMinutes(value) {
  if (value === "24:00") return OBJECT_TASK_DAY_MINUTES;
  const match = String(value || "").match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function objectTaskMinutesToClock(value) {
  const minute = Math.max(0, Math.min(OBJECT_TASK_DAY_MINUTES, Math.round(Number(value || 0))));
  if (minute === OBJECT_TASK_DAY_MINUTES) return "24:00";
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

export function objectTaskEditableBoundary(dateKey, now = getAmsterdamNow()) {
  if (dateKey < now.dateKey) return OBJECT_TASK_DAY_MINUTES;
  if (dateKey > now.dateKey) return 0;
  // The backend requires a same-day start to be strictly later than its
  // Amsterdam clock. Always advance to the next five-minute boundary, also
  // when the clock already happens to be exactly on a boundary.
  return Math.min(
    OBJECT_TASK_DAY_MINUTES,
    snapObjectTaskMinute(now.minute, "floor") + OBJECT_TASK_SNAP_MINUTES,
  );
}

export function isObjectTaskMomentEditable(dateKey, startMinute, now = getAmsterdamNow()) {
  return dateKey >= now.dateKey && Number(startMinute) >= objectTaskEditableBoundary(dateKey, now);
}

export function createObjectTaskClientId(prefix = "schedule") {
  return `${prefix}:${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function normalizedFrequency(value) {
  return ["weekly", "week"].includes(String(value || "").toLowerCase()) ? "weekly" : "once";
}

export function normalizeObjectTaskRevision(revision = {}) {
  const operation = ["stop", "delete", "cancel"].includes(String(revision.operation || revision.action || "").toLowerCase())
    ? "stop"
    : "upsert";
  const effectiveFrom = revision.effective_from || revision.occurrence_date || revision.anchor_date || revision.specific_date || revision.valid_from || "";
  const startTime = revision.start_time || revision.window_start_time || "00:00";
  const endTime = revision.end_time || revision.window_end_time || "00:00";
  const inferredEndDayOffset = objectTaskClockToMinutes(endTime) <= objectTaskClockToMinutes(startTime) ? 1 : 0;
  return {
    ...revision,
    id: revision.id || revision.revision_id || null,
    series_id: revision.series_id || revision.schedule_series_id || null,
    revision_number: Number(revision.revision_number || revision.version || 1),
    operation,
    effective_from: effectiveFrom,
    frequency: normalizedFrequency(revision.frequency || revision.recurrence_type),
    weekday: Number.isInteger(Number(revision.weekday)) && Number(revision.weekday) >= 1 && Number(revision.weekday) <= 7
      ? Number(revision.weekday)
      : objectTaskWeekday(effectiveFrom),
    start_time: startTime,
    end_time: endTime,
    end_day_offset: Number(revision.end_day_offset ?? inferredEndDayOffset),
    repeat_until: revision.recurrence_end_date || revision.repeat_until || revision.valid_until || null,
  };
}

export function normalizeObjectTaskSeries(series = {}) {
  return {
    ...series,
    id: series.id || series.series_id || null,
    series_key: series.series_key || series.period_key || series.id || null,
    task_definition_id: series.task_definition_id || series.object_task_definition_id || null,
    status: series.status || "active",
    version: Number(series.version || 1),
  };
}

function activeRevisionForDate(series, revisions, dateKey) {
  const applicable = revisions
    .filter(revision => String(revision.series_id) === String(series.id) && revision.effective_from && revision.effective_from <= dateKey)
    .sort((left, right) => left.effective_from.localeCompare(right.effective_from) || left.revision_number - right.revision_number);
  return applicable.at(-1) || null;
}

function revisionOccursOnDate(revision, dateKey) {
  if (!revision || revision.operation === "stop" || dateKey < revision.effective_from) return false;
  if (revision.repeat_until && dateKey > revision.repeat_until) return false;
  if (revision.frequency === "once") return dateKey === revision.effective_from;
  return objectTaskWeekday(dateKey) === revision.weekday;
}

function definitionLabel(definition = {}) {
  return definition.custom_task_type || definition.task_name || definition.name || definition.task_type_label || "Taak";
}

function sourceChangeFor(sourceChanges, seriesId, dateKey) {
  return sourceChanges.find(change => (
    String(change.series_id || change.schedule_series_id || "") === String(seriesId || "")
    && (!(change.service_date || change.occurrence_date) || (change.service_date || change.occurrence_date) === dateKey)
    && !["resolved", "closed"].includes(change.status)
  )) || null;
}

function legacyEntries(definition, week) {
  const periods = Array.isArray(definition.schedule_periods) && definition.schedule_periods.length
    ? definition.schedule_periods
    : (definition.weekdays || []).map(day => ({
      days: [OBJECT_TASK_DAY_KEYS[Number(day) - 1]],
      start_time: definition.start_time,
      end_time: definition.end_time,
      period_key: `legacy:${day}:${definition.start_time}:${definition.end_time}`,
    }));
  return week.days.flatMap(dateKey => {
  const dayKey = OBJECT_TASK_DAY_KEYS[objectTaskWeekday(dateKey) - 1];
    const applies = definition.recurrence_type === "one_time"
      ? definition.specific_date === dateKey
      : definition.recurrence_type === "date_range"
        ? definition.valid_from <= dateKey && dateKey <= definition.valid_until
        : definition.recurrence_type === "weekly";
    if (!applies) return [];
    return periods.filter(period => period.days?.includes(dayKey)).map((period, index) => ({
      id: `${definition.id}:${period.period_key || index}:${dateKey}`,
      client_id: `${definition.id}:${period.period_key || index}:${dateKey}`,
      definition,
      definition_id: definition.id,
      series_id: period.period_key || `legacy:${index}`,
      series_version: Number(definition.version || 1),
      revision_id: null,
      occurrence_date: dateKey,
      start_time: period.start_time,
      end_time: period.end_time,
      end_day_offset: objectTaskClockToMinutes(period.end_time) <= objectTaskClockToMinutes(period.start_time) ? 1 : 0,
      frequency: definition.recurrence_type === "weekly" || definition.recurrence_type === "date_range" ? "weekly" : "once",
      repeat_until: definition.recurrence_type === "date_range" ? definition.valid_until : null,
      label: definitionLabel(definition),
      legacy: true,
    }));
  });
}

export function projectObjectTaskSchedules({ definitions = [], series = [], revisions = [], sourceChanges = [], weekStart }) {
  const week = objectTaskWeek(weekStart);
  const normalizedSeries = series.map(normalizeObjectTaskSeries);
  const normalizedRevisions = revisions.map(normalizeObjectTaskRevision);
  const definitionById = new Map(definitions.map(definition => [String(definition.id), definition]));
  const entries = normalizedSeries.flatMap(scheduleSeries => {
    if (scheduleSeries.status === "archived") return [];
    const definition = definitionById.get(String(scheduleSeries.task_definition_id));
    if (!definition || definition.status === "archived") return [];
    return week.days.flatMap(dateKey => {
      const revision = activeRevisionForDate(scheduleSeries, normalizedRevisions, dateKey);
      if (!revisionOccursOnDate(revision, dateKey)) return [];
      return [{
        id: `${scheduleSeries.id}:${dateKey}`,
        client_id: `${scheduleSeries.id}:${dateKey}`,
        definition,
        definition_id: definition.id,
        series: scheduleSeries,
        series_id: scheduleSeries.id,
        series_version: scheduleSeries.version,
        revision,
        revision_id: revision.id,
        occurrence_date: dateKey,
        start_time: revision.start_time,
        end_time: revision.end_time,
        end_day_offset: revision.end_day_offset,
        frequency: revision.frequency,
        repeat_until: revision.repeat_until,
        label: definitionLabel(definition),
        source_change: sourceChangeFor(sourceChanges, scheduleSeries.id, dateKey),
      }];
    });
  });
  const definitionsWithSeries = new Set(normalizedSeries.map(item => String(item.task_definition_id)));
  definitions.forEach(definition => {
    if (!definitionsWithSeries.has(String(definition.id))) entries.push(...legacyEntries(definition, week));
  });
  return entries.sort((left, right) => left.occurrence_date.localeCompare(right.occurrence_date)
    || Number(objectTaskClockToMinutes(left.start_time)) - Number(objectTaskClockToMinutes(right.start_time)));
}

export function projectObjectTaskDrafts(entries = [], weekStart) {
  const week = objectTaskWeek(weekStart);
  return entries.flatMap(entry => {
    const normalized = {
      ...entry,
      frequency: normalizedFrequency(entry.frequency || entry.recurrence_type),
      repeat_until: entry.repeat_until || entry.valid_until || null,
    };
    return week.days.flatMap(dateKey => {
      const starts = normalized.occurrence_date || normalized.effective_from;
      if (!starts || dateKey < starts || (normalized.repeat_until && dateKey > normalized.repeat_until)) return [];
      const applies = normalized.frequency === "weekly"
        ? objectTaskWeekday(dateKey) === objectTaskWeekday(starts)
        : dateKey === starts;
      return applies ? [{ ...normalized, id: `${normalized.client_id}:${dateKey}`, occurrence_date: dateKey, draft_source_id: normalized.client_id, draft: true }] : [];
    });
  });
}

export function objectTaskEntryInterval(entry) {
  const start = objectTaskClockToMinutes(entry?.start_time);
  const rawEnd = objectTaskClockToMinutes(entry?.end_time);
  if (start == null || rawEnd == null) return null;
  const end = rawEnd + (Number(entry?.end_day_offset || 0) > 0 || rawEnd <= start ? OBJECT_TASK_DAY_MINUTES : 0);
  return { start, end, duration: end - start };
}

export function objectTaskEntrySummary(entry) {
  if (!entry) return "";
  const time = `${entry.start_time}–${entry.end_time}${Number(entry.end_day_offset || 0) > 0 ? " (+1)" : ""}`;
  if (entry.frequency !== "weekly") return `${formatObjectTaskFullDate(entry.occurrence_date)} · ${time}`;
  return `Elke ${formatObjectTaskFullDate(entry.occurrence_date).split(" ")[0]} · ${time}${entry.repeat_until ? ` · t/m ${formatObjectTaskCompactDate(entry.repeat_until)}` : " · zonder einddatum"}`;
}

export function firstUpcomingObjectTaskEntry(entries, now = getAmsterdamNow()) {
  return [...entries]
    .filter(entry => entry.occurrence_date > now.dateKey || (
      entry.occurrence_date === now.dateKey
      && Number(objectTaskClockToMinutes(entry.start_time)) >= now.minute
    ))
    .sort((left, right) => left.occurrence_date.localeCompare(right.occurrence_date)
      || Number(objectTaskClockToMinutes(left.start_time)) - Number(objectTaskClockToMinutes(right.start_time)))[0] || null;
}
