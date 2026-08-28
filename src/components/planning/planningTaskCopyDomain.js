const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const CLOCK_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function requiredText(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${label} ontbreekt.`);
  return normalized;
}

function positiveRevision(value) {
  const revision = Number(value);
  if (!Number.isInteger(revision) || revision < 1) {
    throw new Error("De actuele taakrevisie ontbreekt.");
  }
  return revision;
}

function dateParts(value, label = "Datum") {
  const normalized = requiredText(value, label);
  const match = normalized.match(DATE_KEY_PATTERN);
  if (!match) throw new Error(`${label} is ongeldig.`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    throw new Error(`${label} is ongeldig.`);
  }
  return { normalized, date };
}

function addUtcDays(dateKey, amount) {
  const { date } = dateParts(dateKey);
  date.setUTCDate(date.getUTCDate() + Number(amount));
  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function dateDistanceInDays(startDate, endDate) {
  const start = dateParts(startDate, "Startdatum").date;
  const end = dateParts(endDate, "Einddatum").date;
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

function clockMinutes(value, label) {
  const normalized = requiredText(value, label);
  const match = normalized.match(CLOCK_PATTERN);
  if (!match) throw new Error(`${label} is ongeldig.`);
  return Number(match[1]) * 60 + Number(match[2]);
}

function copiedWindow(occurrence, targetServiceDate) {
  const sourceServiceDate = dateParts(occurrence?.service_date, "Brondatum").normalized;
  const targetDate = dateParts(targetServiceDate, "Doeldatum").normalized;
  const startTime = requiredText(occurrence?.window_start_time, "Starttijd");
  const endTime = requiredText(occurrence?.window_end_time, "Eindtijd");
  const startMinute = clockMinutes(startTime, "Starttijd");
  const endMinute = clockMinutes(endTime, "Eindtijd");
  const suppliedEndDate = occurrence?.end_date
    ? dateParts(occurrence.end_date, "Einddatum").normalized
    : sourceServiceDate;
  let daySpan = dateDistanceInDays(sourceServiceDate, suppliedEndDate);
  if (daySpan === 0 && endMinute <= startMinute) daySpan = 1;
  const durationMinutes = daySpan * 24 * 60 + endMinute - startMinute;
  if (daySpan < 0 || daySpan > 1 || durationMinutes < 1 || durationMinutes > 24 * 60) {
    throw new Error("Het gekopieerde taakvenster moet positief en maximaal 24 uur zijn.");
  }
  const requiredMinutes = Number(occurrence?.required_minutes);
  if (!Number.isFinite(requiredMinutes) || requiredMinutes < 1 || requiredMinutes > durationMinutes) {
    throw new Error("De gevraagde taakduur past niet binnen het taakvenster.");
  }
  if (occurrence?.execution_mode !== "time_window" && requiredMinutes !== durationMinutes) {
    throw new Error("Een doorlopende taak moet het volledige taakvenster vullen.");
  }
  return {
    serviceDate: targetDate,
    endDate: addUtcDays(targetDate, daySpan),
    startTime,
    endTime,
    durationMinutes,
    requiredMinutes,
  };
}

function activeSourceOccurrence(occurrence) {
  if (!occurrence || typeof occurrence !== "object") throw new Error("De brontaak ontbreekt.");
  if (occurrence.lifecycle_status && occurrence.lifecycle_status !== "active") {
    throw new Error("Alleen een actieve taak kan worden gekopieerd.");
  }
  return occurrence;
}

function sourceWasAlternative(occurrence) {
  return Boolean(
    occurrence?.metadata?.planning_alternative
    || occurrence?.metadata?.task_schedule_exception_id
    || occurrence?.metadata?.schedule_kind === "alternative",
  );
}

export function planningTaskCopyReference({ sourceOccurrenceId, targetServiceDate } = {}) {
  const sourceId = requiredText(sourceOccurrenceId, "Brontaak");
  const targetDate = dateParts(targetServiceDate, "Doeldatum").normalized;
  return `task-copy:${encodeURIComponent(sourceId)}:${targetDate}`;
}

/**
 * The planning copy command deliberately fences the concrete occurrence, not
 * ObjectTaskDefinition.version. A definition version is only snapshot data and
 * can change when another schedule series updates its legacy mirror.
 */
export function buildCopyTaskOccurrencePayload({ occurrence, targetServiceDate } = {}) {
  const source = activeSourceOccurrence(occurrence);
  const sourceOccurrenceId = requiredText(source.id, "Brontaak");
  const expectedSourceOccurrenceRevision = positiveRevision(source.revision);
  const targetDate = dateParts(targetServiceDate, "Doeldatum").normalized;
  return {
    action: "copy_task_occurrence",
    source_occurrence_id: sourceOccurrenceId,
    expected_source_occurrence_revision: expectedSourceOccurrenceRevision,
    target_service_date: targetDate,
  };
}

/**
 * Creates a client-only, standalone one-time occurrence. It intentionally
 * clears every schedule-series and alternative link: copying a weekly or
 * alternative occurrence must never extend or replace its source blueprint.
 */
export function buildOptimisticCopiedTaskOccurrence({ occurrence, targetServiceDate } = {}) {
  const source = activeSourceOccurrence(occurrence);
  const payload = buildCopyTaskOccurrencePayload({ occurrence: source, targetServiceDate });
  const window = copiedWindow(source, payload.target_service_date);
  const reference = planningTaskCopyReference({
    sourceOccurrenceId: payload.source_occurrence_id,
    targetServiceDate: payload.target_service_date,
  });
  const temporaryId = `pending-${reference}`;
  const schedulePeriodKey = `pending-${reference}`;
  return {
    id: temporaryId,
    source_key: temporaryId,
    logical_source_key: null,
    object_task_definition_id: requiredText(source.object_task_definition_id, "Taakdefinitie"),
    object_task_schedule_series_id: null,
    object_task_schedule_revision_id: null,
    schedule_series_key: null,
    schedule_revision_number: null,
    supersedes_task_occurrence_id: null,
    superseded_by_task_occurrence_id: null,
    definition_version: Math.max(1, Number(source.definition_version || 1)),
    schedule_period_key: schedulePeriodKey,
    company_id: source.company_id || null,
    customer_id: requiredText(source.customer_id, "Klant"),
    object_id: requiredText(source.object_id, "Object"),
    security_plan_id: source.security_plan_id || null,
    security_plan_revision_id: source.security_plan_revision_id || null,
    security_plan_snapshot: source.security_plan_snapshot || null,
    security_plan_checksum: source.security_plan_checksum || null,
    task_type: requiredText(source.task_type, "Taaktype"),
    custom_task_type: source.custom_task_type || null,
    execution_mode: source.execution_mode === "time_window" ? "time_window" : "continuous",
    service_date: window.serviceDate,
    end_date: window.endDate,
    window_start_time: window.startTime,
    window_end_time: window.endTime,
    timezone: source.timezone || "Europe/Amsterdam",
    required_minutes: window.requiredMinutes,
    lifecycle_status: "active",
    task_name_snapshot: requiredText(source.task_name_snapshot, "Taaknaam"),
    customer_name_snapshot: source.customer_name_snapshot || null,
    object_name_snapshot: source.object_name_snapshot || null,
    instructions_snapshot: source.instructions_snapshot || null,
    revision: 1,
    published_revision: 0,
    last_published_correlation_id: null,
    last_modified_by_user_id: null,
    last_modified_at: null,
    metadata: {
      copy_kind: "standalone_one_time",
      copy_reference: reference,
      copied_from_task_occurrence_id: payload.source_occurrence_id,
      copied_from_task_occurrence_revision: payload.expected_source_occurrence_revision,
      copy_target_service_date: payload.target_service_date,
      source_was_alternative: sourceWasAlternative(source),
    },
    _optimistic_pending: true,
    _optimistic_task_copy: true,
    _task_copy_reference: reference,
    _copy_source_occurrence_id: payload.source_occurrence_id,
  };
}

function resultOccurrences(result) {
  return [
    result?.target_occurrence,
    result?.copied_task_occurrence,
    result?.task_occurrence,
    ...(Array.isArray(result?.task_occurrences) ? result.task_occurrences : []),
  ].filter(item => item?.id != null);
}

function authoritativeTargetOccurrence(result, optimisticOccurrence) {
  const sourceId = String(optimisticOccurrence?._copy_source_occurrence_id || "");
  const temporaryId = String(optimisticOccurrence?.id || "");
  return resultOccurrences(result).find(item => (
    String(item.id) !== sourceId
    && String(item.id) !== temporaryId
    && String(item.object_task_definition_id) === String(optimisticOccurrence?.object_task_definition_id)
    && String(item.service_date) === String(optimisticOccurrence?.service_date)
  )) || null;
}

function assertStandaloneTarget(target, optimisticOccurrence) {
  if (target.lifecycle_status && target.lifecycle_status !== "active") {
    throw new Error("De gekopieerde taak is niet actief teruggekomen van de server.");
  }
  if (
    target.supersedes_task_occurrence_id
    || target.metadata?.planning_alternative
    || target.metadata?.task_schedule_exception_id
  ) {
    throw new Error("De server heeft de kopie ten onrechte als taakuitzondering gekoppeld.");
  }
  const expected = copiedWindow(optimisticOccurrence, optimisticOccurrence.service_date);
  if (
    String(target.end_date || target.service_date) !== expected.endDate
    || String(target.window_start_time) !== expected.startTime
    || String(target.window_end_time) !== expected.endTime
    || Number(target.required_minutes) !== expected.requiredMinutes
  ) {
    throw new Error("De serverkopie wijkt af van het gekozen taakvenster.");
  }
}

/**
 * Replaces one optimistic occurrence with the authoritative target returned by
 * copy_task_occurrence. Existing target rows are upserted, so an idempotent or
 * repeated paste can never create a duplicate card in local state.
 */
export function reconcileOptimisticTaskCopy({ occurrences = [], optimisticOccurrence, result } = {}) {
  if (!optimisticOccurrence?._optimistic_task_copy) {
    throw new Error("De optimistische taakkopie ontbreekt.");
  }
  const targetOccurrence = authoritativeTargetOccurrence(result, optimisticOccurrence);
  if (!targetOccurrence) {
    return {
      reconciled: false,
      occurrences: Array.isArray(occurrences) ? occurrences : [],
      targetOccurrence: null,
      optimisticOccurrenceId: optimisticOccurrence.id,
    };
  }
  assertStandaloneTarget(targetOccurrence, optimisticOccurrence);
  const next = new Map();
  (Array.isArray(occurrences) ? occurrences : []).forEach(item => {
    if (!item?.id || String(item.id) === String(optimisticOccurrence.id)) return;
    next.set(String(item.id), item);
  });
  next.set(String(targetOccurrence.id), targetOccurrence);
  return {
    reconciled: true,
    occurrences: [...next.values()],
    targetOccurrence,
    optimisticOccurrenceId: optimisticOccurrence.id,
  };
}

export function rollbackOptimisticTaskCopy({ occurrences = [], optimisticOccurrence } = {}) {
  if (!optimisticOccurrence?.id) return Array.isArray(occurrences) ? occurrences : [];
  return (Array.isArray(occurrences) ? occurrences : []).filter(item => (
    String(item?.id) !== String(optimisticOccurrence.id)
  ));
}
