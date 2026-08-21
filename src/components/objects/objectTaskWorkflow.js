import { invokePlanningApi } from "@/components/planning/planningApiClient";
import {
  normalizeObjectTaskException,
  normalizeObjectTaskRevision,
  normalizeObjectTaskSeries,
} from "./objectTaskScheduleDomain";

function required(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${label} ontbreekt.`);
  return normalized;
}

function expectedVersion(value) {
  const version = Number(value);
  if (!Number.isInteger(version) || version < 0) {
    throw new Error("De actuele versie ontbreekt. Vernieuw de taken en probeer opnieuw.");
  }
  return version;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

async function invoke(payload) {
  // Object-task mutations already carry their stable key. Reads intentionally
  // remain keyless to preserve the existing planningApi contract.
  return invokePlanningApi(payload, { ensureIdempotencyKey: false });
}

export function createObjectTaskMutationKey(action = "mutation") {
  return `object-task:${action}:${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`}`;
}

function normalizeDefinition(value = {}) {
  const definition = value.definition || value.task_definition || value.task || value;
  return {
    ...definition,
    id: definition.id || definition.task_definition_id || null,
    version: Number(definition.version || 1),
    status: definition.status || "active",
    schedule_periods: asArray(definition.schedule_periods),
    weekdays: asArray(definition.weekdays),
  };
}

function normalizeSeriesItem(value = {}, fallbackDefinitionId = null) {
  const series = normalizeObjectTaskSeries(value.series || value.schedule_series || value);
  const revision = value.current_revision || value.revision || series.current_revision || {};
  const currentRevision = normalizeObjectTaskRevision({
    ...revision,
    series_id: revision.series_id || revision.schedule_series_id || series.id,
  });
  return {
    ...series,
    task_definition_id: series.task_definition_id || fallbackDefinitionId,
    current_revision: currentRevision?.effective_from ? currentRevision : null,
  };
}

export function normalizeObjectTaskList(value) {
  const result = value?.data || value || {};
  const groups = asArray(result.tasks || result.items);
  const definitions = [];
  const series = [];
  const revisions = [];
  const exceptions = [];
  const nestedSourceChanges = [];

  groups.forEach(group => {
    const definition = normalizeDefinition(group);
    if (definition.id) definitions.push(definition);
    asArray(group.series || group.schedule_series).forEach(item => {
      const normalized = normalizeSeriesItem(item, definition.id);
      if (!normalized.id) return;
      series.push(normalized);
      if (normalized.current_revision) revisions.push(normalized.current_revision);
      asArray(item.revisions).forEach(revision => revisions.push(normalizeObjectTaskRevision({ ...revision, series_id: revision.series_id || normalized.id })));
    });
    asArray(group.exceptions || group.schedule_exceptions).forEach(exception => {
      exceptions.push(normalizeObjectTaskException(exception));
    });
    nestedSourceChanges.push(...asArray(group.source_changes));
  });

  if (groups.length === 0) {
    asArray(result.definitions).forEach(item => {
      const definition = normalizeDefinition(item);
      if (definition.id) definitions.push(definition);
    });
    asArray(result.series).forEach(item => {
      const normalized = normalizeSeriesItem(item);
      if (!normalized.id) return;
      series.push(normalized);
      if (normalized.current_revision) revisions.push(normalized.current_revision);
    });
    asArray(result.revisions).forEach(revision => revisions.push(normalizeObjectTaskRevision(revision)));
  }

  asArray(result.exceptions || result.schedule_exceptions).forEach(exception => {
    exceptions.push(normalizeObjectTaskException(exception));
  });

  const sourceChanges = [...nestedSourceChanges, ...asArray(result.source_changes)];
  return {
    ok: result.ok !== false,
    object_id: result.object_id || null,
    customer_id: result.customer_id || null,
    server_clock: result.server_clock || null,
    definitions,
    series,
    revisions: [...new Map(revisions.filter(item => item.effective_from).map(item => [
      item.id || `${item.series_id}:${item.revision_number}:${item.effective_from}`,
      item,
    ])).values()],
    exceptions: [...new Map(exceptions.filter(item => item.source_series_id && item.service_date).map((item, index) => [
      item.id || item.exception_key || `${item.source_series_id}:${item.service_date}:${index}`,
      item,
    ])).values()],
    source_changes: [...new Map(sourceChanges.map((item, index) => [
      item.id || item.change_key || `${item.schedule_series_id || item.series_id}:${item.service_date || item.occurrence_date}:${index}`,
      item,
    ])).values()],
    planning_coverage: asArray(result.planning_coverage),
  };
}

function taskPayload(data = {}) {
  const taskType = required(data.task_type, "Taakcategorie");
  const executionMode = required(data.execution_mode, "Uitvoeringswijze");
  const duration = Number(data.duration_minutes || 0);
  return {
    security_plan_id: data.security_plan_id || null,
    task_type: taskType,
    custom_task_type: taskType === "other" ? required(data.custom_task_type, "Taaknaam") : null,
    execution_mode: executionMode,
    duration_minutes: executionMode === "continuous" ? null : duration,
    instructions: String(data.instructions || "").trim() || null,
  };
}

function scheduleBlockPayload(block = {}) {
  const recurrenceType = block.recurrence_type || (block.frequency === "once" ? "one_time" : block.frequency) || "one_time";
  const serviceDate = required(block.occurrence_date || block.service_date, "Datum");
  return {
    service_date: serviceDate,
    start_time: required(block.start_time, "Starttijd"),
    end_time: required(block.end_time, "Eindtijd"),
    recurrence_type: recurrenceType,
    recurrence_interval: Number(block.recurrence_interval || 1),
    repeat_weekly: (block.frequency || block.recurrence_type) === "weekly" || block.repeat_weekly === true,
    recurrence_end_date: block.repeat_until || block.recurrence_end_date || null,
    recurrence_anchor_date: recurrenceType === "one_time"
      ? serviceDate
      : block.recurrence_anchor_date || block.revision?.recurrence_anchor_date || serviceDate,
  };
}

export async function listObjectTasks({ customerId = null, objectId }) {
  const result = await invoke({
    action: "list_object_tasks",
    object_id: required(objectId, "Object"),
    ...(customerId ? { customer_id: customerId } : {}),
  });
  return normalizeObjectTaskList(result);
}

export async function createObjectTask({ customerId, objectId, data, idempotencyKey }) {
  return invoke({
    action: "create_object_task",
    customer_id: required(customerId, "Klant"),
    object_id: required(objectId, "Object"),
    idempotency_key: required(idempotencyKey, "Mutatiesleutel"),
    expected_version: 0,
    task: taskPayload(data),
    schedule_blocks: asArray(data.schedule_entries || data.schedule_blocks).map(scheduleBlockPayload),
  });
}

export async function addObjectTaskSeries({ customerId, objectId, entry, data, idempotencyKey }) {
  return invoke({
    action: "add_object_task_series",
    customer_id: required(customerId, "Klant"),
    object_id: required(objectId, "Object"),
    task_definition_id: required(entry?.definition_id || entry?.definition?.id, "Taak"),
    idempotency_key: required(idempotencyKey, "Mutatiesleutel"),
    expected_version: expectedVersion(entry?.definition?.version),
    schedule_block: scheduleBlockPayload({ ...entry, ...data }),
  });
}

export async function changeObjectTaskSeries({
  customerId,
  objectId,
  entry,
  data,
  idempotencyKey,
  confirmRemoveOutsideShifts = false,
}) {
  return invoke({
    action: "change_object_task_series",
    customer_id: required(customerId, "Klant"),
    object_id: required(objectId, "Object"),
    task_definition_id: required(entry?.definition_id || entry?.definition?.id, "Taak"),
    series_id: required(entry?.series_id || entry?.series?.id, "Taakreeks"),
    idempotency_key: required(idempotencyKey, "Mutatiesleutel"),
    expected_version: expectedVersion(entry?.series_version || entry?.series?.version),
    effective_from: required(entry?.occurrence_date, "Ingangsdatum"),
    start_time: required(data.start_time, "Starttijd"),
    end_time: required(data.end_time, "Eindtijd"),
    recurrence_type: data.recurrence_type || (data.frequency === "once" ? "one_time" : data.frequency) || "one_time",
    recurrence_interval: Number(data.recurrence_interval || 1),
    repeat_weekly: data.frequency === "weekly" || data.repeat_weekly === true,
    recurrence_end_date: data.repeat_until || data.recurrence_end_date || null,
    recurrence_anchor_date: data.recurrence_anchor_date
      || entry?.recurrence_anchor_date
      || entry?.revision?.recurrence_anchor_date
      || entry?.occurrence_date,
    ...(confirmRemoveOutsideShifts ? { confirm_remove_outside_shifts: true } : {}),
  });
}

export async function stopObjectTaskSeries({ customerId, objectId, entry, idempotencyKey }) {
  return invoke({
    action: "stop_object_task_series",
    customer_id: required(customerId, "Klant"),
    object_id: required(objectId, "Object"),
    task_definition_id: required(entry?.definition_id || entry?.definition?.id, "Taak"),
    series_id: required(entry?.series_id || entry?.series?.id, "Taakreeks"),
    idempotency_key: required(idempotencyKey, "Mutatiesleutel"),
    expected_version: expectedVersion(entry?.series_version || entry?.series?.version),
    effective_from: required(entry?.occurrence_date, "Ingangsdatum"),
  });
}
