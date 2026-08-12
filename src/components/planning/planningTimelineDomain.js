import {
  addDays,
  getShiftInterval,
  getTaskOccurrenceCoverage,
  parseDateKey,
  toDateKey,
} from "@/components/planning/planningDomain";

export const TIMELINE_DAY_MINUTES = 24 * 60;
export const DEFAULT_TIMELINE_SNAP_MINUTES = 5;
export const DEFAULT_SUGGESTED_ALLOCATION_MINUTES = 8 * 60;

const CLOCK_PATTERN = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function intervalMinutes(start, end) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function segmentIntervalRecord(segment) {
  return {
    service_date: segment.start_date || segment.service_date,
    end_date: segment.end_date || segment.start_date || segment.service_date,
    start_time: segment.start_time,
    end_time: segment.end_time,
    overnight: true,
  };
}

function occurrenceIntervalRecord(occurrence) {
  return {
    service_date: occurrence?.service_date,
    end_date: occurrence?.end_date || occurrence?.service_date,
    start_time: occurrence?.window_start_time,
    end_time: occurrence?.window_end_time,
    overnight: true,
  };
}

function isActiveShift(shift) {
  return shift?.status !== "cancelled";
}

function activeOccurrenceSegments(occurrence, segments = [], shifts = null) {
  const activeShiftIds = Array.isArray(shifts)
    ? new Set(shifts.filter(isActiveShift).map(shift => String(shift.id)))
    : null;
  return segments.filter(segment => (
    segment?.status !== "removed"
    && String(segment?.task_occurrence_id) === String(occurrence?.id)
    && (!activeShiftIds || activeShiftIds.has(String(segment?.shift_id)))
  ));
}

function mergeMinuteIntervals(intervals) {
  const ordered = intervals
    .map(interval => ({
      startMinute: Math.max(0, Math.min(TIMELINE_DAY_MINUTES, Number(interval.startMinute))),
      endMinute: Math.max(0, Math.min(TIMELINE_DAY_MINUTES, Number(interval.endMinute))),
    }))
    .filter(interval => Number.isFinite(interval.startMinute)
      && Number.isFinite(interval.endMinute)
      && interval.endMinute > interval.startMinute)
    .sort((left, right) => left.startMinute - right.startMinute || left.endMinute - right.endMinute);
  const merged = [];
  ordered.forEach(interval => {
    const previous = merged.at(-1);
    if (!previous || interval.startMinute > previous.endMinute) merged.push({ ...interval });
    else previous.endMinute = Math.max(previous.endMinute, interval.endMinute);
  });
  return merged;
}

function subtractMinuteIntervals(startMinute, endMinute, usedIntervals) {
  const gaps = [];
  let cursor = startMinute;
  mergeMinuteIntervals(usedIntervals).forEach(interval => {
    if (interval.endMinute <= cursor || interval.startMinute >= endMinute) return;
    if (interval.startMinute > cursor) {
      gaps.push({ startMinute: cursor, endMinute: Math.min(interval.startMinute, endMinute) });
    }
    cursor = Math.max(cursor, interval.endMinute);
  });
  if (cursor < endMinute) gaps.push({ startMinute: cursor, endMinute });
  return gaps.filter(gap => gap.endMinute > gap.startMinute);
}

function timelineBoundaryToSegment(dayKey, minute) {
  if (minute === TIMELINE_DAY_MINUTES) {
    return {
      date: toDateKey(addDays(dayKey, 1)),
      time: "00:00",
    };
  }
  return {
    date: toDateKey(dayKey),
    time: timelineMinutesToClock(minute),
  };
}

/**
 * Convert a local wall-clock value to its 00:00-24:00 timeline minute.
 * `24:00` is intentionally valid and maps to 1440; no other 24:xx value is.
 */
export function clockToTimelineMinutes(value) {
  const match = String(value || "").trim().match(CLOCK_PATTERN);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] || 0);
  if (
    hours < 0
    || hours > 24
    || minutes < 0
    || minutes > 59
    || seconds < 0
    || seconds > 59
    || (hours === 24 && (minutes !== 0 || seconds !== 0))
  ) return null;
  return hours * 60 + minutes + (seconds >= 30 ? 1 : 0);
}

/** Convert an integer timeline minute back to HH:mm, including 1440 -> 24:00. */
export function timelineMinutesToClock(value) {
  const minute = finiteNumber(value);
  if (minute === null || !Number.isInteger(minute) || minute < 0 || minute > TIMELINE_DAY_MINUTES) return null;
  if (minute === TIMELINE_DAY_MINUTES) return "24:00";
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

/**
 * Project any shift-like record onto one local calendar day. Geometry uses
 * wall-clock minutes while `elapsedMinutes` retains DST-aware elapsed time.
 */
export function getTimelineDayProjection(record, serviceDate) {
  const dayStart = parseDateKey(serviceDate);
  const interval = getShiftInterval(record);
  if (!dayStart || !interval.valid) return null;
  dayStart.setHours(0, 0, 0, 0);
  const nextDay = addDays(dayStart, 1);
  nextDay.setHours(0, 0, 0, 0);
  const start = new Date(Math.max(interval.start.getTime(), dayStart.getTime()));
  const end = new Date(Math.min(interval.end.getTime(), nextDay.getTime()));
  if (end <= start) return null;
  const startMinute = interval.start <= dayStart
    ? 0
    : start.getHours() * 60 + start.getMinutes();
  const endMinute = interval.end >= nextDay
    ? TIMELINE_DAY_MINUTES
    : end.getHours() * 60 + end.getMinutes();
  return {
    date: toDateKey(dayStart),
    startMinute,
    endMinute,
    startTime: timelineMinutesToClock(startMinute),
    endTime: timelineMinutesToClock(endMinute),
    visualDurationMinutes: Math.max(0, endMinute - startMinute),
    elapsedMinutes: intervalMinutes(start, end),
    continuesBefore: interval.start < dayStart,
    continuesAfter: interval.end > nextDay,
  };
}

/**
 * Translate a PlanningTaskOccurrence into an explicit visual demand model.
 * Continuous demand must cover the complete window; time-window demand needs
 * only `required_minutes` somewhere inside the allowed window.
 */
export function getTaskTimelineDemand(occurrence, serviceDate) {
  const projection = getTimelineDayProjection(occurrenceIntervalRecord(occurrence), serviceDate);
  if (!projection) return null;
  const executionMode = occurrence?.execution_mode === "time_window" ? "time_window" : "continuous";
  const totalRequiredMinutes = Math.max(0, Number(occurrence?.required_minutes || 0));
  return {
    occurrenceId: occurrence?.id == null ? null : String(occurrence.id),
    date: projection.date,
    executionMode,
    coverageMode: executionMode === "continuous" ? "full_window" : "duration_within_window",
    mustCoverFullWindow: executionMode === "continuous",
    isFlexible: executionMode === "time_window",
    startMinute: projection.startMinute,
    endMinute: projection.endMinute,
    startTime: projection.startTime,
    endTime: projection.endTime,
    windowMinutes: projection.visualDurationMinutes,
    totalRequiredMinutes,
    sliceRequiredMinutes: executionMode === "continuous"
      ? projection.visualDurationMinutes
      : Math.min(totalRequiredMinutes, projection.elapsedMinutes),
    continuesBefore: projection.continuesBefore,
    continuesAfter: projection.continuesAfter,
  };
}

/**
 * Return actionable, uncovered ranges for a task on one day. Cancelled shifts
 * and removed segments never consume demand. For flexible time-window tasks,
 * gaps disappear as soon as the required duration has been allocated even if
 * part of the allowed visual window remains empty.
 */
export function getTaskTimelineGaps({ occurrence, serviceDate, segments = [], shifts = null } = {}) {
  const demand = getTaskTimelineDemand(occurrence, serviceDate);
  if (!demand) return [];
  const relevantSegments = activeOccurrenceSegments(occurrence, segments, shifts);
  const usedOnDay = relevantSegments
    .map(segment => getTimelineDayProjection(segmentIntervalRecord(segment), serviceDate))
    .filter(Boolean)
    .map(projection => ({
      startMinute: Math.max(demand.startMinute, projection.startMinute),
      endMinute: Math.min(demand.endMinute, projection.endMinute),
    }))
    .filter(interval => interval.endMinute > interval.startMinute);
  const uncovered = subtractMinuteIntervals(demand.startMinute, demand.endMinute, usedOnDay);
  const coverage = getTaskOccurrenceCoverage(occurrence, relevantSegments);
  let flexibleMinutesLeft = Math.max(0, coverage.remainingMinutes);

  return uncovered.flatMap((gap, index) => {
    const durationMinutes = gap.endMinute - gap.startMinute;
    const allocatableMinutes = demand.mustCoverFullWindow
      ? durationMinutes
      : Math.min(durationMinutes, flexibleMinutesLeft);
    if (allocatableMinutes <= 0) return [];
    if (!demand.mustCoverFullWindow) flexibleMinutesLeft -= allocatableMinutes;
    return [{
      id: `${demand.occurrenceId || "occurrence"}:${demand.date}:${gap.startMinute}-${gap.endMinute}`,
      index,
      occurrenceId: demand.occurrenceId,
      date: demand.date,
      startMinute: gap.startMinute,
      endMinute: gap.endMinute,
      startTime: timelineMinutesToClock(gap.startMinute),
      endTime: timelineMinutesToClock(gap.endMinute),
      durationMinutes,
      allocatableMinutes,
      executionMode: demand.executionMode,
    }];
  });
}

/**
 * Suggest the next service segment. Long continuous gaps default to eight
 * hours, while a shorter gap or flexible required duration is kept exact.
 */
export function getSuggestedTaskTimelineAllocation({
  occurrence,
  serviceDate,
  segments = [],
  shifts = null,
  preferredMinutes = DEFAULT_SUGGESTED_ALLOCATION_MINUTES,
} = {}) {
  const preferred = Math.max(
    DEFAULT_TIMELINE_SNAP_MINUTES,
    Math.trunc(finiteNumber(preferredMinutes) || DEFAULT_SUGGESTED_ALLOCATION_MINUTES),
  );
  const gap = getTaskTimelineGaps({ occurrence, serviceDate, segments, shifts })[0];
  if (!gap) return null;
  const durationMinutes = Math.min(preferred, gap.allocatableMinutes);
  const endMinute = gap.startMinute + durationMinutes;
  const startBoundary = timelineBoundaryToSegment(gap.date, gap.startMinute);
  const endBoundary = timelineBoundaryToSegment(gap.date, endMinute);
  return {
    ...gap,
    endMinute,
    endTime: timelineMinutesToClock(endMinute),
    durationMinutes,
    segment: {
      task_occurrence_id: occurrence.id,
      start_date: startBoundary.date,
      end_date: endBoundary.date,
      start_time: startBoundary.time,
      end_time: endBoundary.time,
    },
  };
}

/** Snap and clamp one wall-clock minute; useful for pointer and keyboard input. */
export function snapTimelineMinute(value, {
  stepMinutes = DEFAULT_TIMELINE_SNAP_MINUTES,
  minMinute = 0,
  maxMinute = TIMELINE_DAY_MINUTES,
  mode = "nearest",
} = {}) {
  const minute = finiteNumber(value);
  const step = Math.max(1, Math.trunc(finiteNumber(stepMinutes) || DEFAULT_TIMELINE_SNAP_MINUTES));
  const minimum = Math.max(0, Math.min(TIMELINE_DAY_MINUTES, finiteNumber(minMinute) ?? 0));
  const maximum = Math.max(minimum, Math.min(TIMELINE_DAY_MINUTES, finiteNumber(maxMinute) ?? TIMELINE_DAY_MINUTES));
  if (minute === null) return null;
  const quotient = minute / step;
  const snapped = mode === "floor"
    ? Math.floor(quotient) * step
    : mode === "ceil"
      ? Math.ceil(quotient) * step
      : Math.round(quotient) * step;
  return Math.max(minimum, Math.min(maximum, snapped));
}

/**
 * Resize one edge of a same-day timeline interval. The proposal is snapped,
 * clamped to task bounds and never shorter than `minimumDurationMinutes`.
 */
export function resizeTimelineInterval({
  startMinute,
  endMinute,
  edge,
  pointerMinute,
  minMinute = 0,
  maxMinute = TIMELINE_DAY_MINUTES,
  snapMinutes = DEFAULT_TIMELINE_SNAP_MINUTES,
  minimumDurationMinutes = DEFAULT_TIMELINE_SNAP_MINUTES,
} = {}) {
  const start = finiteNumber(startMinute);
  const end = finiteNumber(endMinute);
  const minimumDuration = Math.max(1, Math.trunc(finiteNumber(minimumDurationMinutes) || DEFAULT_TIMELINE_SNAP_MINUTES));
  if (start === null || end === null || end <= start || !["start", "end"].includes(edge)) return null;
  const lowerBound = Math.max(0, finiteNumber(minMinute) ?? 0);
  const upperBound = Math.min(TIMELINE_DAY_MINUTES, finiteNumber(maxMinute) ?? TIMELINE_DAY_MINUTES);
  if (upperBound <= lowerBound) return null;
  const next = edge === "start"
    ? {
        startMinute: snapTimelineMinute(pointerMinute, {
          stepMinutes: snapMinutes,
          minMinute: lowerBound,
          maxMinute: Math.min(upperBound, end - minimumDuration),
        }),
        endMinute: end,
      }
    : {
        startMinute: start,
        endMinute: snapTimelineMinute(pointerMinute, {
          stepMinutes: snapMinutes,
          minMinute: Math.max(lowerBound, start + minimumDuration),
          maxMinute: upperBound,
        }),
      };
  if (next.startMinute === null || next.endMinute === null || next.endMinute <= next.startMinute) return null;
  return {
    ...next,
    startTime: timelineMinutesToClock(next.startMinute),
    endTime: timelineMinutesToClock(next.endMinute),
    durationMinutes: next.endMinute - next.startMinute,
  };
}

function visualInterval(item, minimumVisualDurationMinutes) {
  const startMinute = Math.max(0, Math.min(TIMELINE_DAY_MINUTES, Number(item.startMinute)));
  const endMinute = Math.max(0, Math.min(TIMELINE_DAY_MINUTES, Number(item.endMinute)));
  if (!Number.isFinite(startMinute) || !Number.isFinite(endMinute) || endMinute <= startMinute) return null;
  const minimum = Math.max(1, Math.trunc(finiteNumber(minimumVisualDurationMinutes) || 1));
  let visualStartMinute = startMinute;
  let visualEndMinute = Math.min(TIMELINE_DAY_MINUTES, Math.max(endMinute, startMinute + minimum));
  if (visualEndMinute - visualStartMinute < minimum) {
    visualStartMinute = Math.max(0, visualEndMinute - minimum);
  }
  return {
    ...item,
    startMinute,
    endMinute,
    visualStartMinute,
    visualEndMinute,
  };
}

/**
 * Allocate overlapping timeline blocks to deterministic horizontal lanes.
 * Collision uses the minimum visual height, so tiny rounds remain clickable
 * without visually covering another item in the same lane.
 */
export function layoutTimelineIntervalLanes(intervals = [], { minimumVisualDurationMinutes = 0 } = {}) {
  const ordered = intervals
    .map(item => visualInterval(item, minimumVisualDurationMinutes))
    .filter(Boolean)
    .sort((left, right) => (
      left.visualStartMinute - right.visualStartMinute
      || left.visualEndMinute - right.visualEndMinute
      || String(left.id || "").localeCompare(String(right.id || ""))
    ));
  const groups = [];
  ordered.forEach(item => {
    const current = groups.at(-1);
    if (!current || item.visualStartMinute >= current.visualEndMinute) {
      groups.push({ visualEndMinute: item.visualEndMinute, items: [item] });
      return;
    }
    current.items.push(item);
    current.visualEndMinute = Math.max(current.visualEndMinute, item.visualEndMinute);
  });

  return groups.flatMap((group, groupIndex) => {
    const laneEnds = [];
    const placed = group.items.map(item => {
      let lane = laneEnds.findIndex(endMinute => endMinute <= item.visualStartMinute);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = item.visualEndMinute;
      return { ...item, lane };
    });
    const laneCount = Math.max(1, laneEnds.length);
    return placed.map(item => ({ ...item, laneCount, groupIndex }));
  });
}

function normalizePayloadBoundary(dateValue, timeValue) {
  const date = toDateKey(dateValue);
  const minute = clockToTimelineMinutes(timeValue);
  if (!date || minute === null) return null;
  if (minute === TIMELINE_DAY_MINUTES) {
    return { date: toDateKey(addDays(date, 1)), time: "00:00" };
  }
  return { date, time: timelineMinutesToClock(minute) };
}

/**
 * Build the complete update_shift_composition request for a direct resize.
 * The API replaces a composition as one audited unit, so every other active
 * segment and every affected occurrence revision must be included unchanged.
 */
export function buildTimelineResizeCompositionPayload({
  shift,
  targetSegmentId,
  segments = [],
  occurrences = [],
  nextStartDate,
  nextEndDate,
  nextStartTime,
  nextEndTime,
} = {}) {
  if (!shift?.id) throw new Error("Een bestaande dienst is verplicht voor tijdlijn-resize.");
  const activeSegments = segments
    .filter(segment => segment?.status !== "removed" && String(segment?.shift_id) === String(shift.id));
  const target = activeSegments.find(segment => String(segment.id) === String(targetSegmentId));
  if (!target) throw new Error("Het te wijzigen taaksegment is niet actief binnen deze dienst.");
  const startBoundary = normalizePayloadBoundary(
    nextStartDate || target.start_date || target.service_date,
    nextStartTime || target.start_time,
  );
  const endBoundary = normalizePayloadBoundary(
    nextEndDate || target.end_date || target.start_date || target.service_date,
    nextEndTime || target.end_time,
  );
  if (!startBoundary || !endBoundary) throw new Error("De nieuwe segmenttijd is ongeldig.");

  const resizedSegments = activeSegments.map(segment => (
    String(segment.id) === String(target.id)
      ? {
          ...segment,
          start_date: startBoundary.date,
          end_date: endBoundary.date,
          start_time: startBoundary.time,
          end_time: endBoundary.time,
        }
      : segment
  ));
  const resizedTarget = resizedSegments.find(segment => String(segment.id) === String(target.id));
  if (!getShiftInterval(segmentIntervalRecord(resizedTarget)).valid) {
    throw new Error("De nieuwe segmenttijd heeft geen positieve duur.");
  }

  const occurrenceById = new Map(occurrences.map(occurrence => [String(occurrence.id), occurrence]));
  const affectedOccurrenceIds = [...new Set(resizedSegments.map(segment => String(segment.task_occurrence_id)))];
  const expectedOccurrenceRevisions = Object.fromEntries(affectedOccurrenceIds.map(id => {
    const occurrence = occurrenceById.get(id);
    if (!occurrence) throw new Error(`Taakuitvoering ${id} ontbreekt voor een veilige resize.`);
    return [id, Math.max(1, Number(occurrence.revision || 1))];
  }));
  const payloadSegments = resizedSegments
    .map(segment => ({
      task_occurrence_id: segment.task_occurrence_id,
      start_date: segment.start_date || segment.service_date,
      end_date: segment.end_date || segment.start_date || segment.service_date,
      start_time: segment.start_time,
      end_time: segment.end_time,
    }))
    .sort((left, right) => (
      String(left.start_date).localeCompare(String(right.start_date))
      || (clockToTimelineMinutes(left.start_time) ?? 0) - (clockToTimelineMinutes(right.start_time) ?? 0)
      || String(left.task_occurrence_id).localeCompare(String(right.task_occurrence_id))
    ));

  return {
    action: "update_shift_composition",
    shift_id: shift.id,
    expected_shift_revision: Math.max(1, Number(shift.revision || 1)),
    service_name: shift.name || shift.service_name_snapshot || undefined,
    required_count: Math.max(1, Number(shift.required_count || 1)),
    expected_occurrence_revisions: expectedOccurrenceRevisions,
    segments: payloadSegments,
  };
}
