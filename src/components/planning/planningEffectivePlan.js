import { findSamePersonnelAdjacentShiftMerge } from "@/components/planning/planningAdjacentShiftMerge";
import {
  addDays,
  getShiftInterval,
  planningShiftOwnedByRange,
  toDateKey,
} from "@/components/planning/planningDomain";
import {
  buildTimelineResizeCompositionPayload,
  clockToTimelineMinutes,
  getTaskTimelineGaps,
  MAX_AUTOMATIC_TASK_SERVICE_MINUTES,
  timelineMinutesToClock,
} from "@/components/planning/planningTimelineDomain";

const RESIZE_TASK_SHIFT_PRESERVING_COVERAGE_ACTION = "resize_task_shift_preserving_coverage";

function records(value) {
  return Array.isArray(value) ? value.filter(item => item?.id != null) : [];
}

function overlayById(baseRecords, incomingRecords) {
  const next = new Map(records(baseRecords).map(record => [String(record.id), record]));
  records(incomingRecords).forEach(record => {
    const key = String(record.id);
    next.set(key, { ...(next.get(key) || {}), ...record });
  });
  return [...next.values()];
}

function activeIntents(intents) {
  return (Array.isArray(intents) ? intents : []).filter(intent => (
    intent && intent.status !== "failed" && intent.status !== "cancelled"
  ));
}

function resultRecords(result, pluralKey, singularKey) {
  const plural = records(result?.[pluralKey]);
  if (plural.length > 0) return plural;
  return result?.[singularKey]?.id != null ? [result[singularKey]] : [];
}

function uniqueRecordsById(value) {
  const byId = new Map();
  (Array.isArray(value) ? value : []).forEach(record => {
    if (record?.id == null) return;
    byId.set(String(record.id), record);
  });
  return [...byId.values()];
}

function resultOccurrenceRecords(result) {
  return uniqueRecordsById([
    ...records(result?.task_occurrences),
    result?.task_occurrence,
    result?.target_occurrence,
    result?.copied_task_occurrence,
  ]);
}

function text(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function explicitPlanningReference(record) {
  return text(
    record?._planning_ref
    || record?.planning_ref
    || record?.client_ref
    || record?.metadata?.planning_ref,
  );
}

/**
 * Stable client reference used while an authoritative Base44 id does not exist
 * yet. `source_key` is deliberately preferred over `id`: it can survive an
 * optimistic-to-server id replacement when the mutation echoes source keys.
 */
export function planningRecordReference(record, kind = "record") {
  if (record == null) return null;
  if (typeof record !== "object") return text(record);
  const explicit = explicitPlanningReference(record);
  if (explicit) return explicit;
  const sourceKey = text(record.source_key);
  if (sourceKey) return `${kind}:source:${sourceKey}`;
  const id = text(record.id);
  return id ? `${kind}:id:${id}` : null;
}

export function planningOriginIntentId(record) {
  return text(
    record?._planning_origin_intent_id
    || record?.origin_intent_id
    || record?.metadata?.planning_origin_intent_id,
  );
}

/** @param {any} record */
export function withPlanningOptimisticIdentity(record, {
  kind = "record",
  originIntentId = null,
  planningRef = null,
  index = 0,
} = {}) {
  if (!record || typeof record !== "object") return record;
  const origin = text(originIntentId) || planningOriginIntentId(record) || "local";
  const reference = text(planningRef)
    || explicitPlanningReference(record)
    || `${origin}:${kind}:${text(record.source_key) || text(record.id) || index}`;
  return {
    ...record,
    _planning_ref: reference,
    _planning_origin_intent_id: origin,
    _optimistic_pending: true,
  };
}

export function withPlanningOptimisticIntentIdentity(intent, {
  originIntentId = intent?.key,
} = {}) {
  if (!intent || typeof intent !== "object") return intent;
  const origin = text(originIntentId) || text(intent.key) || "local";
  const stamp = kind => (record, index) => withPlanningOptimisticIdentity(record, {
    kind,
    originIntentId: origin,
    index,
  });
  return {
    ...intent,
    _planning_origin_intent_id: origin,
    shifts: records(intent.shifts).map(stamp("shift")),
    assignments: records(intent.assignments).map(stamp("assignment")),
    segments: records(intent.segments).map(stamp("segment")),
    occurrences: records(intent.occurrences).map(stamp("occurrence")),
  };
}

function targetReference(target) {
  if (!target || typeof target !== "object") return null;
  return text(
    target.ref
    || target._planning_ref
    || target.planning_ref
    || target.client_ref
    || target.metadata?.planning_ref,
  );
}

function targetMatch(recordsToSearch, predicate, matchedBy, kind, target) {
  const matches = recordsToSearch.filter(predicate);
  if (matches.length === 1) {
    return { status: "ready", reason: null, record: matches[0], matchedBy, target };
  }
  if (matches.length > 1) {
    return {
      status: "blocked",
      reason: `${kind}_target_ambiguous`,
      record: null,
      matchedBy,
      target,
      candidates: matches,
    };
  }
  return null;
}

/**
 * Resolves at execute time, in strict identity order: id, source_key, then
 * stable planning ref. A plain string may represent any of those identities.
 */
export function resolvePlanningRecordTarget(value, target, { kind = "record" } = {}) {
  const available = records(value);
  const id = typeof target === "object" ? text(target?.id) : text(target);
  const sourceKey = typeof target === "object" ? text(target?.source_key) : text(target);
  const reference = typeof target === "object" ? targetReference(target) : text(target);
  const candidates = [
    id && targetMatch(available, item => text(item.id) === id, "id", kind, target),
    sourceKey && targetMatch(available, item => text(item.source_key) === sourceKey, "source_key", kind, target),
    reference && targetMatch(
      available,
      item => explicitPlanningReference(item) === reference || planningRecordReference(item, kind) === reference,
      "ref",
      kind,
      target,
    ),
  ].filter(Boolean);
  if (candidates.length > 0) return candidates[0];
  return {
    status: "blocked",
    reason: `${kind}_target_missing`,
    record: null,
    matchedBy: null,
    target,
  };
}

export function resolvePlanningShiftTarget(snapshot = {}, target) {
  return resolvePlanningRecordTarget(snapshot.shifts, target, { kind: "shift" });
}

export function resolvePlanningSegmentTarget(snapshot = {}, target) {
  return resolvePlanningRecordTarget(snapshot.segments, target, { kind: "segment" });
}

export function resolvePlanningAssignmentTarget(snapshot = {}, target) {
  return resolvePlanningRecordTarget(snapshot.assignments, target, { kind: "assignment" });
}

export function resolvePlanningOccurrenceTarget(snapshot = {}, target) {
  return resolvePlanningRecordTarget(snapshot.occurrences, target, { kind: "occurrence" });
}

function rangeQueryRecords(queryClient, family, periodStart, periodEnd) {
  const byId = new Map();
  const queryRows = queryClient?.getQueriesData?.({ queryKey: [family] }) || [];
  queryRows
    .filter(([queryKey]) => (
      String(queryKey?.[1] || "") === String(periodStart)
      && String(queryKey?.[2] || "") === String(periodEnd)
    ))
    .forEach(([, current]) => {
      records(current).forEach(item => {
        const key = String(item.id);
        const existing = byId.get(key);
        if (!existing || Number(item.revision || 0) >= Number(existing.revision || 0)) byId.set(key, item);
      });
    });
  return [...byId.values()];
}

function markRemovedById(current, ids) {
  const removed = new Set((Array.isArray(ids) ? ids : []).filter(Boolean).map(String));
  if (removed.size === 0) return records(current);
  return records(current).map(item => (
    removed.has(String(item.id)) ? { ...item, status: "removed" } : item
  ));
}

function shiftIdForAssignment(assignment) {
  return String(assignment?.planning_shift_id || assignment?.shift_id || "");
}

function activeAssignmentsForShift(snapshot, shiftId) {
  return records(snapshot?.assignments).filter(assignment => (
    assignment.status !== "removed" && shiftIdForAssignment(assignment) === String(shiftId)
  ));
}

/**
 * Finds a staffed adjacent partition that can absorb an existing open task
 * shift for the same employee. The open target itself is excluded from the
 * legacy "proposed segment" search so its coverage is not mistaken for an
 * overlap. Optimistic parent records are treated as local committed evidence;
 * queue dependencies still fence their actual server execution.
 */
export function resolveOpenShiftSamePersonnelMerge({ snapshot, targetShift, personnelId } = {}) {
  if (
    !targetShift?.id
    || targetShift.status !== "draft"
    || targetShift.source_type !== "task"
    || Number(targetShift.published_revision || 0) > 0
    || Number(targetShift.required_count || 1) !== 1
  ) return { status: "none", reason: "target_not_mergeable", candidate: null };
  const targetAssignments = activeAssignmentsForShift(snapshot, targetShift.id);
  const targetSegments = records(snapshot?.segments).filter(item => (
    item.status !== "removed" && String(item.shift_id) === String(targetShift.id)
  ));
  if (targetAssignments.length > 0 || targetSegments.length !== 1) {
    return { status: "none", reason: "target_not_open_single_segment", candidate: null };
  }
  const targetSegment = targetSegments[0];
  const clearOptimisticFlag = item => ({ ...item, _optimistic_pending: false });
  const result = findSamePersonnelAdjacentShiftMerge({
    occurrenceId: targetSegment.task_occurrence_id,
    personnelId,
    proposedSegment: clearOptimisticFlag(targetSegment),
    shifts: records(snapshot?.shifts)
      .filter(item => String(item.id) !== String(targetShift.id))
      .map(clearOptimisticFlag),
    segments: records(snapshot?.segments)
      .filter(item => String(item.shift_id) !== String(targetShift.id))
      .map(clearOptimisticFlag),
    assignments: records(snapshot?.assignments)
      .filter(item => shiftIdForAssignment(item) !== String(targetShift.id))
      .map(clearOptimisticFlag),
  });
  if (result.status !== "merge") return result;
  const shiftOrigin = targetShift.metadata?.task_partition_origin;
  const segmentOrigin = targetSegment.metadata?.task_partition_origin;
  const isResizeCompanion = (
    shiftOrigin?.action === RESIZE_TASK_SHIFT_PRESERVING_COVERAGE_ACTION
    && segmentOrigin?.action === RESIZE_TASK_SHIFT_PRESERVING_COVERAGE_ACTION
    && String(shiftOrigin?.original_shift_id || "") === String(result.candidate.shift.id)
    && String(segmentOrigin?.original_shift_id || "") === String(result.candidate.shift.id)
  );
  if (!isResizeCompanion) {
    return {
      status: "none",
      reason: "target_not_resize_companion",
      candidate: null,
      targetSegment,
    };
  }
  return { ...result, targetSegment };
}

/** @param {any} options */
function findOptimisticSamePersonnelAdjacentShiftMerge({
  snapshot,
  occurrenceId,
  personnelId,
  proposedSegment,
} = {}) {
  const optimisticShifts = records(snapshot?.shifts).filter(item => item._optimistic_pending === true);
  const optimisticShiftIds = new Set(optimisticShifts.map(item => String(item.id)));
  const optimisticSegments = records(snapshot?.segments).filter(item => (
    item._optimistic_pending === true && optimisticShiftIds.has(String(item.shift_id))
  ));
  const optimisticAssignments = records(snapshot?.assignments).filter(item => (
    item._optimistic_pending === true && optimisticShiftIds.has(shiftIdForAssignment(item))
  ));
  if (optimisticShifts.length === 0 || optimisticSegments.length === 0 || optimisticAssignments.length === 0) {
    return { status: "none", reason: "no_optimistic_adjacent_shift", candidate: null };
  }
  return /** @type {any} */ (findSamePersonnelAdjacentShiftMerge)({
    occurrenceId,
    personnelId,
    proposedSegment,
    shifts: optimisticShifts.map(item => ({ ...item, _optimistic_pending: false })),
    segments: optimisticSegments.map(item => ({ ...item, _optimistic_pending: false })),
    assignments: optimisticAssignments.map(item => ({ ...item, _optimistic_pending: false })),
  });
}

function preferredTimelineBounds(preferredSegment, serviceDate) {
  if (!preferredSegment || String(preferredSegment.start_date || preferredSegment.service_date) !== String(serviceDate)) {
    return { startMinute: null, durationMinutes: null };
  }
  const startMinute = clockToTimelineMinutes(preferredSegment.start_time);
  let endMinute = clockToTimelineMinutes(preferredSegment.end_time);
  const endDate = preferredSegment.end_date || preferredSegment.start_date || preferredSegment.service_date;
  if (String(endDate) > String(serviceDate) && endMinute === 0) endMinute = 24 * 60;
  if (startMinute == null || endMinute == null || endMinute <= startMinute) {
    return { startMinute: null, durationMinutes: null };
  }
  return { startMinute, durationMinutes: endMinute - startMinute };
}

function timelineBoundary(serviceDate, minute) {
  if (minute === 24 * 60) {
    return { date: toDateKey(addDays(serviceDate, 1)), time: "00:00" };
  }
  return { date: serviceDate, time: timelineMinutesToClock(minute) };
}

/**
 * Projects the same local planning truth into every UI consumer. Pending
 * commands are ordinary records with temporary ids, so coverage, warnings,
 * workload and the right-hand backlog all react before the network response.
 */
export function buildEffectivePlanningPlan({
  shifts = [],
  assignments = [],
  segments = [],
  occurrences = [],
  intents = [],
} = {}) {
  const pending = activeIntents(intents);
  return {
    shifts: overlayById(shifts, pending.flatMap(intent => records(intent.shifts))),
    assignments: overlayById(assignments, pending.flatMap(intent => records(intent.assignments))),
    segments: overlayById(segments, pending.flatMap(intent => records(intent.segments))),
    occurrences: overlayById(occurrences, pending.flatMap(intent => records(intent.occurrences))),
    pendingIntentCount: pending.length,
  };
}

/**
 * Keeps the execute-time planning snapshot in lockstep with mutation responses.
 * It deliberately mirrors the query-cache reconciliation contract, but remains
 * React- and QueryClient-independent so queued commands can rebase synchronously.
 */
export function reconcilePlanningSnapshot(snapshot = {}, result = {}, {
  replaceShiftSegments = false,
} = {}) {
  const incomingShifts = resultRecords(result, "shifts", "shift");
  const incomingAssignments = resultRecords(result, "assignments", "assignment");
  const incomingSegments = resultRecords(result, "segments", "segment");
  const incomingOccurrences = resultOccurrenceRecords(result);
  const relevantShiftIds = new Set([
    ...incomingShifts.map(item => item.id),
    ...incomingAssignments.map(shiftIdForAssignment),
    ...incomingSegments.map(item => item.shift_id),
  ].filter(Boolean).map(String));
  const baseSegments = replaceShiftSegments && relevantShiftIds.size > 0
    ? records(snapshot.segments).filter(item => !relevantShiftIds.has(String(item.shift_id)))
    : records(snapshot.segments);

  return {
    shifts: overlayById(snapshot.shifts, incomingShifts),
    assignments: markRemovedById(
      overlayById(snapshot.assignments, incomingAssignments),
      result.removed_assignment_ids,
    ),
    segments: markRemovedById(
      overlayById(baseSegments, incomingSegments),
      result.removed_segment_ids,
    ),
    occurrences: overlayById(snapshot.occurrences, incomingOccurrences),
  };
}

/**
 * Reads one immutable planning range from QueryClient. Queue commands capture
 * their range at enqueue time, so navigating elsewhere cannot replace the
 * occurrence/shift revisions they need when their FIFO turn starts.
 * @param {any} queryClient
 * @param {{ periodStart: string, periodEnd: string }} range
 */
export function readPlanningRangeSnapshot(queryClient, { periodStart, periodEnd }) {
  return {
    shifts: rangeQueryRecords(queryClient, "planning-shifts", periodStart, periodEnd),
    assignments: rangeQueryRecords(queryClient, "planning-assignments", periodStart, periodEnd),
    segments: rangeQueryRecords(queryClient, "planning-task-segments", periodStart, periodEnd),
    occurrences: rangeQueryRecords(queryClient, "planning-task-occurrences", periodStart, periodEnd),
  };
}

/**
 * Builds publish ids and revision fences from the post-drain range cache.
 * @param {any} options
 */
export function buildPlanningPublicationSnapshot({ snapshot = {}, periodStart, periodEnd } = {}) {
  const shifts = records(snapshot.shifts).filter(shift => (
    shift.status !== "cancelled" && planningShiftOwnedByRange(shift, periodStart, periodEnd)
  ));
  return {
    shifts,
    shiftIds: shifts.map(shift => shift.id),
    expectedShiftRevisions: Object.fromEntries(
      shifts.map(shift => [shift.id, Math.max(1, Number(shift.revision || 1))]),
    ),
  };
}

/** Resolve the exact current revision and open slot when a queued assignment starts. */
/** @param {any} options */
export function resolveQueuedShiftAssignment({
  snapshot = {},
  shiftId,
  personnelId,
  requestedSlotIndex = null,
} = {}) {
  const shift = records(snapshot.shifts).find(item => (
    String(item.id) === String(shiftId) && item.status !== "cancelled"
  ));
  if (!shift) return { status: "blocked", reason: "shift_missing", shift: null, slotIndex: null };
  const current = activeAssignmentsForShift(snapshot, shift.id);
  if (current.some(item => String(item.personnel_id) === String(personnelId))) {
    return { status: "blocked", reason: "personnel_already_assigned", shift, slotIndex: null };
  }
  const requiredCount = Math.max(1, Number(shift.required_count || 1));
  const occupied = new Set(current.map(item => Number(item.slot_index || 0)));
  const requested = Number(requestedSlotIndex);
  const requestedIsAvailable = Number.isInteger(requested)
    && requested >= 0
    && requested < requiredCount
    && !occupied.has(requested);
  const slotIndex = requestedIsAvailable
    ? requested
    : Array.from({ length: requiredCount }, (_, index) => index).find(index => !occupied.has(index));
  if (slotIndex == null) return { status: "blocked", reason: "shift_full", shift, slotIndex: null };
  return {
    status: "ready",
    reason: null,
    shift,
    slotIndex,
    expectedShiftRevision: Math.max(1, Number(shift.revision || 1)),
  };
}

/**
 * Re-evaluates a requested occurrence slice against current authoritative
 * coverage. A later queued command therefore follows the gap left by the
 * command directly before it instead of replaying a stale visual interval.
 * @param {any} options
 */
export function resolveQueuedOccurrenceAllocation({
  snapshot = {},
  occurrenceId,
  serviceDate,
  preferredSegment = null,
  maximumDurationMinutes = MAX_AUTOMATIC_TASK_SERVICE_MINUTES,
} = {}) {
  const occurrence = records(snapshot.occurrences).find(item => (
    String(item.id) === String(occurrenceId) && item.lifecycle_status !== "cancelled"
  ));
  if (!occurrence) return { status: "blocked", reason: "occurrence_missing", occurrence: null, segment: null };
  const gaps = /** @type {any} */ (getTaskTimelineGaps)({
    occurrence,
    serviceDate,
    segments: records(snapshot.segments),
    shifts: records(snapshot.shifts),
  });
  if (gaps.length === 0) return { status: "blocked", reason: "occurrence_full", occurrence, segment: null };

  const preferred = preferredTimelineBounds(preferredSegment, serviceDate);
  const gap = preferred.startMinute == null
    ? gaps[0]
    : gaps.find(item => preferred.startMinute >= item.startMinute && preferred.startMinute < item.endMinute)
      || gaps.find(item => item.startMinute >= preferred.startMinute)
      || gaps[0];
  const startMinute = preferred.startMinute != null
    && preferred.startMinute >= gap.startMinute
    && preferred.startMinute < gap.endMinute
    ? preferred.startMinute
    : gap.startMinute;
  const requestedMinutes = Math.max(
    5,
    Math.min(
      Math.max(5, Number(maximumDurationMinutes) || MAX_AUTOMATIC_TASK_SERVICE_MINUTES),
      preferred.durationMinutes || MAX_AUTOMATIC_TASK_SERVICE_MINUTES,
    ),
  );
  const durationMinutes = Math.min(
    requestedMinutes,
    Number(gap.allocatableMinutes || gap.durationMinutes || 0),
    gap.endMinute - startMinute,
  );
  if (durationMinutes <= 0) return { status: "blocked", reason: "occurrence_gap_exhausted", occurrence, segment: null };
  const endMinute = startMinute + durationMinutes;
  const start = timelineBoundary(serviceDate, startMinute);
  const end = timelineBoundary(serviceDate, endMinute);
  return {
    status: "ready",
    reason: null,
    occurrence,
    durationMinutes,
    expectedOccurrenceRevision: Math.max(1, Number(occurrence.revision || 1)),
    segment: {
      task_occurrence_id: occurrence.id,
      start_date: start.date,
      end_date: end.date,
      start_time: start.time,
      end_time: end.time,
    },
  };
}

/**
 * Builds the actual server mutation only when a queued occurrence command is
 * allowed to run. The same employee is merged into one adjacent <=12h service;
 * a different employee receives a new service for the then-current gap.
 * @param {any} options
 */
export function resolveQueuedOccurrenceMutation({
  snapshot = {},
  occurrenceId,
  personnelId,
  personnelName,
  serviceDate,
  preferredSegment = null,
  assignmentSource = "planning_ui",
  warnings = [],
  allowOptimisticAdjacent = false,
} = {}) {
  const allocation = resolveQueuedOccurrenceAllocation({
    snapshot,
    occurrenceId,
    serviceDate,
    preferredSegment,
  });
  if (allocation.status !== "ready") return { ...allocation, kind: "blocked", payload: null };

  let adjacent = /** @type {any} */ (findSamePersonnelAdjacentShiftMerge)({
    occurrenceId,
    personnelId,
    proposedSegment: allocation.segment,
    shifts: records(snapshot.shifts),
    segments: records(snapshot.segments),
    assignments: records(snapshot.assignments),
  });
  if (adjacent.status === "none" && allowOptimisticAdjacent) {
    adjacent = findOptimisticSamePersonnelAdjacentShiftMerge({
      snapshot,
      occurrenceId,
      personnelId,
      proposedSegment: allocation.segment,
    });
  }
  if (adjacent.status === "merge") {
    const candidate = adjacent.candidate;
    const shiftSegments = records(snapshot.segments).filter(item => (
      item.status !== "removed" && String(item.shift_id) === String(candidate.shift.id)
    ));
    const occurrenceIds = [...new Set(shiftSegments.map(item => String(item.task_occurrence_id)))];
    const occurrences = occurrenceIds.map(id => records(snapshot.occurrences).find(item => String(item.id) === id));
    if (occurrences.some(item => !item)) {
      return { status: "blocked", reason: "merge_occurrence_missing", kind: "blocked", payload: null };
    }
    return {
      status: "ready",
      reason: null,
      kind: "merge",
      allocation,
      adjacent,
      payload: /** @type {any} */ (buildTimelineResizeCompositionPayload)({
        shift: candidate.shift,
        targetSegmentId: candidate.segment.id,
        segments: shiftSegments,
        occurrences,
        nextStartDate: candidate.mergedSegment.start_date,
        nextEndDate: candidate.mergedSegment.end_date,
        nextStartTime: candidate.mergedSegment.start_time,
        nextEndTime: candidate.mergedSegment.end_time,
      }),
    };
  }
  if (adjacent.status !== "none") {
    return { status: "blocked", reason: adjacent.reason, kind: "blocked", allocation, adjacent, payload: null };
  }
  return {
    status: "ready",
    reason: null,
    kind: "compose",
    allocation,
    adjacent,
    payload: {
      action: "compose_and_assign",
      personnel_id: personnelId,
      personnel_name: personnelName,
      slot_index: 0,
      required_count: 1,
      assignment_source: assignmentSource,
      warnings,
      expected_occurrence_revisions: {
        [allocation.occurrence.id]: allocation.expectedOccurrenceRevision,
      },
      segments: [allocation.segment],
    },
  };
}

function localClock(value) {
  return [value.getHours(), value.getMinutes()]
    .map(part => String(part).padStart(2, "0"))
    .join(":");
}

function intervalTiming(start, end, kind) {
  const startDate = toDateKey(start);
  const endDate = toDateKey(end);
  const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60_000);
  if (kind === "shift") {
    return {
      service_date: startDate,
      end_date: startDate === endDate ? null : endDate,
      start_time: localClock(start),
      end_time: localClock(end),
      duration_minutes: durationMinutes,
    };
  }
  return {
    start_date: startDate,
    end_date: endDate,
    start_time: localClock(start),
    end_time: localClock(end),
    duration_minutes: durationMinutes,
  };
}

function requiredInterval(record, label) {
  const interval = getShiftInterval(record);
  if (!interval.valid) throw new TypeError(`${label} heeft geen geldig tijdsinterval.`);
  return interval;
}

function requestedResizeInterval(segment, current, {
  nextStartDate = null,
  nextEndDate = null,
  nextStartTime = null,
  nextEndTime = null,
} = {}) {
  return getShiftInterval({
    start_date: nextStartDate || toDateKey(current.start),
    end_date: nextEndDate || toDateKey(current.end),
    start_time: nextStartTime || localClock(current.start),
    end_time: nextEndTime || localClock(current.end),
    timezone: segment?.timezone || "Europe/Amsterdam",
    overnight: false,
    crosses_midnight: false,
  });
}

function dependencyIntentBase({ key, originIntentId, kind }) {
  const intentKey = text(key);
  if (!intentKey) throw new TypeError("Een planningintent-key is verplicht.");
  const origin = text(originIntentId) || intentKey;
  return {
    key: intentKey,
    kind,
    status: "queued",
    _planning_origin_intent_id: origin,
  };
}

function optimisticTemporaryId(kind, reference) {
  return `pending-${kind}-${encodeURIComponent(reference)}`;
}

function optimisticReference(origin, kind, suffix) {
  return `${origin}:${kind}:${suffix}`;
}

function stampedRecord(record, kind, origin, planningRef = null) {
  return withPlanningOptimisticIdentity(record, {
    kind,
    originIntentId: origin,
    planningRef: planningRef || planningRecordReference(record, kind),
  });
}

function resizedRecord(record, kind, start, end, origin) {
  return stampedRecord({
    ...record,
    ...intervalTiming(start, end, kind),
    status: "draft",
  }, kind, origin);
}

function companionRecords({ shift, segment, start, end, origin, side }) {
  const shiftRef = optimisticReference(origin, "shift", `open-${side}`);
  const segmentRef = optimisticReference(origin, "segment", `open-${side}`);
  const shiftId = optimisticTemporaryId("shift", shiftRef);
  const segmentId = optimisticTemporaryId("segment", segmentRef);
  const backendSide = side === "leading" ? "before" : "after";
  const taskPartitionOrigin = {
    action: RESIZE_TASK_SHIFT_PRESERVING_COVERAGE_ACTION,
    original_shift_id: shift.id,
    original_segment_id: segment.id,
    side: backendSide,
  };
  const companionShift = stampedRecord({
    ...shift,
    id: shiftId,
    revision: 1,
    source_key: `optimistic:${shiftRef}`,
    ...intervalTiming(start, end, "shift"),
    status: "draft",
    metadata: {
      ...(shift?.metadata || {}),
      task_partition_origin: taskPartitionOrigin,
    },
    task_occurrence_ids: shift?.task_occurrence_ids?.length
      ? shift.task_occurrence_ids
      : [segment.task_occurrence_id].filter(Boolean),
  }, "shift", origin, shiftRef);
  const companionSegment = stampedRecord({
    ...segment,
    id: segmentId,
    revision: 1,
    source_key: `optimistic:${segmentRef}`,
    shift_id: shiftId,
    ...intervalTiming(start, end, "segment"),
    status: "draft",
    metadata: {
      ...(segment?.metadata || {}),
      task_partition_origin: taskPartitionOrigin,
    },
  }, "segment", origin, segmentRef);
  return {
    side,
    shift: companionShift,
    segment: companionSegment,
    shiftRef,
    segmentRef,
  };
}

function assertShiftSegmentLink(shift, segment) {
  if (!shift?.id || !segment?.id) throw new TypeError("Dienst en taaksegment zijn verplicht.");
  if (String(segment.shift_id) !== String(shift.id)) {
    throw new TypeError("Het taaksegment hoort niet bij de gekozen dienst.");
  }
}

/**
 * Optimistically resizes one staffed service and materializes every uncovered
 * edge as a real draft shift + active segment with zero assignments. This is
 * the crucial distinction between an open service and an open task.
 */
export function buildDependentPlanningResizeIntent({
  key,
  originIntentId = null,
  shift,
  segment,
  assignments = [],
  nextStartDate = null,
  nextEndDate = null,
  nextStartTime = null,
  nextEndTime = null,
  minimumDurationMinutes = 5,
} = /** @type {any} */ ({})) {
  assertShiftSegmentLink(shift, segment);
  const base = dependencyIntentBase({ key, originIntentId, kind: "dependent_resize" });
  const current = requiredInterval(segment, "Taaksegment");
  const requested = requestedResizeInterval(segment, current, {
    nextStartDate,
    nextEndDate,
    nextStartTime,
    nextEndTime,
  });
  if (!requested.valid) throw new RangeError("De nieuwe diensttijd heeft geen positieve duur.");
  if (requested.start < current.start || requested.end > current.end) {
    throw new RangeError("De nieuwe diensttijd moet binnen het huidige taaksegment blijven.");
  }
  const minimum = Math.max(1, Number(minimumDurationMinutes) || 5);
  const requestedMinutes = Math.round((requested.end.getTime() - requested.start.getTime()) / 60_000);
  if (requestedMinutes < minimum) throw new RangeError(`Een dienst moet minimaal ${minimum} minuten duren.`);

  const companions = [];
  const leadingMinutes = Math.round((requested.start.getTime() - current.start.getTime()) / 60_000);
  const trailingMinutes = Math.round((current.end.getTime() - requested.end.getTime()) / 60_000);
  if (leadingMinutes > 0) {
    if (leadingMinutes < minimum) throw new RangeError(`Een open dienst moet minimaal ${minimum} minuten duren.`);
    companions.push(companionRecords({
      shift,
      segment,
      start: current.start,
      end: requested.start,
      origin: base._planning_origin_intent_id,
      side: "leading",
    }));
  }
  if (trailingMinutes > 0) {
    if (trailingMinutes < minimum) throw new RangeError(`Een open dienst moet minimaal ${minimum} minuten duren.`);
    companions.push(companionRecords({
      shift,
      segment,
      start: requested.end,
      end: current.end,
      origin: base._planning_origin_intent_id,
      side: "trailing",
    }));
  }

  const resizedShift = resizedRecord(shift, "shift", requested.start, requested.end, base._planning_origin_intent_id);
  const resizedSegment = resizedRecord(segment, "segment", requested.start, requested.end, base._planning_origin_intent_id);
  const optimisticAssignments = records(assignments)
    .filter(item => shiftIdForAssignment(item) === String(shift.id) && item.status !== "removed")
    .map(item => stampedRecord(item, "assignment", base._planning_origin_intent_id));
  return {
    ...base,
    _planning_target_refs: {
      shift: resizedShift._planning_ref,
      segment: resizedSegment._planning_ref,
      assignments: optimisticAssignments.map(item => item._planning_ref),
    },
    _planning_companion_refs: companions.map(item => ({
      side: item.side,
      shift: item.shiftRef,
      segment: item.segmentRef,
    })),
    shifts: [resizedShift, ...companions.map(item => item.shift)],
    segments: [resizedSegment, ...companions.map(item => item.segment)],
    assignments: optimisticAssignments,
    occurrences: [],
  };
}

export function buildDependentPlanningUnassignIntent({
  key,
  originIntentId = null,
  shift,
  assignment,
} = /** @type {any} */ ({})) {
  if (!shift?.id || !assignment?.id) throw new TypeError("Dienst en medewerkerstoewijzing zijn verplicht.");
  if (shiftIdForAssignment(assignment) !== String(shift.id)) {
    throw new TypeError("De medewerkerstoewijzing hoort niet bij de gekozen dienst.");
  }
  const base = dependencyIntentBase({ key, originIntentId, kind: "dependent_unassign" });
  const optimisticShift = stampedRecord({ ...shift, status: "draft" }, "shift", base._planning_origin_intent_id);
  const removedAssignment = stampedRecord({ ...assignment, status: "removed" }, "assignment", base._planning_origin_intent_id);
  return {
    ...base,
    _planning_target_refs: {
      shift: optimisticShift._planning_ref,
      assignments: [removedAssignment._planning_ref],
    },
    _planning_companion_refs: [],
    shifts: [optimisticShift],
    segments: [],
    assignments: [removedAssignment],
    occurrences: [],
  };
}

export function buildDependentPlanningVacateIntent({
  key,
  originIntentId = null,
  shift,
  assignments = [],
} = /** @type {any} */ ({})) {
  if (!shift?.id) throw new TypeError("Een dienst is verplicht.");
  const base = dependencyIntentBase({ key, originIntentId, kind: "dependent_vacate" });
  const optimisticShift = stampedRecord({ ...shift, status: "draft" }, "shift", base._planning_origin_intent_id);
  const removedAssignments = records(assignments)
    .filter(item => shiftIdForAssignment(item) === String(shift.id) && item.status !== "removed")
    .map(item => stampedRecord({ ...item, status: "removed" }, "assignment", base._planning_origin_intent_id));
  return {
    ...base,
    _planning_target_refs: {
      shift: optimisticShift._planning_ref,
      assignments: removedAssignments.map(item => item._planning_ref),
    },
    _planning_companion_refs: [],
    shifts: [optimisticShift],
    segments: [],
    assignments: removedAssignments,
    occurrences: [],
  };
}

/**
 * Cancels one service locally. When an adjacent survivor is supplied it grows
 * over the deleted interval, preserving service coverage instead of turning
 * the remainder back into an open task.
 */
export function buildDependentPlanningDeleteIntent({
  key,
  originIntentId = null,
  shift,
  segments = [],
  assignments = [],
  survivorShift = null,
  survivorSegment = null,
  absorbedShifts = [],
  absorbedSegments = [],
} = /** @type {any} */ ({})) {
  if (!shift?.id) throw new TypeError("Een te verwijderen dienst is verplicht.");
  if ((survivorShift && !survivorSegment) || (!survivorShift && survivorSegment)) {
    throw new TypeError("Een overblijvende dienst vereist ook het bijbehorende taaksegment.");
  }
  if (survivorShift) assertShiftSegmentLink(survivorShift, survivorSegment);
  const base = dependencyIntentBase({ key, originIntentId, kind: "dependent_delete" });
  const targetSegments = records(segments).filter(item => String(item.shift_id) === String(shift.id));
  const targetAssignments = records(assignments).filter(item => shiftIdForAssignment(item) === String(shift.id));
  const survivorShiftId = survivorShift ? String(survivorShift.id) : null;
  const survivorSegmentId = survivorSegment ? String(survivorSegment.id) : null;
  const cancelledShiftCandidates = uniqueRecordsById([
    ...(!survivorShiftId || String(shift.id) !== survivorShiftId ? [shift] : []),
    ...records(absorbedShifts),
  ]).filter(item => String(item.id) !== survivorShiftId);
  const removedSegmentCandidates = uniqueRecordsById([
    ...(!survivorSegmentId || !targetSegments.some(item => String(item.id) === survivorSegmentId)
      ? targetSegments
      : []),
    ...records(absorbedSegments),
  ]).filter(item => String(item.id) !== survivorSegmentId);
  const removedShifts = cancelledShiftCandidates.map(item => stampedRecord(
    { ...item, status: "cancelled" },
    "shift",
    base._planning_origin_intent_id,
  ));
  const removedSegments = removedSegmentCandidates.map(item => stampedRecord(
    { ...item, status: "removed" },
    "segment",
    base._planning_origin_intent_id,
  ));
  const removedAssignments = targetAssignments.map(item => stampedRecord(
    { ...item, status: "removed" },
    "assignment",
    base._planning_origin_intent_id,
  ));
  let survivorShiftRecord = null;
  let survivorSegmentRecord = null;
  if (survivorShift) {
    const intervalRecords = uniqueRecordsById([
      targetSegments[0] || shift,
      survivorSegment,
      ...records(absorbedSegments),
      ...records(absorbedShifts),
    ]);
    const participantIntervals = intervalRecords.map((item, index) => (
      requiredInterval(item, `Deel ${index + 1} van de samen te voegen dienst`)
    ));
    if (
      targetSegments[0]
      && String(targetSegments[0].task_occurrence_id) !== String(survivorSegment.task_occurrence_id)
    ) {
      throw new TypeError("Alleen diensten binnen dezelfde taak kunnen worden samengevoegd.");
    }
    const start = new Date(Math.min(...participantIntervals.map(item => item.start.getTime())));
    const end = new Date(Math.max(...participantIntervals.map(item => item.end.getTime())));
    survivorShiftRecord = resizedRecord(
      survivorShift,
      "shift",
      start,
      end,
      base._planning_origin_intent_id,
    );
    survivorSegmentRecord = resizedRecord(
      survivorSegment,
      "segment",
      start,
      end,
      base._planning_origin_intent_id,
    );
  }
  return {
    ...base,
    _planning_target_refs: {
      shift: planningRecordReference(shift, "shift"),
      removedShifts: removedShifts.map(item => item._planning_ref),
      segments: removedSegments.map(item => item._planning_ref),
      assignments: removedAssignments.map(item => item._planning_ref),
    },
    _planning_survivor_refs: survivorShiftRecord ? {
      shift: survivorShiftRecord._planning_ref,
      segment: survivorSegmentRecord._planning_ref,
    } : null,
    _planning_companion_refs: [],
    shifts: [...removedShifts, survivorShiftRecord].filter(Boolean),
    segments: [...removedSegments, survivorSegmentRecord].filter(Boolean),
    assignments: removedAssignments,
    occurrences: [],
  };
}

/**
 * Repoints later optimistic overlays from temporary ids to the records created
 * by a completed server mutation. Times from the later intent intentionally win,
 * while authoritative ids and revisions replace their temporary predecessors.
 */
function sameIdentityValue(left, right) {
  const normalizedLeft = text(left);
  const normalizedRight = text(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

function timingFingerprint(record, kind) {
  if (kind === "shift") {
    return [
      record?.service_date,
      record?.end_date || record?.service_date,
      record?.start_time,
      record?.end_time,
    ].map(value => String(value || "")).join("|");
  }
  if (kind === "segment") {
    return [
      record?.start_date,
      record?.end_date || record?.start_date,
      record?.start_time,
      record?.end_time,
    ].map(value => String(value || "")).join("|");
  }
  return "";
}

function mappedRecord(mapping, record, kind) {
  if (!record) return null;
  const keys = [
    text(record.id) && `id:${record.id}`,
    explicitPlanningReference(record) && `ref:${explicitPlanningReference(record)}`,
    text(record.source_key) && `source:${record.source_key}`,
    planningRecordReference(record, kind) && `computed:${planningRecordReference(record, kind)}`,
  ].filter(Boolean);
  return keys.map(key => mapping.get(key)).find(Boolean) || null;
}

function addRecordMapping(mapping, committed, saved, kind) {
  const keys = [
    text(committed?.id) && `id:${committed.id}`,
    explicitPlanningReference(committed) && `ref:${explicitPlanningReference(committed)}`,
    text(committed?.source_key) && `source:${committed.source_key}`,
    planningRecordReference(committed, kind) && `computed:${planningRecordReference(committed, kind)}`,
  ].filter(Boolean);
  keys.forEach(key => mapping.set(key, saved));
}

function recordMatchScore(
  kind,
  committed,
  saved,
  { shiftIds = null, occurrenceIds = null } = {},
) {
  if (!committed || !saved) return -1;
  if (sameIdentityValue(committed.id, saved.id)) return 100_000;
  const committedRef = explicitPlanningReference(committed);
  const savedRef = explicitPlanningReference(saved);
  if (committedRef && savedRef && committedRef === savedRef) return 90_000;
  if (sameIdentityValue(committed.source_key, saved.source_key)) return 80_000;
  let score = 0;
  if (kind === "shift") {
    if (timingFingerprint(committed, kind) === timingFingerprint(saved, kind)) score += 4_000;
    if (sameIdentityValue(committed.source_type, saved.source_type)) score += 300;
    if (sameIdentityValue(committed.source_id, saved.source_id)) score += 700;
    if (Number(committed.required_count || 1) === Number(saved.required_count || 1)) score += 50;
  } else if (kind === "segment") {
    const savedOccurrence = mappedRecord(occurrenceIds || new Map(), {
      id: committed.task_occurrence_id,
    }, "occurrence");
    if (
      sameIdentityValue(committed.task_occurrence_id, saved.task_occurrence_id)
      || sameIdentityValue(savedOccurrence?.id, saved.task_occurrence_id)
    ) score += 2_000;
    const savedShift = mappedRecord(shiftIds || new Map(), { id: committed.shift_id }, "shift");
    if (
      sameIdentityValue(committed.shift_id, saved.shift_id)
      || sameIdentityValue(savedShift?.id, saved.shift_id)
    ) score += 1_000;
    if (timingFingerprint(committed, kind) === timingFingerprint(saved, kind)) score += 4_000;
  } else if (kind === "assignment") {
    const committedShiftId = shiftIdForAssignment(committed);
    const savedShift = mappedRecord(shiftIds || new Map(), { id: committedShiftId }, "shift");
    if (
      sameIdentityValue(committedShiftId, shiftIdForAssignment(saved))
      || sameIdentityValue(savedShift?.id, shiftIdForAssignment(saved))
    ) score += 1_000;
    if (sameIdentityValue(committed.personnel_id, saved.personnel_id)) score += 4_000;
    if (Number(committed.slot_index || 0) === Number(saved.slot_index || 0)) score += 500;
  } else if (kind === "occurrence") {
    if (sameIdentityValue(committed.logical_source_key, saved.logical_source_key)) score += 3_000;
    if (sameIdentityValue(committed.object_task_definition_id, saved.object_task_definition_id)) score += 1_000;
    if (sameIdentityValue(committed.object_id, saved.object_id)) score += 300;
    if (sameIdentityValue(committed.service_date, saved.service_date)) score += 2_000;
    if (sameIdentityValue(committed.window_start_time, saved.window_start_time)) score += 300;
    if (sameIdentityValue(committed.window_end_time, saved.window_end_time)) score += 300;
  }
  return score;
}

function buildRecordRebaseMap(kind, committedRecords, savedRecords, context = {}) {
  const mapping = new Map();
  const used = new Set();
  records(committedRecords).forEach((committed, committedIndex) => {
    let match = null;
    let matchIndex = -1;
    let bestScore = 0;
    records(savedRecords).forEach((saved, savedIndex) => {
      if (used.has(savedIndex)) return;
      const score = recordMatchScore(kind, committed, saved, context);
      if (score > bestScore) {
        match = saved;
        matchIndex = savedIndex;
        bestScore = score;
      }
    });
    if (!match) {
      const remainingSaved = records(savedRecords)
        .map((saved, index) => ({ saved, index }))
        .filter(item => !used.has(item.index));
      const remainingCommittedCount = records(committedRecords).length - committedIndex;
      if (remainingSaved.length === remainingCommittedCount) {
        match = remainingSaved[0].saved;
        matchIndex = remainingSaved[0].index;
      }
    }
    if (!match) return;
    used.add(matchIndex);
    addRecordMapping(mapping, committed, match, kind);
  });
  return mapping;
}

function authoritativeIdentity(record, saved) {
  if (!saved) return record;
  return {
    ...record,
    id: saved.id,
    revision: saved.revision ?? record.revision,
    ...(saved.source_key != null ? { source_key: saved.source_key } : {}),
    ...(saved.logical_source_key != null ? { logical_source_key: saved.logical_source_key } : {}),
  };
}

function mappedId(mapping, id, kind) {
  if (id == null) return id;
  return mappedRecord(mapping, { id }, kind)?.id || id;
}

export function rebaseDependentPlanningIntent(intent, committedIntent, result) {
  if (!intent || !committedIntent || !result) return intent;
  const committedShifts = records(committedIntent.shifts);
  const committedSegments = records(committedIntent.segments);
  const committedAssignments = records(committedIntent.assignments);
  const committedOccurrences = records(committedIntent.occurrences);
  const savedShifts = resultRecords(result, "shifts", "shift");
  const savedSegments = resultRecords(result, "segments", "segment");
  const savedAssignments = resultRecords(result, "assignments", "assignment");
  const savedOccurrences = resultOccurrenceRecords(result);
  const occurrenceIds = buildRecordRebaseMap("occurrence", committedOccurrences, savedOccurrences);
  const shiftIds = buildRecordRebaseMap("shift", committedShifts, savedShifts, { occurrenceIds });
  const segmentIds = buildRecordRebaseMap("segment", committedSegments, savedSegments, {
    shiftIds,
    occurrenceIds,
  });
  const assignmentIds = buildRecordRebaseMap("assignment", committedAssignments, savedAssignments, { shiftIds });
  if (shiftIds.size + segmentIds.size + assignmentIds.size + occurrenceIds.size === 0) return intent;

  let changed = false;
  const shifts = records(intent.shifts).map(record => {
    const saved = mappedRecord(shiftIds, record, "shift");
    if (!saved) return record;
    changed = true;
    return authoritativeIdentity(record, saved);
  });
  const segments = records(intent.segments).map(record => {
    const saved = mappedRecord(segmentIds, record, "segment");
    const savedShiftId = mappedId(shiftIds, record.shift_id, "shift");
    const savedOccurrenceId = mappedId(occurrenceIds, record.task_occurrence_id, "occurrence");
    if (!saved && savedShiftId === record.shift_id && savedOccurrenceId === record.task_occurrence_id) return record;
    changed = true;
    return {
      ...authoritativeIdentity(record, saved),
      shift_id: savedShiftId || saved?.shift_id || record.shift_id,
      task_occurrence_id: savedOccurrenceId || saved?.task_occurrence_id || record.task_occurrence_id,
    };
  });
  const assignments = records(intent.assignments).map(record => {
    const saved = mappedRecord(assignmentIds, record, "assignment");
    const savedShiftId = mappedId(shiftIds, shiftIdForAssignment(record), "shift");
    if (!saved && savedShiftId === shiftIdForAssignment(record)) return record;
    changed = true;
    const nextShiftId = savedShiftId
      || saved?.planning_shift_id
      || saved?.shift_id
      || shiftIdForAssignment(record);
    return {
      ...authoritativeIdentity(record, saved),
      planning_shift_id: nextShiftId,
      shift_id: nextShiftId,
    };
  });
  const occurrences = records(intent.occurrences).map(record => {
    const saved = mappedRecord(occurrenceIds, record, "occurrence");
    if (!saved) return record;
    changed = true;
    return authoritativeIdentity(record, saved);
  });
  const rebasedTopLevel = {
    ...(intent.shift_id != null ? { shift_id: mappedId(shiftIds, intent.shift_id, "shift") } : {}),
    ...(intent.left_shift_id != null
      ? { left_shift_id: mappedId(shiftIds, intent.left_shift_id, "shift") }
      : {}),
    ...(intent.right_shift_id != null
      ? { right_shift_id: mappedId(shiftIds, intent.right_shift_id, "shift") }
      : {}),
    ...(intent.segment_id != null ? { segment_id: mappedId(segmentIds, intent.segment_id, "segment") } : {}),
    ...(intent.left_segment_id != null
      ? { left_segment_id: mappedId(segmentIds, intent.left_segment_id, "segment") }
      : {}),
    ...(intent.right_segment_id != null
      ? { right_segment_id: mappedId(segmentIds, intent.right_segment_id, "segment") }
      : {}),
    ...(intent.assignment_id != null
      ? { assignment_id: mappedId(assignmentIds, intent.assignment_id, "assignment") }
      : {}),
    ...(intent.task_occurrence_id != null
      ? { task_occurrence_id: mappedId(occurrenceIds, intent.task_occurrence_id, "occurrence") }
      : {}),
  };
  if (Object.entries(rebasedTopLevel).some(([key, value]) => value !== intent[key])) changed = true;
  return changed ? {
    ...intent,
    ...rebasedTopLevel,
    shifts,
    segments,
    assignments,
    occurrences,
  } : intent;
}

export const planningEffectivePlanInternals = {
  activeIntents,
  activeAssignmentsForShift,
  findOptimisticSamePersonnelAdjacentShiftMerge,
  markRemovedById,
  overlayById,
  preferredTimelineBounds,
  rangeQueryRecords,
  records,
  resultOccurrenceRecords,
  resultRecords,
  shiftIdForAssignment,
  timelineBoundary,
};
