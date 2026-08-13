import { getShiftInterval } from "@/components/planning/planningDomain";
import { MAX_AUTOMATIC_TASK_SERVICE_MINUTES } from "@/components/planning/planningTimelineDomain";

function active(record, removedStatus) {
  return record && record.status !== removedStatus && record._optimistic_pending !== true;
}

function shiftIdForAssignment(assignment) {
  return String(assignment?.shift_id || assignment?.planning_shift_id || "");
}

function intervalForSegment(segment) {
  return getShiftInterval({
    service_date: segment?.start_date || segment?.service_date,
    end_date: segment?.end_date || segment?.start_date || segment?.service_date,
    start_time: segment?.start_time,
    end_time: segment?.end_time,
    overnight: true,
  });
}

function sameInterval(left, right) {
  return left.valid
    && right.valid
    && left.start.getTime() === right.start.getTime()
    && left.end.getTime() === right.end.getTime();
}

function boundary(segment, edge) {
  if (edge === "start") {
    return {
      date: segment.start_date || segment.service_date,
      time: segment.start_time,
    };
  }
  return {
    date: segment.end_date || segment.start_date || segment.service_date,
    time: segment.end_time,
  };
}

/**
 * Finds the one existing task shift that can safely absorb a proposed adjacent
 * task slice for the same employee. This helper is deliberately conservative:
 * it never guesses when both sides are candidates or when another active slice
 * overlaps the proposal.
 *
 * Contract:
 * - `proposedSegment` is an unsaved slice for `occurrenceId`;
 * - the candidate must be an active, non-optimistic task shift with exactly one
 *   active segment, one active assignment and `required_count === 1`;
 * - that assignment belongs to `personnelId`, the segment belongs to the same
 *   occurrence, and the shift envelope equals its segment envelope;
 * - exactly one candidate boundary must touch the proposal (half-open ranges);
 * - the returned `mergedSegment` is the chronological union, plus the exact
 *   record identities/revisions a backend mutation must fence.
 */
export function findSamePersonnelAdjacentShiftMerge({
  occurrenceId,
  personnelId,
  proposedSegment,
  shifts = [],
  segments = [],
  assignments = [],
  maximumDurationMinutes = MAX_AUTOMATIC_TASK_SERVICE_MINUTES,
} = {}) {
  const normalizedOccurrenceId = String(occurrenceId || proposedSegment?.task_occurrence_id || "");
  const normalizedPersonnelId = String(personnelId || "");
  const proposedOccurrenceId = String(proposedSegment?.task_occurrence_id || "");
  const proposedInterval = intervalForSegment(proposedSegment);

  if (
    !normalizedOccurrenceId
    || !normalizedPersonnelId
    || proposedOccurrenceId !== normalizedOccurrenceId
    || !proposedInterval.valid
  ) {
    return { status: "invalid", reason: "invalid_proposal", candidate: null };
  }

  const activeShifts = shifts.filter(shift => active(shift, "cancelled"));
  const activeShiftById = new Map(activeShifts.map(shift => [String(shift.id), shift]));
  const activeSegments = segments.filter(segment => (
    active(segment, "removed") && activeShiftById.has(String(segment.shift_id))
  ));
  const activeAssignments = assignments.filter(assignment => (
    active(assignment, "removed") && activeShiftById.has(shiftIdForAssignment(assignment))
  ));

  const occurrenceSegments = activeSegments.filter(segment => (
    String(segment.task_occurrence_id) === normalizedOccurrenceId
  ));
  const overlapping = occurrenceSegments.filter(segment => {
    const interval = intervalForSegment(segment);
    return interval.valid
      && proposedInterval.start < interval.end
      && proposedInterval.end > interval.start;
  });
  if (overlapping.length > 0) {
    return {
      status: "blocked",
      reason: "proposal_overlaps_existing_coverage",
      candidate: null,
      conflictingSegmentIds: overlapping.map(segment => String(segment.id)),
    };
  }

  const segmentsByShift = new Map();
  activeSegments.forEach(segment => {
    const key = String(segment.shift_id);
    segmentsByShift.set(key, [...(segmentsByShift.get(key) || []), segment]);
  });
  const assignmentsByShift = new Map();
  activeAssignments.forEach(assignment => {
    const key = shiftIdForAssignment(assignment);
    assignmentsByShift.set(key, [...(assignmentsByShift.get(key) || []), assignment]);
  });

  const candidates = activeShifts.flatMap(shift => {
    const shiftId = String(shift.id || "");
    const shiftSegments = segmentsByShift.get(shiftId) || [];
    const shiftAssignments = assignmentsByShift.get(shiftId) || [];
    if (
      !shiftId
      || shift.source_type !== "task"
      || Number(shift.required_count || 1) !== 1
      || shiftSegments.length !== 1
      || shiftAssignments.length !== 1
    ) return [];

    const segment = shiftSegments[0];
    const assignment = shiftAssignments[0];
    if (
      String(segment.task_occurrence_id) !== normalizedOccurrenceId
      || String(assignment.personnel_id) !== normalizedPersonnelId
    ) return [];

    const segmentInterval = intervalForSegment(segment);
    const shiftInterval = getShiftInterval(shift);
    if (!sameInterval(segmentInterval, shiftInterval)) return [];

    const direction = segmentInterval.end.getTime() === proposedInterval.start.getTime()
      ? "append"
      : proposedInterval.end.getTime() === segmentInterval.start.getTime()
        ? "prepend"
        : null;
    if (!direction) return [];

    const first = direction === "append" ? segment : proposedSegment;
    const last = direction === "append" ? proposedSegment : segment;
    return [{
      shift,
      segment,
      assignment,
      direction,
      mergedSegment: {
        task_occurrence_id: normalizedOccurrenceId,
        start_date: boundary(first, "start").date,
        end_date: boundary(last, "end").date,
        start_time: boundary(first, "start").time,
        end_time: boundary(last, "end").time,
      },
      durationMinutes: Math.round(
        (Math.max(segmentInterval.end.getTime(), proposedInterval.end.getTime())
          - Math.min(segmentInterval.start.getTime(), proposedInterval.start.getTime())) / 60_000,
      ),
      expectedRevisions: {
        shift: Number(shift.revision || 1),
        segment: Number(segment.revision || 1),
        assignment: Number(assignment.revision || 1),
      },
    }];
  });

  if (candidates.length === 0) {
    return { status: "none", reason: "no_unique_eligible_adjacent_shift", candidate: null };
  }
  if (candidates.length > 1) {
    return {
      status: "ambiguous",
      reason: "multiple_eligible_adjacent_shifts",
      candidate: null,
      candidateShiftIds: candidates.map(item => String(item.shift.id)).sort(),
    };
  }
  if (candidates[0].durationMinutes > Math.max(5, Number(maximumDurationMinutes) || 0)) {
    return {
      status: "blocked",
      reason: "merged_shift_exceeds_automatic_limit",
      candidate: null,
      candidateShiftId: String(candidates[0].shift.id),
      durationMinutes: candidates[0].durationMinutes,
      maximumDurationMinutes: Math.max(5, Number(maximumDurationMinutes) || 0),
    };
  }
  return { status: "merge", reason: null, candidate: candidates[0] };
}

export const planningAdjacentShiftMergeInternals = {
  intervalForSegment,
  sameInterval,
  shiftIdForAssignment,
};
