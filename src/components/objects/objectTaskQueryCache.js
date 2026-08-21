import {
  normalizeObjectTaskException,
  normalizeObjectTaskRevision,
  normalizeObjectTaskSeries,
} from "./objectTaskScheduleDomain";

const PLANNING_QUERY_FAMILIES = [
  ["planning-shifts"],
  ["planning-assignments"],
  ["planning-task-occurrences"],
  ["planning-task-source-changes"],
  ["planning-task-segments"],
];

function records(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function responseValue(response) {
  return response?.data ?? response ?? {};
}

function recordVersion(value) {
  const version = Number(value?.version || 0);
  return Number.isFinite(version) ? version : 0;
}

function currentRevisionId(value) {
  return value?.current_revision_id || value?.current_revision?.id || null;
}

function revisionKey(value, index = 0) {
  return String(
    value?.id
    || `${value?.series_id || value?.schedule_series_id || "series"}:${value?.revision_number || "revision"}:${value?.effective_from || index}`,
  );
}

function sourceChangeKey(value, index = 0) {
  return String(
    value?.id
    || value?.change_key
    || `${value?.schedule_series_id || value?.series_id || "series"}:${value?.service_date || value?.occurrence_date || index}`,
  );
}

function exceptionKey(value, index = 0) {
  return String(
    value?.id
    || value?.exception_key
    || `${value?.source_series_id || "series"}:${value?.service_date || index}`,
  );
}

/**
 * @param {any[]} current
 * @param {any[]} incoming
 * @param {(value: any, index: number) => string} [keyFor]
 */
function upsertByKey(current, incoming, keyFor) {
  const getKey = keyFor || (value => String(value?.id || ""));
  const next = new Map();
  records(current).forEach((item, index) => {
    const key = getKey(item, index);
    if (key) next.set(key, item);
  });
  records(incoming).forEach((item, index) => {
    const key = getKey(item, index);
    if (!key) return;
    next.set(key, { ...(next.get(key) || {}), ...item });
  });
  return [...next.values()];
}

function mutationSeriesRecords(result) {
  const rawItems = Array.isArray(result?.series)
    ? result.series
    : result?.series
      ? [result.series]
      : result?.schedule_series
        ? [result.schedule_series]
        : [];
  const fallbackDefinitionId = result?.definition?.id || result?.task_definition?.id || null;

  return rawItems.map(item => {
    const rawSeries = item?.series || item?.schedule_series || item;
    const series = normalizeObjectTaskSeries(rawSeries);
    const rawRevision = item?.current_revision
      || item?.revision
      || rawSeries?.current_revision
      || (!Array.isArray(result?.series) ? result?.current_revision : null)
      || null;
    const currentRevision = rawRevision ? normalizeObjectTaskRevision(rawRevision) : null;
    return {
      ...series,
      task_definition_id: series.task_definition_id || fallbackDefinitionId,
      ...(currentRevision?.id || currentRevision?.effective_from
        ? {
            ...(currentRevision.id
              ? { current_revision_id: series.current_revision_id || currentRevision.id }
              : {}),
            current_revision: currentRevision,
          }
        : {}),
    };
  }).filter(item => item.id);
}

function mergeVersionedSnapshot(current, incoming) {
  const incomingById = new Map(records(incoming).map(item => [String(item.id), item]));
  const currentById = new Map(records(current).map(item => [String(item.id), item]));
  const merged = records(incoming).map(item => {
    const existing = currentById.get(String(item.id));
    return existing && recordVersion(existing) >= recordVersion(item)
      ? { ...item, ...existing }
      : item;
  });
  records(current).forEach(item => {
    if (item?.id != null && !incomingById.has(String(item.id))) merged.push(item);
  });
  return merged;
}

function snapshotMissesCurrentRevision(series, revisions) {
  const revisionIds = new Set(records(revisions).map(item => String(item.id || "")));
  return records(series).some(item => {
    const pointer = currentRevisionId(item);
    if (!pointer) return false;
    return !revisionIds.has(String(pointer));
  });
}

function snapshotWouldLoseCurrentRevision(current, incoming, incomingRevisions) {
  const incomingById = new Map(records(incoming).map(item => [String(item.id), item]));
  const incomingRevisionIds = new Set(records(incomingRevisions).map(item => String(item.id || "")));
  return records(current).some(item => {
    const pointer = currentRevisionId(item);
    if (!pointer) return false;
    const next = incomingById.get(String(item.id));
    if (!next || recordVersion(next) > recordVersion(item)) return false;
    const nextPointer = currentRevisionId(next);
    return String(nextPointer || "") !== String(pointer)
      || (
        String(next?.current_revision?.id || "") !== String(pointer)
        && !incomingRevisionIds.has(String(pointer))
      );
  });
}

function snapshotWouldRegress(current, incoming) {
  const incomingById = new Map(records(incoming).map(item => [String(item.id), item]));
  return records(current).some(item => {
    const next = incomingById.get(String(item.id));
    return !next || recordVersion(next) < recordVersion(item);
  });
}

/**
 * Apply the authoritative records returned by an object-task mutation before a
 * background list refresh starts. This keeps the next series mutation on the
 * just-written definition/series versions without another blocking read.
 */
/** @returns {any} */
export function applyObjectTaskMutationResult(current, response) {
  const result = responseValue(response);
  const base = current || {
    definitions: [],
    series: [],
    revisions: [],
    exceptions: [],
    source_changes: [],
    planning_coverage: [],
  };
  const definition = result.definition || result.task_definition || null;
  const returnedSeries = mutationSeriesRecords(result);
  const returnedRevisions = returnedSeries
    .map(item => item.current_revision)
    .filter(Boolean);
  const taskScheduleException = result.task_schedule_exception
    || result.schedule_exception
    || null;

  return {
    ...base,
    ok: result.ok !== false,
    object_id: result.object_id || base.object_id || null,
    customer_id: result.customer_id || base.customer_id || null,
    server_clock: result.server_clock || base.server_clock || null,
    definitions: upsertByKey(base.definitions, definition?.id ? [definition] : []),
    series: upsertByKey(base.series, returnedSeries),
    revisions: upsertByKey(base.revisions, returnedRevisions, revisionKey),
    exceptions: upsertByKey(
      base.exceptions,
      taskScheduleException ? [normalizeObjectTaskException(taskScheduleException)] : [],
      exceptionKey,
    ),
    source_changes: upsertByKey(base.source_changes, result.source_changes, sourceChangeKey)
      .filter(change => !["resolved", "closed"].includes(String(change.status || "").toLowerCase())),
    planning_coverage: records(base.planning_coverage),
  };
}

/**
 * A list request can have started before a mutation completed. Never let that
 * late response downgrade the authoritative versions already in the cache.
 */
/** @returns {any} */
export function mergeObjectTaskQuerySnapshot(current, incoming) {
  if (!incoming) return current;
  if (!current) return incoming;
  const stale = snapshotWouldRegress(current.definitions, incoming.definitions)
    || snapshotWouldRegress(current.series, incoming.series)
    || snapshotWouldRegress(current.exceptions, incoming.exceptions)
    || snapshotMissesCurrentRevision(incoming.series, incoming.revisions)
    || snapshotWouldLoseCurrentRevision(current.series, incoming.series, incoming.revisions);
  return {
    ...incoming,
    definitions: mergeVersionedSnapshot(current.definitions, incoming.definitions),
    series: mergeVersionedSnapshot(current.series, incoming.series),
    exceptions: mergeVersionedSnapshot(current.exceptions, incoming.exceptions),
    revisions: stale
      ? upsertByKey(incoming.revisions, current.revisions, revisionKey)
      : records(incoming.revisions),
    source_changes: stale
      ? upsertByKey(incoming.source_changes, current.source_changes, sourceChangeKey)
      : records(incoming.source_changes),
  };
}

/** @returns {any} */
export function authoritativeObjectTaskEntry(taskData, entry = {}, fallbackDefinition = null) {
  const definitionId = entry.definition_id || entry.definition?.id || fallbackDefinition?.id || null;
  const seriesId = entry.series_id || entry.series?.id || null;
  const definition = records(taskData?.definitions)
    .find(item => String(item.id) === String(definitionId))
    || fallbackDefinition
    || entry.definition
    || null;
  const series = records(taskData?.series)
    .find(item => String(item.id) === String(seriesId))
    || entry.series
    || null;

  return {
    ...entry,
    ...(definition ? { definition, definition_id: definition.id } : {}),
    ...(series ? { series, series_id: series.id, series_version: series.version } : {}),
  };
}

function safelyInvalidate(queryClient, queryKey, refetchType) {
  Promise.resolve(queryClient.invalidateQueries({ queryKey, refetchType })).catch(() => {});
}

/**
 * Coalesce a burst of persisted schedule edits into one background refresh.
 * Related planning caches are marked stale immediately without causing their
 * currently mounted boards to refetch once per submutation.
 */
/** @param {any} options */
export function createObjectTaskRefreshCoordinator(options = {}) {
  const {
    queryClient,
    taskQueryKey,
    taskCoverageQueryKey,
    isBusy = () => false,
    delayMs = 250,
  } = options;
  let timer = null;
  let disposed = false;

  const markStale = () => {
    [taskQueryKey, taskCoverageQueryKey, ...PLANNING_QUERY_FAMILIES]
      .filter(Boolean)
      .forEach(queryKey => safelyInvalidate(queryClient, queryKey, "none"));
  };

  const arm = () => {
    timer = globalThis.setTimeout(() => {
      if (disposed) return;
      if (isBusy()) {
        arm();
        return;
      }
      timer = null;
      safelyInvalidate(queryClient, taskQueryKey, "active");
      safelyInvalidate(queryClient, taskCoverageQueryKey, "active");
    }, delayMs);
  };

  return {
    schedule() {
      if (disposed) return;
      if (timer == null) markStale();
      else globalThis.clearTimeout(timer);
      arm();
    },
    dispose() {
      disposed = true;
      if (timer != null) globalThis.clearTimeout(timer);
      timer = null;
    },
  };
}

export const objectTaskQueryCacheInternals = {
  mutationSeriesRecords,
  sourceChangeKey,
  upsertByKey,
};
