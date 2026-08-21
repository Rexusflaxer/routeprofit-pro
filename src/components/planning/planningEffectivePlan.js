import { findSamePersonnelAdjacentShiftMerge } from "@/components/planning/planningAdjacentShiftMerge";
import { addDays, planningShiftOwnedByRange, toDateKey } from "@/components/planning/planningDomain";
import {
  buildTimelineResizeCompositionPayload,
  clockToTimelineMinutes,
  getTaskTimelineGaps,
  MAX_AUTOMATIC_TASK_SERVICE_MINUTES,
  timelineMinutesToClock,
} from "@/components/planning/planningTimelineDomain";

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
export function buildEffectivePlanningPlan({ shifts = [], assignments = [], segments = [], intents = [] } = {}) {
  const pending = activeIntents(intents);
  return {
    shifts: overlayById(shifts, pending.flatMap(intent => records(intent.shifts))),
    assignments: overlayById(assignments, pending.flatMap(intent => records(intent.assignments))),
    segments: overlayById(segments, pending.flatMap(intent => records(intent.segments))),
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
  const incomingOccurrences = resultRecords(result, "task_occurrences", "task_occurrence");
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

/**
 * Repoints later optimistic overlays from temporary ids to the records created
 * by a completed server mutation. Times from the later intent intentionally win,
 * while authoritative ids and revisions replace their temporary predecessors.
 */
export function rebaseDependentPlanningIntent(intent, committedIntent, result) {
  if (!intent || !committedIntent || !result) return intent;
  const committedShifts = records(committedIntent.shifts);
  const committedSegments = records(committedIntent.segments);
  const committedAssignments = records(committedIntent.assignments);
  const savedShifts = resultRecords(result, "shifts", "shift");
  const savedSegments = resultRecords(result, "segments", "segment");
  const savedAssignments = resultRecords(result, "assignments", "assignment");
  const shiftIds = new Map();
  const segmentIds = new Map();
  const assignmentIds = new Map();

  committedShifts.forEach((record, index) => {
    const saved = savedShifts[index] || savedShifts.find(item => (
      String(item.source_id || "") === String(record.source_id || "")
    ));
    if (saved) shiftIds.set(String(record.id), saved);
  });
  committedSegments.forEach((record, index) => {
    const saved = savedSegments.find(item => (
      String(item.task_occurrence_id || "") === String(record.task_occurrence_id || "")
    )) || savedSegments[index];
    if (saved) segmentIds.set(String(record.id), saved);
  });
  committedAssignments.forEach((record, index) => {
    const saved = savedAssignments.find(item => (
      String(item.personnel_id || "") === String(record.personnel_id || "")
      && Number(item.slot_index || 0) === Number(record.slot_index || 0)
    )) || savedAssignments[index];
    if (saved) assignmentIds.set(String(record.id), saved);
  });
  if (shiftIds.size + segmentIds.size + assignmentIds.size === 0) return intent;

  let changed = false;
  const shifts = records(intent.shifts).map(record => {
    const saved = shiftIds.get(String(record.id));
    if (!saved) return record;
    changed = true;
    return { ...record, id: saved.id, revision: saved.revision ?? record.revision };
  });
  const segments = records(intent.segments).map(record => {
    const saved = segmentIds.get(String(record.id));
    const savedShift = shiftIds.get(String(record.shift_id));
    if (!saved && !savedShift) return record;
    changed = true;
    return {
      ...record,
      id: saved?.id || record.id,
      shift_id: savedShift?.id || saved?.shift_id || record.shift_id,
      revision: saved?.revision ?? record.revision,
    };
  });
  const assignments = records(intent.assignments).map(record => {
    const saved = assignmentIds.get(String(record.id));
    const savedShift = shiftIds.get(shiftIdForAssignment(record));
    if (!saved && !savedShift) return record;
    changed = true;
    const nextShiftId = savedShift?.id || saved?.planning_shift_id || saved?.shift_id || shiftIdForAssignment(record);
    return {
      ...record,
      id: saved?.id || record.id,
      planning_shift_id: nextShiftId,
      shift_id: nextShiftId,
      revision: saved?.revision ?? record.revision,
    };
  });
  return changed ? { ...intent, shifts, segments, assignments } : intent;
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
  resultRecords,
  shiftIdForAssignment,
  timelineBoundary,
};
