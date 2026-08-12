const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const CLOCK_PATTERN = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
const MINUTE_MS = 60 * 1000;

const ACTIVE_ASSIGNMENT_STATUSES = new Set([
  "active",
  "assigned",
  "concept",
  "draft",
  "planned",
  "published",
  "scheduled",
]);
const INACTIVE_ASSIGNMENT_STATUSES = new Set([
  "cancelled",
  "canceled",
  "deleted",
  "ended",
  "rejected",
  "released",
  "removed",
  "unassigned",
]);
const ACTIVE_CONTRACT_STATUSES = new Set(["active", "scheduled", "signed"]);
const ACTIVE_PASS_STATUSES = new Set(["active"]);
const ACTIVE_ABSENCE_STATUSES = new Set(["active", "approved"]);
const REQUESTED_ABSENCE_STATUSES = new Set(["requested"]);

const ABSENCE_LABELS = {
  leave: "verlof",
  sick: "ziekte",
  special_leave: "bijzonder verlof",
  unavailable: "onbeschikbaarheid",
  other: "afwezigheid",
};

export const PLANNING_WARNING_CODES = Object.freeze({
  PERSONNEL_INACTIVE: "personnel_inactive",
  PERSONNEL_UNAVAILABLE: "personnel_unavailable",
  ABSENCE_ACTIVE: "absence_active",
  ABSENCE_REQUESTED: "absence_requested",
  DOUBLE_BOOKING: "double_booking",
  INSUFFICIENT_REST: "insufficient_rest",
  QUALIFICATION_MISSING: "qualification_missing",
  QUALIFICATION_EXPIRED: "qualification_expired",
  QUALIFICATION_NOT_YET_VALID: "qualification_not_yet_valid",
  QUALIFICATION_UNVERIFIED: "qualification_unverified",
  SECURITY_PASS_MISSING: "security_pass_missing",
  SECURITY_PASS_EXPIRED: "security_pass_expired",
  SECURITY_PASS_NOT_YET_VALID: "security_pass_not_yet_valid",
  SECURITY_PASS_INACTIVE: "security_pass_inactive",
  RESTRICTION_BLOCKED: "restriction_blocked",
  CONTRACT_MISSING: "contract_missing",
  CONTRACT_HOURS_EXCEEDED: "contract_hours_exceeded",
});

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function valueAt(record, path) {
  return path.split(".").reduce((current, key) => current?.[key], record);
}

function firstValue(record, paths) {
  for (const path of paths) {
    const value = valueAt(record, path);
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return null;
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === null || value === undefined || value === "") return [];
  if (typeof value === "string") {
    return value
      .split(",")
      .map(item => item.trim())
      .filter(Boolean);
  }
  return [value];
}

function localDate(year, month, day, hour = 12, minute = 0, second = 0) {
  const date = new Date(year, month - 1, day, hour, minute, second, 0);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

/**
 * Parse a YYYY-MM-DD value without routing it through UTC. Local noon keeps
 * calendar navigation stable on both daylight-saving transition days.
 */
export function parseDateKey(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return localDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  const match = String(value || "").match(DATE_KEY_PATTERN);
  if (!match) return null;
  return localDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

export function toDateKey(value) {
  const date = parseDateKey(value);
  if (!date) return "";
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function addDays(value, amount) {
  const date = parseDateKey(value);
  const days = finiteNumber(amount);
  if (!date || days === null) return null;
  date.setDate(date.getDate() + Math.trunc(days));
  date.setHours(12, 0, 0, 0);
  return date;
}

export function startOfWeek(value, weekStartsOn = 1) {
  const date = parseDateKey(value);
  if (!date) return null;
  const normalizedWeekStart = ((Math.trunc(weekStartsOn) % 7) + 7) % 7;
  const offset = (date.getDay() - normalizedWeekStart + 7) % 7;
  return addDays(date, -offset);
}

export function getPlanningRange(anchor, view = "week", options = {}) {
  const isCustomPeriod = view === "period" || view === "range" || view === "custom";
  const normalizedView = view === "four_weeks" || view === "four-weeks" || view === "4_weeks"
    ? "four_weeks"
    : view === "day"
      ? "day"
      : "week";
  const parsedAnchor = parseDateKey(anchor);
  if (!parsedAnchor) return { start: null, end: null, days: [] };

  if (isCustomPeriod) {
    const maxDays = Math.max(1, Math.min(63, Math.trunc(finiteNumber(options.maxDays) || 63)));
    const start = parseDateKey(options.periodStart) || startOfWeek(parsedAnchor);
    const requestedEnd = parseDateKey(options.periodEnd) || addDays(start, 27);
    const safeEnd = requestedEnd < start ? start : requestedEnd;
    const requestedDayCount = Math.round((safeEnd.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    const dayCount = Math.max(1, Math.min(maxDays, requestedDayCount));
    const days = Array.from({ length: dayCount }, (_, index) => addDays(start, index));
    return {
      start,
      end: days.at(-1) || start,
      days,
      truncated: requestedDayCount > maxDays,
    };
  }

  const start = normalizedView === "day" ? parsedAnchor : startOfWeek(parsedAnchor);
  const dayCount = normalizedView === "day" ? 1 : normalizedView === "four_weeks" ? 28 : 7;
  const days = Array.from({ length: dayCount }, (_, index) => addDays(start, index));

  return {
    start,
    end: days.at(-1) || start,
    days,
  };
}

/**
 * Base44 query used by the planning page to include both shifts that start in
 * the selected period and shifts that run into it. The one-day lookback covers
 * implicit overnight shifts without an end_date; the second branch covers
 * explicitly multi-day shifts that started earlier.
 */
function getPlanningCarryInRangeQuery(periodStart, periodEnd) {
  const start = parseDateKey(periodStart);
  const end = parseDateKey(periodEnd);
  if (!start || !end) return {};
  const safeEnd = end < start ? start : end;
  const startKey = toDateKey(start);
  const endKey = toDateKey(safeEnd);
  const lookbackKey = toDateKey(addDays(start, -1));
  return {
    $or: [
      { service_date: { $gte: lookbackKey, $lte: endKey } },
      { service_date: { $lte: endKey }, end_date: { $gte: startKey } },
    ],
  };
}

export function getPlanningShiftRangeQuery(periodStart, periodEnd) {
  return getPlanningCarryInRangeQuery(periodStart, periodEnd);
}

export function getPlanningTaskOccurrenceRangeQuery(periodStart, periodEnd) {
  return getPlanningCarryInRangeQuery(periodStart, periodEnd);
}

export function getPlanningTaskOccurrenceBootstrapStart(periodStart) {
  const start = parseDateKey(periodStart);
  return start ? toDateKey(addDays(start, -1)) : "";
}

export function isPlanningPersonnelActive(personnel) {
  const status = String(personnel?.status || "").trim().toLowerCase();
  if (status) return status === "active";
  return personnel?.is_active === true;
}

export function isPlanningObjectActive(object) {
  const status = String(object?.status || "").trim().toLowerCase();
  return !["concept", "inactive", "archived"].includes(status)
    && object?.is_active_customer_object !== false
    && object?.is_active !== false;
}

export function planningShiftOwnedByRange(shift, periodStart, periodEnd) {
  const start = toDateKey(periodStart);
  const end = toDateKey(periodEnd);
  const serviceDate = toDateKey(shift?.service_date);
  return Boolean(start && end && serviceDate && serviceDate >= start && serviceDate <= end);
}

export function splitIntoWeeks(value) {
  const days = Array.isArray(value) ? value : value?.days;
  if (!Array.isArray(days)) return [];
  const weeks = [];
  for (let index = 0; index < days.length; index += 7) {
    weeks.push(days.slice(index, index + 7));
  }
  return weeks;
}

function parseClock(value) {
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
  ) {
    return null;
  }
  return { hours, minutes, seconds };
}

function parseDateTime(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value !== "string" || !value.trim()) return null;

  const localMatch = value.trim().match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/,
  );
  if (localMatch) {
    const date = localDate(
      Number(localMatch[1]),
      Number(localMatch[2]),
      Number(localMatch[3]),
      Number(localMatch[4]),
      Number(localMatch[5]),
      Number(localMatch[6] || 0),
    );
    if (date && localMatch[7]) date.setMilliseconds(Number(localMatch[7].padEnd(3, "0")));
    return date;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateAtClock(dateValue, clockValue) {
  const date = parseDateKey(dateValue);
  const clock = parseClock(clockValue);
  if (!date || !clock) return null;
  if (clock.hours === 24) {
    const next = addDays(date, 1);
    next.setHours(0, 0, 0, 0);
    return next;
  }
  date.setHours(clock.hours, clock.minutes, clock.seconds, 0);
  return date;
}

function looksLikeDateTime(value) {
  return value instanceof Date
    || typeof value === "number"
    || (typeof value === "string" && /[T ]\d{1,2}:\d{2}/.test(value));
}

export function getShiftInterval(shift) {
  if (!shift || typeof shift !== "object") {
    return { start: null, end: null, valid: false, overnight: false };
  }

  const directStartValue = firstValue(shift, [
    "starts_at",
    "start_at",
    "start_datetime",
    "startDateTime",
    "planned_start_at",
    "planned_start",
    "interval.start",
  ]);
  const directEndValue = firstValue(shift, [
    "ends_at",
    "end_at",
    "end_datetime",
    "endDateTime",
    "planned_end_at",
    "planned_end",
    "interval.end",
  ]);

  let start = looksLikeDateTime(directStartValue) ? parseDateTime(directStartValue) : null;
  let end = looksLikeDateTime(directEndValue) ? parseDateTime(directEndValue) : null;

  const startDateKey = firstValue(shift, [
    "service_date",
    "shift_date",
    "planning_date",
    "date",
    "start_date",
    "day",
  ]);
  const endDateKey = firstValue(shift, ["end_date", "service_end_date", "shift_end_date"]);
  const startTime = firstValue(shift, [
    "start_time",
    "time_start",
    "time_window_start",
    "starts_at_time",
  ]);
  const endTime = firstValue(shift, [
    "end_time",
    "time_end",
    "time_window_end",
    "ends_at_time",
  ]);

  if (!start && startDateKey && startTime) start = dateAtClock(startDateKey, startTime);
  if (!end && endTime) {
    const endDate = endDateKey || startDateKey || (start ? toDateKey(start) : null);
    end = dateAtClock(endDate, endTime);
  }

  const durationMinutes = finiteNumber(firstValue(shift, [
    "duration_minutes",
    "planned_minutes",
    "minutes",
  ]));
  if (!end && start && durationMinutes !== null && durationMinutes > 0) {
    end = new Date(start.getTime() + durationMinutes * MINUTE_MS);
  }

  if (!start || !end) {
    return { start: start || null, end: end || null, valid: false, overnight: false };
  }

  let overnight = false;
  if (end.getTime() <= start.getTime()) {
    const mayCrossMidnight = shift.overnight !== false && shift.crosses_midnight !== false;
    if (mayCrossMidnight) {
      end = new Date(end.getTime());
      end.setDate(end.getDate() + 1);
      overnight = true;
    }
  } else {
    overnight = toDateKey(start) !== toDateKey(end);
  }

  return {
    start,
    end,
    valid: end.getTime() > start.getTime(),
    overnight,
  };
}

export function getShiftDurationMinutes(shift) {
  const interval = getShiftInterval(shift);
  if (!interval.valid) return 0;
  return Math.max(0, Math.round((interval.end.getTime() - interval.start.getTime()) / MINUTE_MS));
}

/**
 * Calendar-day overlap for a half-open shift interval and an inclusive date
 * range. A shift ending exactly at 00:00 on the first day does not overlap;
 * any work after 00:00 does.
 */
function intervalOverlapsPlanningRange(interval, periodStart, periodEnd) {
  const start = parseDateKey(periodStart);
  const end = parseDateKey(periodEnd);
  if (!interval.valid || !start || !end || end < start) return false;
  start.setHours(0, 0, 0, 0);
  const exclusiveEnd = addDays(end, 1);
  exclusiveEnd.setHours(0, 0, 0, 0);
  return interval.start < exclusiveEnd && interval.end > start;
}

export function planningShiftOverlapsRange(shift, periodStart, periodEnd) {
  return intervalOverlapsPlanningRange(getShiftInterval(shift), periodStart, periodEnd);
}

/**
 * Direct slot assignment from a projected calendar cell is safe only when the
 * complete shift is visible inside that one half-open calendar day. Overnight
 * and multi-day shifts must be opened and confirmed as a full shift instead.
 */
export function planningShiftContainedInDate(shift, serviceDate) {
  const interval = getShiftInterval(shift);
  const dayStart = parseDateKey(serviceDate);
  if (!interval.valid || !dayStart) return false;
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = addDays(dayStart, 1);
  dayEnd.setHours(0, 0, 0, 0);
  return interval.start >= dayStart && interval.end <= dayEnd;
}

function normalizeInterval(value) {
  if (!value) return null;
  if (Array.isArray(value) && value.length >= 2) {
    const start = parseDateTime(value[0]);
    const end = parseDateTime(value[1]);
    return start && end && end > start ? { start, end, valid: true } : null;
  }
  if (value.start !== undefined && value.end !== undefined) {
    const start = parseDateTime(value.start);
    const end = parseDateTime(value.end);
    return start && end && end > start ? { start, end, valid: true } : null;
  }
  const interval = getShiftInterval(value);
  return interval.valid ? interval : null;
}

/**
 * Half-open overlap: touching boundaries are allowed. Accepts either two
 * interval/shift objects or four start/end values.
 */
export function rangesOverlap(first, second, third, fourth) {
  let left;
  let right;
  if (arguments.length >= 4) {
    left = normalizeInterval([first, second]);
    right = normalizeInterval([third, fourth]);
  } else {
    left = normalizeInterval(first);
    right = normalizeInterval(second);
  }
  if (!left || !right) return false;
  return left.start < right.end && right.start < left.end;
}

function activeTaskSegments(segments) {
  return asArray(segments).filter(segment => segment.status !== "removed");
}

function taskSegmentInterval(segment) {
  return getShiftInterval({
    service_date: segment.start_date || segment.service_date,
    end_date: segment.end_date || null,
    start_time: segment.start_time,
    end_time: segment.end_time,
    overnight: true,
  });
}

function occurrenceInterval(occurrence) {
  return getShiftInterval({
    service_date: occurrence.service_date,
    end_date: occurrence.end_date || null,
    start_time: occurrence.window_start_time,
    end_time: occurrence.window_end_time,
    overnight: true,
  });
}

export function planningTaskOccurrenceOverlapsRange(occurrence, periodStart, periodEnd) {
  return intervalOverlapsPlanningRange(occurrenceInterval(occurrence), periodStart, periodEnd);
}

export function getTaskOccurrenceDayProjection(occurrence, serviceDate) {
  const interval = occurrenceInterval(occurrence);
  const dayStart = parseDateKey(serviceDate);
  if (!interval.valid || !dayStart) return null;
  dayStart.setHours(0, 0, 0, 0);
  const nextDay = addDays(dayStart, 1);
  nextDay.setHours(0, 0, 0, 0);
  const start = new Date(Math.max(interval.start.getTime(), dayStart.getTime()));
  const end = new Date(Math.min(interval.end.getTime(), nextDay.getTime()));
  if (end <= start) return null;
  const formatTime = value => `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
  return {
    date: toDateKey(dayStart),
    startTime: formatTime(start),
    endTime: end.getTime() === nextDay.getTime() ? "24:00" : formatTime(end),
    continuesBefore: interval.start < dayStart,
    continuesAfter: interval.end > nextDay,
  };
}

export function taskOccurrenceOverlapsDate(occurrence, serviceDate) {
  return Boolean(getTaskOccurrenceDayProjection(occurrence, serviceDate));
}

/**
 * A dated drop is always authoritative. Legacy undated occurrence drops are
 * safe only when the complete occurrence fits on its service date; otherwise
 * inferring the date could silently allocate an overnight slice off-screen.
 */
export function getSafeOccurrenceDropServiceDate(occurrence, requestedServiceDate = null) {
  const requested = toDateKey(requestedServiceDate);
  if (requested) return taskOccurrenceOverlapsDate(occurrence, requested) ? requested : "";
  const serviceDate = toDateKey(occurrence?.service_date);
  const projection = getTaskOccurrenceDayProjection(occurrence, serviceDate);
  if (!projection || projection.continuesBefore || projection.continuesAfter) return "";
  return projection.date;
}

function mergedDateIntervals(intervals) {
  const sorted = intervals
    .filter(interval => interval?.valid)
    .map(interval => ({ start: interval.start.getTime(), end: interval.end.getTime() }))
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const merged = [];
  for (const interval of sorted) {
    const previous = merged.at(-1);
    if (!previous || interval.start > previous.end) merged.push({ ...interval });
    else previous.end = Math.max(previous.end, interval.end);
  }
  return merged;
}

export function getTaskOccurrenceCoverage(occurrence, segments = []) {
  const relevant = activeTaskSegments(segments).filter(segment => (
    String(segment.task_occurrence_id) === String(occurrence?.id)
  ));
  const merged = mergedDateIntervals(relevant.map(taskSegmentInterval));
  const allocatedMinutes = merged.reduce(
    (sum, interval) => sum + Math.round((interval.end - interval.start) / MINUTE_MS),
    0,
  );
  const requiredMinutes = Math.max(0, Number(occurrence?.required_minutes || 0));
  return {
    allocatedMinutes,
    requiredMinutes,
    remainingMinutes: Math.max(0, requiredMinutes - allocatedMinutes),
    status: allocatedMinutes <= 0 ? "open" : allocatedMinutes >= requiredMinutes ? "full" : "partial",
    segmentCount: relevant.length,
  };
}

export function getOccurrencePlanningState({
  occurrence,
  segments = [],
  shifts = [],
  assignments = [],
} = {}) {
  const activeShifts = asArray(shifts).filter(shift => shift.status !== "cancelled");
  const shiftsById = new Map(activeShifts.map(shift => [String(shift.id), shift]));
  const linkedSegments = activeTaskSegments(segments).filter(segment => (
    String(segment.task_occurrence_id) === String(occurrence?.id)
    && shiftsById.has(String(segment.shift_id))
  ));
  const linkedShiftIds = [...new Set(linkedSegments.map(segment => String(segment.shift_id)))];
  const activeLinkedAssignments = asArray(assignments).filter(assignment => (
    assignment.status !== "removed"
    && linkedShiftIds.includes(String(assignment.planning_shift_id || assignment.shift_id))
  ));
  const requiredSlots = linkedShiftIds.reduce((total, shiftId) => (
    total + Math.max(1, Number(shiftsById.get(shiftId)?.required_count || 1))
  ), 0);
  const assignedSlots = activeLinkedAssignments.length;
  const openSlots = Math.max(0, requiredSlots - assignedSlots);
  const coverage = getTaskOccurrenceCoverage(occurrence, linkedSegments);
  const readiness = coverage.status === "open"
    ? "unplanned"
    : coverage.status === "full" && linkedShiftIds.length > 0 && openSlots === 0
      ? "ready"
      : "needs_staffing";

  return {
    coverage,
    linkedShiftIds,
    requiredSlots,
    assignedSlots,
    openSlots,
    readiness,
  };
}

export function getOccurrenceStaffingTarget({
  occurrence,
  planningState,
  personnelId,
  serviceDate = null,
  shifts = [],
  assignments = [],
  segments = [],
} = {}) {
  const state = planningState || getOccurrencePlanningState({ occurrence, shifts, assignments, segments });
  if (state.coverage.status !== "full" || !personnelId) return null;

  const shiftsById = new Map(asArray(shifts).map(shift => [String(shift.id), shift]));
  const targetDayStart = serviceDate ? parseDateKey(serviceDate) : null;
  if (serviceDate && !targetDayStart) return null;
  if (targetDayStart) targetDayStart.setHours(0, 0, 0, 0);
  const targetDayEnd = targetDayStart ? addDays(targetDayStart, 1) : null;
  if (targetDayEnd) targetDayEnd.setHours(0, 0, 0, 0);
  const orderedShifts = state.linkedShiftIds
    .map(shiftId => shiftsById.get(String(shiftId)))
    .filter(shift => shift && shift.status !== "cancelled")
    .filter(shift => {
      if (!targetDayStart) return true;
      const interval = getShiftInterval(shift);
      return interval.valid && interval.start >= targetDayStart && interval.end <= targetDayEnd;
    })
    .sort((left, right) => (
      String(left.service_date || "").localeCompare(String(right.service_date || ""))
      || String(left.start_time || "").localeCompare(String(right.start_time || ""))
      || String(left.id).localeCompare(String(right.id))
    ));

  for (const shift of orderedShifts) {
    const current = asArray(assignments).filter(assignment => (
      assignmentIsActive(assignment)
      && String(assignment.planning_shift_id || assignment.shift_id) === String(shift.id)
    ));
    if (current.some(assignment => String(assignment.personnel_id) === String(personnelId))) continue;
    const occupied = new Set(current.map(assignment => Number(assignment.slot_index || 0)));
    const slotIndex = Array.from(
      { length: Math.max(1, Number(shift.required_count || 1)) },
      (_, index) => index,
    ).find(index => !occupied.has(index));
    if (slotIndex != null) return { shiftId: String(shift.id), slotIndex };
  }
  return null;
}

export function getOccurrenceOpenStaffingShift({
  occurrence,
  planningState,
  shifts = [],
  assignments = [],
  segments = [],
} = {}) {
  const state = planningState || getOccurrencePlanningState({ occurrence, shifts, assignments, segments });
  if (state.coverage.status !== "full" || state.openSlots <= 0) return null;
  const shiftsById = new Map(asArray(shifts).map(shift => [String(shift.id), shift]));
  return state.linkedShiftIds
    .map(shiftId => shiftsById.get(String(shiftId)))
    .filter(shift => shift && shift.status !== "cancelled")
    .sort((left, right) => (
      String(left.service_date || "").localeCompare(String(right.service_date || ""))
      || String(left.start_time || "").localeCompare(String(right.start_time || ""))
      || String(left.id).localeCompare(String(right.id))
    ))
    .find(shift => {
      const occupied = new Set(asArray(assignments)
        .filter(assignment => (
          assignmentIsActive(assignment)
          && String(assignment.planning_shift_id || assignment.shift_id) === String(shift.id)
        ))
        .map(assignment => Number(assignment.slot_index || 0)));
      return occupied.size < Math.max(1, Number(shift.required_count || 1));
    }) || null;
}

export function resolvePlanningDrop(result) {
  const draggableId = String(result?.draggableId || "");
  const droppableId = String(result?.destination?.droppableId || "");
  if (!draggableId || !droppableId) return null;

  if (draggableId.startsWith("personnel:") && droppableId.startsWith("occurrence-gap:")) {
    const personnelId = draggableId.slice("personnel:".length);
    const match = droppableId.match(/^occurrence-gap:([^:]+):(\d{4}-\d{2}-\d{2}):(\d{4}):(\d{4})$/);
    if (!personnelId || !match || !parseDateKey(match[2])) return null;
    const timelineMinuteClock = value => {
      const totalMinutes = Number(value);
      if (!Number.isInteger(totalMinutes) || totalMinutes < 0 || totalMinutes > 24 * 60) return "";
      if (totalMinutes === 24 * 60) return "24:00";
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    };
    const startTime = timelineMinuteClock(match[3]);
    const endTime = timelineMinuteClock(match[4]);
    let occurrenceId;
    try {
      occurrenceId = decodeURIComponent(match[1]);
    } catch {
      return null;
    }
    const clockMinutes = value => {
      const [hours, minutes] = String(value).split(":").map(Number);
      return hours * 60 + minutes;
    };
    if (!occurrenceId || !startTime || !endTime || clockMinutes(endTime) <= clockMinutes(startTime)) return null;
    return {
      kind: "compose_occurrence_slice_for_personnel",
      personnelId,
      occurrenceId,
      serviceDate: match[2],
      startTime,
      endTime,
    };
  }

  if (draggableId.startsWith("personnel:") && droppableId.startsWith("slot:")) {
    const personnelId = draggableId.slice("personnel:".length);
    const [, shiftId, slotValue, projectionValue] = droppableId.split(":");
    const slotIndex = Number(slotValue);
    const projectionLooksDated = DATE_KEY_PATTERN.test(String(projectionValue || ""));
    const serviceDate = projectionLooksDated ? toDateKey(projectionValue) : "";
    if (projectionLooksDated && !serviceDate) return null;
    if (!personnelId || !shiftId || !Number.isInteger(slotIndex) || slotIndex < 0) return null;
    return {
      kind: "assign_personnel_to_shift",
      personnelId,
      shiftId,
      slotIndex,
      ...(serviceDate ? { serviceDate } : {}),
    };
  }

  if (draggableId.startsWith("personnel:") && droppableId.startsWith("occurrence:")) {
    const personnelId = draggableId.slice("personnel:".length);
    const remainder = droppableId.slice("occurrence:".length);
    const dateMatch = remainder.match(/^(.*):(\d{4}-\d{2}-\d{2})$/);
    const occurrenceId = dateMatch?.[1] || remainder;
    const serviceDate = dateMatch?.[2] || null;
    if (serviceDate && !parseDateKey(serviceDate)) return null;
    if (!personnelId || !occurrenceId) return null;
    return {
      kind: "compose_occurrence_for_personnel",
      personnelId,
      occurrenceId,
      ...(serviceDate ? { serviceDate } : {}),
    };
  }

  if (draggableId.startsWith("task:") && droppableId.startsWith("employee-day:")) {
    const occurrenceId = draggableId.slice("task:".length);
    const remainder = droppableId.slice("employee-day:".length);
    const dateMatch = remainder.match(/^(.*):(\d{4}-\d{2}-\d{2})$/);
    if (!occurrenceId || !dateMatch?.[1] || !parseDateKey(dateMatch[2])) return null;
    return {
      kind: "assign_task_to_employee_day",
      occurrenceId,
      personnelId: dateMatch[1],
      serviceDate: dateMatch[2],
    };
  }

  return null;
}

export function getOccurrenceRemainingRanges(occurrence, segments = [], shifts = null) {
  const demand = occurrenceInterval(occurrence);
  if (!demand.valid) return [];
  const activeShiftIds = Array.isArray(shifts)
    ? new Set(shifts.filter(shift => shift.status !== "cancelled").map(shift => String(shift.id)))
    : null;
  const used = mergedDateIntervals(
    activeTaskSegments(segments)
      .filter(segment => String(segment.task_occurrence_id) === String(occurrence.id))
      .filter(segment => !activeShiftIds || activeShiftIds.has(String(segment.shift_id)))
      .map(taskSegmentInterval),
  );
  const ranges = [];
  let cursor = demand.start.getTime();
  for (const interval of used) {
    if (interval.end <= cursor || interval.start >= demand.end.getTime()) continue;
    if (interval.start > cursor) ranges.push({
      start: new Date(cursor),
      end: new Date(Math.min(interval.start, demand.end.getTime())),
    });
    cursor = Math.max(cursor, interval.end);
  }
  if (cursor < demand.end.getTime()) ranges.push({ start: new Date(cursor), end: new Date(demand.end) });
  return ranges.filter(range => range.end > range.start);
}

export function getOccurrenceRemainingAllocationRanges(occurrence, segments = [], shifts = null, serviceDate = null) {
  const activeShiftIds = Array.isArray(shifts)
    ? new Set(shifts.filter(shift => shift.status !== "cancelled").map(shift => String(shift.id)))
    : null;
  const coverageSegments = activeShiftIds
    ? activeTaskSegments(segments).filter(segment => activeShiftIds.has(String(segment.shift_id)))
    : segments;
  let remainingMinutes = getTaskOccurrenceCoverage(occurrence, coverageSegments).remainingMinutes;
  let remainingRanges = getOccurrenceRemainingRanges(occurrence, segments, shifts);
  if (serviceDate) {
    const dayStart = parseDateKey(serviceDate);
    if (!dayStart) return [];
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = addDays(dayStart, 1);
    dayEnd.setHours(0, 0, 0, 0);
    remainingRanges = remainingRanges.map(range => ({
      start: new Date(Math.max(range.start.getTime(), dayStart.getTime())),
      end: new Date(Math.min(range.end.getTime(), dayEnd.getTime())),
    })).filter(range => range.end > range.start);
  }
  const allocations = [];
  for (const range of remainingRanges) {
    if (remainingMinutes <= 0) break;
    const rangeMinutes = Math.max(0, Math.round((range.end - range.start) / MINUTE_MS));
    const allocatedMinutes = Math.min(remainingMinutes, rangeMinutes);
    if (allocatedMinutes <= 0) continue;
    allocations.push({
      start: new Date(range.start),
      end: new Date(range.start.getTime() + allocatedMinutes * MINUTE_MS),
    });
    remainingMinutes -= allocatedMinutes;
  }
  return allocations;
}

export function taskCoverageSummary(occurrences = [], segments = [], shifts = null) {
  const activeShiftIds = Array.isArray(shifts)
    ? new Set(shifts.filter(shift => shift.status !== "cancelled").map(shift => String(shift.id)))
    : null;
  const coverageSegments = activeShiftIds
    ? asArray(segments).filter(segment => activeShiftIds.has(String(segment.shift_id)))
    : segments;
  return asArray(occurrences).reduce((summary, occurrence) => {
    if (occurrence.lifecycle_status && occurrence.lifecycle_status !== "active") return summary;
    const coverage = getTaskOccurrenceCoverage(occurrence, coverageSegments);
    summary[coverage.status] += 1;
    summary.requiredMinutes += coverage.requiredMinutes;
    summary.allocatedMinutes += coverage.allocatedMinutes;
    summary.remainingMinutes += coverage.remainingMinutes;
    return summary;
  }, { open: 0, partial: 0, full: 0, requiredMinutes: 0, allocatedMinutes: 0, remainingMinutes: 0 });
}

export function sortTaskSegments(segments = []) {
  return [...activeTaskSegments(segments)].sort((left, right) => {
    const first = taskSegmentInterval(left);
    const second = taskSegmentInterval(right);
    return (first.valid && second.valid ? first.start - second.start || first.end - second.end : 0)
      || Number(left.sequence_index || 0) - Number(right.sequence_index || 0);
  });
}

export function validateTaskComposition(segments = []) {
  const ordered = sortTaskSegments(segments).map(segment => ({ segment, interval: taskSegmentInterval(segment) }));
  const errors = ordered.filter(item => !item.interval.valid).map(item => ({
    code: "invalid_segment_time",
    message: `Ongeldige tijd voor ${item.segment.task_name_snapshot || "taak"}.`,
  }));
  const warnings = [];
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (!previous.interval.valid || !current.interval.valid) continue;
    const gap = Math.round((current.interval.start - previous.interval.end) / MINUTE_MS);
    if (gap < 0) errors.push({ code: "segment_overlap", message: "Taaksegmenten mogen elkaar niet overlappen." });
    else if (gap > 0) warnings.push({ code: "composition_gap", message: `${gap} minuten zonder taak tussen twee segmenten.` });
    if (String(previous.segment.object_id) !== String(current.segment.object_id) && gap < 5) {
      warnings.push({ code: "object_transition_review", message: "Controleer de reistijd tussen de twee objecten." });
    }
  }
  return { valid: ordered.length > 0 && errors.length === 0, errors, warnings };
}

/**
 * Validate task allocations against the immutable occurrence window and
 * segments that already belong to another shift. This mirrors the two
 * server-side composition guards so the planner gets feedback before save.
 */
export function validateTaskSegmentAllocations({
  segments = [],
  occurrences = [],
  externalSegments = [],
} = {}) {
  const occurrenceById = new Map(asArray(occurrences).map(item => [String(item.id), item]));
  const external = activeTaskSegments(externalSegments);
  const errors = [];

  activeTaskSegments(segments).forEach((segment, index) => {
    const segmentId = String(segment.local_id || segment.id || `${segment.task_occurrence_id || "segment"}-${index}`);
    const occurrence = occurrenceById.get(String(segment.task_occurrence_id));
    if (!occurrence) {
      errors.push({
        code: `occurrence_missing_${segmentId}`,
        segmentId,
        message: "Een taakuitvoering bestaat niet meer.",
      });
      return;
    }

    const interval = taskSegmentInterval(segment);
    const demand = occurrenceInterval(occurrence);
    if (!demand.valid) {
      errors.push({
        code: `occurrence_window_invalid_${segmentId}`,
        segmentId,
        message: `Het tijdvenster van ${occurrence.task_name_snapshot || "de taak"} is ongeldig.`,
      });
      return;
    }
    // Invalid segment clocks are already reported by validateTaskComposition.
    if (!interval.valid) return;

    if (interval.start < demand.start || interval.end > demand.end) {
      errors.push({
        code: `segment_outside_occurrence_window_${segmentId}`,
        segmentId,
        message: `${occurrence.task_name_snapshot || "Taak"}: het segment valt buiten het taakvenster ${occurrence.window_start_time}–${occurrence.window_end_time}.`,
      });
    }

    const overlapsExternal = external.some(item => (
      String(item.task_occurrence_id) === String(occurrence.id)
      && rangesOverlap(interval, taskSegmentInterval(item))
    ));
    if (overlapsExternal) {
      errors.push({
        code: `segment_overlaps_existing_${segmentId}`,
        segmentId,
        message: `${occurrence.task_name_snapshot || "Taak"}: dit tijdvak overlapt met een segment in een andere dienst.`,
      });
    }
  });

  return { valid: errors.length === 0, errors };
}

function warning(code, severity, title, detail) {
  return { code, severity, title, detail };
}

function personnelId(personnel) {
  return String(firstValue(personnel, ["id", "personnel_id", "employee_id"]) || "");
}

function recordPersonnelId(record) {
  return String(firstValue(record, ["personnel_id", "employee_id", "person_id", "personnel.id"]) || "");
}

function belongsToPersonnel(record, id) {
  const linkedId = recordPersonnelId(record);
  return !linkedId || !id || linkedId === id;
}

function assignmentIsActive(assignment) {
  const status = String(firstValue(assignment, ["status", "assignment_status", "lifecycle_status"]) || "").toLowerCase();
  if (INACTIVE_ASSIGNMENT_STATUSES.has(status)) return false;
  return !status || ACTIVE_ASSIGNMENT_STATUSES.has(status) || !INACTIVE_ASSIGNMENT_STATUSES.has(status);
}

function shiftId(shift) {
  return String(firstValue(shift, ["id", "shift_id", "planning_shift_id", "service_id"]) || "");
}

function assignmentShiftId(assignment) {
  return String(firstValue(assignment, [
    "shift_id",
    "planning_shift_id",
    "service_id",
    "planningShiftId",
    "shift.id",
  ]) || "");
}

function resolveAssignmentShift(assignment, shiftsById) {
  const nested = firstValue(assignment, ["shift", "planning_shift", "service"]);
  if (nested && typeof nested === "object") return nested;
  const linkedShift = shiftsById.get(assignmentShiftId(assignment));
  if (linkedShift) return linkedShift;
  return getShiftInterval(assignment).valid ? assignment : null;
}

function relevantAssignments({ assignments, shifts, personnel, targetShift, excludeAssignmentId }) {
  const id = personnelId(personnel);
  const targetShiftId = shiftId(targetShift);
  const shiftsById = new Map(
    asArray(shifts)
      .map(item => [shiftId(item), item])
      .filter(([key]) => key),
  );

  return asArray(assignments)
    .filter(assignment => assignmentIsActive(assignment))
    .filter(assignment => belongsToPersonnel(assignment, id))
    .filter(assignment => !excludeAssignmentId || String(assignment.id || "") !== String(excludeAssignmentId))
    .filter(assignment => !targetShiftId || assignmentShiftId(assignment) !== targetShiftId)
    .map(assignment => ({
      assignment,
      shift: resolveAssignmentShift(assignment, shiftsById),
    }))
    .filter(item => item.shift && getShiftInterval(item.shift).valid);
}

function dateRangeInterval(record) {
  const startKey = firstValue(record, ["start_date", "date", "valid_from"]);
  let endKey = firstValue(record, ["end_date", "valid_until"]) || startKey;
  const startDate = parseDateKey(startKey);
  if (!startDate) return null;

  if (!firstValue(record, ["end_date", "valid_until"])) {
    const days = finiteNumber(record.days);
    if (days !== null && days > 1) endKey = toDateKey(addDays(startDate, Math.ceil(days) - 1));
  }

  const endDate = parseDateKey(endKey);
  if (!endDate) return null;
  startDate.setHours(0, 0, 0, 0);
  const endExclusive = addDays(endDate, 1);
  endExclusive.setHours(0, 0, 0, 0);
  return { start: startDate, end: endExclusive, valid: endExclusive > startDate };
}

function recordActiveOn(record, dateKey) {
  if (!dateKey) return false;
  const validFrom = firstValue(record, ["valid_from", "start_date", "contract_start_date"]);
  const validUntil = firstValue(record, [
    "effective_contract_end_date",
    "valid_until",
    "end_date",
    "contract_end_date",
  ]);
  return (!validFrom || String(validFrom).slice(0, 10) <= dateKey)
    && (!validUntil || String(validUntil).slice(0, 10) >= dateKey);
}

function normalizedText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeQualificationRequirement(requirement) {
  if (typeof requirement === "string") {
    return { key: normalizedText(requirement), value: requirement, label: requirement.replaceAll("_", " ") };
  }
  if (!requirement || typeof requirement !== "object") return null;
  const value = firstValue(requirement, ["qualification_type", "type", "key", "id", "value", "name"]);
  if (!value) return null;
  return {
    key: normalizedText(value),
    value: String(value),
    label: String(firstValue(requirement, ["label", "name"]) || value).replaceAll("_", " "),
  };
}

function qualificationRequirements(shift) {
  const raw = firstValue(shift, [
    "required_qualification_types",
    "required_qualifications",
    "qualification_requirements",
    "requirements.qualifications",
    "requirements.qualification_types",
  ]);
  const unique = new Map();
  asArray(raw)
    .map(normalizeQualificationRequirement)
    .filter(Boolean)
    .forEach(requirement => unique.set(requirement.key, requirement));
  return [...unique.values()];
}

function qualificationMatches(record, requirement) {
  const values = [
    record.qualification_type,
    record.type,
    record.name,
    record.label,
  ].map(normalizedText).filter(Boolean);
  return values.some(value => value === requirement.key);
}

function targetCompanyId(shift) {
  return String(firstValue(shift, ["company_id", "employer_company_id", "company.id"]) || "");
}

function companyScopedRecordMatches(record, companyId) {
  const recordCompanyId = String(firstValue(record, ["company_id", "employer_company_id"]) || "");
  return !recordCompanyId || !companyId || recordCompanyId === companyId;
}

function getQualificationWarnings({ personnel, shift, qualifications }) {
  const requirements = qualificationRequirements(shift);
  if (requirements.length === 0) return [];
  const id = personnelId(personnel);
  const companyId = targetCompanyId(shift);
  const targetDateKey = toDateKey(getShiftInterval(shift).start);
  const records = asArray(qualifications)
    .filter(record => belongsToPersonnel(record, id))
    .filter(record => companyScopedRecordMatches(record, companyId));

  const failures = {
    missing: [],
    expired: [],
    future: [],
    unverified: [],
  };

  requirements.forEach(requirement => {
    const matches = records.filter(record => qualificationMatches(record, requirement));
    if (matches.length === 0) {
      failures.missing.push(requirement.label);
      return;
    }

    const verified = matches.filter(record => record.verification_status === "verified");
    if (verified.length === 0) {
      failures.unverified.push(requirement.label);
      return;
    }
    if (verified.some(record => recordActiveOn(record, targetDateKey))) return;
    if (verified.every(record => record.valid_until && String(record.valid_until).slice(0, 10) < targetDateKey)) {
      failures.expired.push(requirement.label);
      return;
    }
    failures.future.push(requirement.label);
  });

  const warnings = [];
  if (failures.missing.length) {
    warnings.push(warning(
      PLANNING_WARNING_CODES.QUALIFICATION_MISSING,
      "critical",
      "Vereiste kwalificatie ontbreekt",
      `Ontbrekend: ${failures.missing.join(", ")}.`,
    ));
  }
  if (failures.expired.length) {
    warnings.push(warning(
      PLANNING_WARNING_CODES.QUALIFICATION_EXPIRED,
      "critical",
      "Kwalificatie verlopen",
      `Niet meer geldig op de dienstdatum: ${failures.expired.join(", ")}.`,
    ));
  }
  if (failures.future.length) {
    warnings.push(warning(
      PLANNING_WARNING_CODES.QUALIFICATION_NOT_YET_VALID,
      "critical",
      "Kwalificatie nog niet geldig",
      `Nog niet geldig op de dienstdatum: ${failures.future.join(", ")}.`,
    ));
  }
  if (failures.unverified.length) {
    warnings.push(warning(
      PLANNING_WARNING_CODES.QUALIFICATION_UNVERIFIED,
      "critical",
      "Kwalificatie niet geverifieerd",
      `Nog niet geverifieerd: ${failures.unverified.join(", ")}.`,
    ));
  }
  return warnings;
}

function requiredPassTypes(shift) {
  const raw = firstValue(shift, [
    "required_security_pass_types",
    "required_pass_types",
    "required_pass_type",
    "requirements.security_pass_types",
  ]);
  return asArray(raw).map(normalizedText).filter(Boolean);
}

function getSecurityPassWarnings({ personnel, shift, securityPasses }) {
  if (
    shift.requires_security_pass === false
    || shift.security_pass_required === false
    || shift.performs_security_work === false
  ) {
    return [];
  }
  const id = personnelId(personnel);
  const companyId = targetCompanyId(shift);
  const targetDateKey = toDateKey(getShiftInterval(shift).start);
  const requiredTypes = requiredPassTypes(shift);
  const records = asArray(securityPasses)
    .filter(record => belongsToPersonnel(record, id))
    .filter(record => companyScopedRecordMatches(record, companyId))
    .filter(record => requiredTypes.length === 0 || requiredTypes.includes(normalizedText(record.pass_type)));

  if (records.length === 0) {
    return [warning(
      PLANNING_WARNING_CODES.SECURITY_PASS_MISSING,
      "critical",
      "Beveiligingspas ontbreekt",
      companyId
        ? "Er is geen passende beveiligingspas voor het bedrijf van deze dienst."
        : "Er is geen passende beveiligingspas geregistreerd.",
    )];
  }

  const activeRecords = records.filter(record => ACTIVE_PASS_STATUSES.has(String(record.status || "").toLowerCase()));
  const validActive = activeRecords.filter(record => recordActiveOn(record, targetDateKey));
  if (validActive.length > 0) return [];

  const expiredRecords = records.filter(record => (
    String(record.status || "").toLowerCase() === "expired"
    || (record.valid_until && String(record.valid_until).slice(0, 10) < targetDateKey)
  ));
  if (expiredRecords.length === records.length) {
    return [warning(
      PLANNING_WARNING_CODES.SECURITY_PASS_EXPIRED,
      "critical",
      "Beveiligingspas verlopen",
      "De beveiligingspas is niet meer geldig op de dienstdatum.",
    )];
  }
  if (
    records.length > 0
    && records.every(record => record.valid_from && String(record.valid_from).slice(0, 10) > targetDateKey)
  ) {
    return [warning(
      PLANNING_WARNING_CODES.SECURITY_PASS_NOT_YET_VALID,
      "critical",
      "Beveiligingspas nog niet geldig",
      "De beveiligingspas is nog niet geldig op de dienstdatum.",
    )];
  }
  return [warning(
    PLANNING_WARNING_CODES.SECURITY_PASS_INACTIVE,
    "critical",
    "Beveiligingspas niet actief",
    "Er is wel een passende pas geregistreerd, maar deze heeft geen actieve status.",
  )];
}

function scopeTarget(shift, scopeType) {
  const genericId = firstValue(shift, ["scope_id"]);
  const genericLabel = firstValue(shift, ["scope_label"]);
  const values = {
    company: {
      id: firstValue(shift, ["company_id", "employer_company_id", "company.id"]) || genericId,
      label: firstValue(shift, ["company_name", "company_name_snapshot", "company_label", "company.name"]) || genericLabel,
    },
    customer: {
      id: firstValue(shift, ["customer_id", "customer.id"]) || genericId,
      label: firstValue(shift, ["customer_name", "customer_name_snapshot", "customer_label", "customer.name"]) || genericLabel,
    },
    object: {
      id: firstValue(shift, ["object_id", "surveillance_object_id", "location_id", "object.id"]) || genericId,
      label: firstValue(shift, ["object_name", "object_name_snapshot", "object_label", "location_name", "object.name"]) || genericLabel,
    },
    route: {
      id: firstValue(shift, ["route_id", "route.id"]) || genericId,
      label: firstValue(shift, ["route_name", "route_name_snapshot", "route_label", "route.name"]) || genericLabel,
    },
    function_group: {
      id: firstValue(shift, ["function_group_id", "function_id"]) || genericId,
      label: firstValue(shift, ["function_group", "function_group_label", "function_name"]) || genericLabel,
    },
    other: {
      id: genericId,
      label: genericLabel,
    },
  };
  return values[scopeType] || values.other;
}

function scopeTargets(shift, scopeType) {
  const target = scopeTarget(shift, scopeType);
  const arrayPaths = {
    customer: {
      ids: ["customer_ids", "service_context_snapshot.customer_ids"],
      labels: ["customer_names", "customer_name_snapshots", "service_context_snapshot.customer_names"],
    },
    object: {
      ids: ["object_ids", "service_context_snapshot.object_ids"],
      labels: ["object_names", "object_name_snapshots", "service_context_snapshot.object_names"],
    },
  }[scopeType] || { ids: [], labels: [] };
  const ids = [target.id, ...arrayPaths.ids.flatMap(path => asArray(valueAt(shift, path)))]
    .filter(Boolean)
    .map(String);
  const labels = [target.label, ...arrayPaths.labels.flatMap(path => asArray(valueAt(shift, path)))]
    .map(normalizedText)
    .filter(Boolean);
  return {
    ids: [...new Set(ids)],
    labels: [...new Set(labels)],
  };
}

function restrictionMatchesShift(restriction, shift) {
  const scopeType = restriction.scope_type || "object";
  const targets = scopeTargets(shift, scopeType);
  const restrictionScopeId = firstValue(restriction, ["scope_id"]);
  if (restrictionScopeId) {
    return targets.ids.includes(String(restrictionScopeId));
  }
  const restrictionLabel = normalizedText(restriction.scope_label);
  return Boolean(restrictionLabel) && targets.labels.includes(restrictionLabel);
}

function getRestrictionWarnings({ personnel, shift, restrictions }) {
  const id = personnelId(personnel);
  const targetDateKey = toDateKey(getShiftInterval(shift).start);
  const blocked = asArray(restrictions)
    .filter(record => belongsToPersonnel(record, id))
    .filter(record => !record.status || record.status === "active")
    .filter(record => record.may_work === false)
    .filter(record => recordActiveOn(record, targetDateKey))
    .filter(record => restrictionMatchesShift(record, shift));

  if (blocked.length === 0) return [];
  const reasons = blocked
    .map(record => record.reason || record.scope_label)
    .filter(Boolean);
  return [warning(
    PLANNING_WARNING_CODES.RESTRICTION_BLOCKED,
    "critical",
    "Planningrestrictie van toepassing",
    reasons.length
      ? `Medewerker mag hier niet werken: ${[...new Set(reasons)].join("; ")}.`
      : "Medewerker mag volgens een actieve planningrestrictie niet op deze scope werken.",
  )];
}

function getAbsenceWarnings({ personnel, shift, absences }) {
  const id = personnelId(personnel);
  const interval = getShiftInterval(shift);
  const overlaps = asArray(absences)
    .filter(record => belongsToPersonnel(record, id))
    .map(record => ({ record, interval: dateRangeInterval(record) }))
    .filter(item => item.interval && rangesOverlap(interval, item.interval));

  const active = overlaps.filter(item => ACTIVE_ABSENCE_STATUSES.has(String(item.record.status || "").toLowerCase()));
  const requested = overlaps.filter(item => REQUESTED_ABSENCE_STATUSES.has(String(item.record.status || "").toLowerCase()));
  const warnings = [];

  if (active.length) {
    const labels = [...new Set(active.map(item => ABSENCE_LABELS[item.record.absence_type] || "afwezigheid"))];
    warnings.push(warning(
      PLANNING_WARNING_CODES.ABSENCE_ACTIVE,
      "critical",
      "Medewerker is afwezig",
      `De dienst overlapt met geregistreerde ${labels.join(" en ")}.`,
    ));
  }
  if (requested.length) {
    warnings.push(warning(
      PLANNING_WARNING_CODES.ABSENCE_REQUESTED,
      "warning",
      "Afwezigheidsaanvraag in behandeling",
      "De dienst overlapt met een nog niet beoordeelde afwezigheidsaanvraag.",
    ));
  }
  return warnings;
}

function getAssignmentConflictWarnings({
  personnel,
  shift,
  assignments,
  shifts,
  excludeAssignmentId,
  minimumRestMinutes,
}) {
  const target = getShiftInterval(shift);
  const existing = relevantAssignments({
    assignments,
    shifts,
    personnel,
    targetShift: shift,
    excludeAssignmentId,
  });
  const overlapping = existing.filter(item => rangesOverlap(target, getShiftInterval(item.shift)));
  const warnings = [];

  if (overlapping.length) {
    const labels = overlapping
      .map(item => firstValue(item.shift, ["name", "title", "object_name", "scope_label", "id"]))
      .filter(Boolean);
    warnings.push(warning(
      PLANNING_WARNING_CODES.DOUBLE_BOOKING,
      "critical",
      "Overlappende dienst",
      labels.length
        ? `Overlapt met ${[...new Set(labels)].join(", ")}.`
        : `Overlapt met ${overlapping.length} bestaande dienst${overlapping.length === 1 ? "" : "en"}.`,
    ));
  }

  const minimum = Math.max(0, finiteNumber(minimumRestMinutes) ?? 11 * 60);
  if (minimum > 0) {
    const restGaps = existing
      .map(item => getShiftInterval(item.shift))
      .filter(interval => !rangesOverlap(target, interval))
      .map(interval => {
        if (interval.end <= target.start) return Math.round((target.start - interval.end) / MINUTE_MS);
        if (target.end <= interval.start) return Math.round((interval.start - target.end) / MINUTE_MS);
        return null;
      })
      .filter(value => value !== null && value >= 0 && value < minimum);

    if (restGaps.length) {
      const shortestGap = Math.min(...restGaps);
      warnings.push(warning(
        PLANNING_WARNING_CODES.INSUFFICIENT_REST,
        "warning",
        "Onvoldoende rusttijd",
        `Slechts ${formatMinutesAsHours(shortestGap)} rust; de ingestelde ondergrens is ${formatMinutesAsHours(minimum)}.`,
      ));
    }
  }
  return warnings;
}

function contractEndDate(contract) {
  if (contract.statutory_conversion_applies && !contract.effective_contract_end_date) return null;
  return contract.effective_contract_end_date || contract.contract_end_date || contract.valid_until || null;
}

function contractActiveOn(contract, dateKey, companyId) {
  const status = String(contract.document_status || contract.status || "").toLowerCase();
  if (!ACTIVE_CONTRACT_STATUSES.has(status)) return false;
  if (!companyScopedRecordMatches(contract, companyId)) return false;
  const start = contract.contract_start_date || contract.valid_from;
  const end = contractEndDate(contract);
  return (!start || String(start).slice(0, 10) <= dateKey)
    && (!end || String(end).slice(0, 10) >= dateKey);
}

function contractHours(contract, personnel) {
  const hours = finiteNumber(contract?.contract_hours_per_week)
    ?? finiteNumber(contract?.max_hours_per_week)
    ?? finiteNumber(personnel?.parttime_hours)
    ?? finiteNumber(personnel?.contract_hours_per_week);
  return hours === null ? 0 : Math.max(0, Math.round(hours * 60));
}

function contractLimitMinutes(contract, personnel) {
  const hours = finiteNumber(contract?.max_hours_per_week)
    ?? finiteNumber(contract?.contract_hours_per_week)
    ?? finiteNumber(personnel?.parttime_hours)
    ?? finiteNumber(personnel?.contract_hours_per_week);
  return hours === null ? 0 : Math.max(0, Math.round(hours * 60));
}

function activeContractForShift({ personnel, shift, contracts }) {
  const id = personnelId(personnel);
  const companyId = targetCompanyId(shift);
  const dateKey = toDateKey(getShiftInterval(shift).start);
  return asArray(contracts)
    .filter(record => belongsToPersonnel(record, id))
    .filter(record => contractActiveOn(record, dateKey, companyId))
    .sort((left, right) => String(right.contract_start_date || "").localeCompare(String(left.contract_start_date || "")))[0] || null;
}

function weekBounds(shift) {
  const interval = getShiftInterval(shift);
  if (!interval.valid) return null;
  const start = startOfWeek(interval.start);
  start.setHours(0, 0, 0, 0);
  const end = addDays(start, 7);
  end.setHours(0, 0, 0, 0);
  return { start, end, valid: true };
}

function clippedMinutes(interval, bounds) {
  const start = Math.max(interval.start.getTime(), bounds.start.getTime());
  const end = Math.min(interval.end.getTime(), bounds.end.getTime());
  return Math.max(0, Math.round((end - start) / MINUTE_MS));
}

function scheduledMinutesForCandidate({
  personnel,
  shift,
  assignments,
  shifts,
  excludeAssignmentId,
  includeTarget = true,
}) {
  const bounds = weekBounds(shift);
  if (!bounds) return 0;
  const existingMinutes = relevantAssignments({
    assignments,
    shifts,
    personnel,
    targetShift: shift,
    excludeAssignmentId,
  }).reduce((total, item) => (
    total + clippedMinutes(getShiftInterval(item.shift), bounds)
  ), 0);
  const targetMinutes = includeTarget ? clippedMinutes(getShiftInterval(shift), bounds) : 0;
  return existingMinutes + targetMinutes;
}

function getContractWarnings({
  personnel,
  shift,
  assignments,
  shifts,
  contracts,
  excludeAssignmentId,
  requireActiveContract,
}) {
  const contract = activeContractForShift({ personnel, shift, contracts });
  if (!contract) {
    return {
      contract: null,
      contractMinutes: 0,
      scheduledMinutes: scheduledMinutesForCandidate({
        personnel,
        shift,
        assignments,
        shifts,
        excludeAssignmentId,
      }),
      warnings: requireActiveContract === false
        ? []
        : [warning(
          PLANNING_WARNING_CODES.CONTRACT_MISSING,
          "critical",
          "Geen actief arbeidscontract",
          targetCompanyId(shift)
            ? "Er is op de dienstdatum geen actief contract bij het bedrijf van deze dienst."
            : "Er is op de dienstdatum geen actief arbeidscontract gevonden.",
        )],
    };
  }

  const scheduledMinutes = scheduledMinutesForCandidate({
    personnel,
    shift,
    assignments,
    shifts,
    excludeAssignmentId,
  });
  const resolvedContractMinutes = contractHours(contract, personnel);
  const limitMinutes = contractLimitMinutes(contract, personnel);
  const warnings = limitMinutes > 0 && scheduledMinutes > limitMinutes
    ? [warning(
      PLANNING_WARNING_CODES.CONTRACT_HOURS_EXCEEDED,
      "warning",
      "Contracturen overschreden",
      `Na deze dienst staat ${formatMinutesAsHours(scheduledMinutes)} gepland; de weekgrens is ${formatMinutesAsHours(limitMinutes)}.`,
    )]
    : [];

  return {
    contract,
    contractMinutes: resolvedContractMinutes,
    scheduledMinutes,
    warnings,
  };
}

function warningSort(left, right) {
  const severity = { critical: 0, warning: 1 };
  return (severity[left.severity] ?? 9) - (severity[right.severity] ?? 9)
    || left.code.localeCompare(right.code)
    || left.detail.localeCompare(right.detail);
}

function normalizeWarningInput(input, shift, context) {
  if (input && typeof input === "object" && input.personnel && input.shift) return input;
  return {
    ...(context || {}),
    personnel: input,
    shift,
  };
}

export function getAssignmentWarnings(input, shift, context = {}) {
  const options = normalizeWarningInput(input, shift, context);
  const {
    personnel,
    assignments = [],
    shifts = [],
    absences = personnel?.absences || [],
    qualifications = personnel?.qualifications || [],
    securityPasses = options.security_passes || personnel?.securityPasses || [],
    restrictions = personnel?.restrictions || [],
    contracts = personnel?.contracts || [],
    excludeAssignmentId = null,
    requireActiveContract = true,
  } = options;
  if (!personnel || !options.shift || !getShiftInterval(options.shift).valid) return [];

  const warnings = [];
  if (personnel.status && personnel.status !== "active") {
    warnings.push(warning(
      PLANNING_WARNING_CODES.PERSONNEL_INACTIVE,
      "critical",
      "Medewerker niet actief",
      `De medewerkerstatus is ${String(personnel.status).replaceAll("_", " ")}.`,
    ));
  }
  if (personnel.available_for_planning === false || personnel.planning_available === false) {
    warnings.push(warning(
      PLANNING_WARNING_CODES.PERSONNEL_UNAVAILABLE,
      "critical",
      "Niet beschikbaar voor planning",
      "De medewerker is administratief uitgesloten van planning.",
    ));
  }

  warnings.push(
    ...getAbsenceWarnings({ personnel, shift: options.shift, absences }),
    ...getAssignmentConflictWarnings({
      personnel,
      shift: options.shift,
      assignments,
      shifts,
      excludeAssignmentId,
      minimumRestMinutes: options.minimumRestMinutes
        ?? (finiteNumber(options.minimumRestHours) !== null
          ? Number(options.minimumRestHours) * 60
          : undefined),
    }),
    ...getQualificationWarnings({ personnel, shift: options.shift, qualifications }),
    ...getSecurityPassWarnings({ personnel, shift: options.shift, securityPasses }),
    ...getRestrictionWarnings({ personnel, shift: options.shift, restrictions }),
  );

  const contractResult = getContractWarnings({
    personnel,
    shift: options.shift,
    assignments,
    shifts,
    contracts,
    excludeAssignmentId,
    requireActiveContract,
  });
  warnings.push(...contractResult.warnings);

  return warnings.sort(warningSort);
}

function normalizeRankingInput(input, context) {
  if (Array.isArray(input)) return { ...(context || {}), personnel: input };
  return input || {};
}

function displayName(personnel) {
  return String(
    personnel.name
    || personnel.display_name
    || [personnel.call_name || personnel.first_name, personnel.name_prefix, personnel.last_name].filter(Boolean).join(" ")
    || personnel.id
    || "",
  );
}

export function buildCandidateRanking(input, context = {}) {
  const options = normalizeRankingInput(input, context);
  const candidates = Array.isArray(options.personnel)
    ? options.personnel
    : asArray(options.candidates);

  return candidates
    .map(personnel => {
      const warnings = getAssignmentWarnings({ ...options, personnel, shift: options.shift });
      const criticalCount = warnings.filter(item => item.severity === "critical").length;
      const warningCount = warnings.filter(item => item.severity === "warning").length;
      const contractResult = getContractWarnings({
        personnel,
        shift: options.shift,
        assignments: options.assignments || [],
        shifts: options.shifts || [],
        contracts: options.contracts || personnel.contracts || [],
        excludeAssignmentId: options.excludeAssignmentId,
        requireActiveContract: options.requireActiveContract ?? true,
      });
      const loadRatio = contractResult.contractMinutes > 0
        ? contractResult.scheduledMinutes / contractResult.contractMinutes
        : contractResult.scheduledMinutes / (40 * 60);
      const score = Math.round(
        1000
        - criticalCount * 1000
        - warningCount * 100
        - Math.max(0, loadRatio) * 50,
      );

      return {
        personnel,
        warnings,
        criticalCount,
        warningCount,
        scheduledMinutes: contractResult.scheduledMinutes,
        contractMinutes: contractResult.contractMinutes,
        score,
      };
    })
    .sort((left, right) => (
      left.criticalCount - right.criticalCount
      || left.warningCount - right.warningCount
      || right.score - left.score
      || left.scheduledMinutes - right.scheduledMinutes
      || displayName(left.personnel).localeCompare(displayName(right.personnel), "nl")
    ));
}

export function formatMinutesAsHours(value) {
  const minutes = finiteNumber(value);
  if (minutes === null) return "0u";
  const sign = minutes < 0 ? "-" : "";
  const rounded = Math.round(Math.abs(minutes));
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  if (remainder === 0) return `${sign}${hours}u`;
  if (hours === 0) return `${sign}${remainder}m`;
  return `${sign}${hours}u ${remainder}m`;
}
