import { WEEKDAY_OPTIONS } from "./objectWarningAddressConfig";

const DAY_MINUTES = 24 * 60;
const toMinutes = value => {
  const [hours, minutes] = String(value || "00:00").split(":").map(Number);
  return (hours * 60) + minutes;
};

function mergeIntervals(intervals) {
  return [...intervals].sort((a, b) => a.start - b.start).reduce((merged, interval) => {
    const previous = merged[merged.length - 1];
    if (previous && interval.start <= previous.end) previous.end = Math.max(previous.end, interval.end);
    else merged.push({ ...interval });
    return merged;
  }, []);
}

export function availableIntervalsByDay(record) {
  if (record?.availability_mode === "schedule") {
    return scheduleIntervalsByKind(record).available;
  }
  if (record?.availability_mode !== "not_call_periods") {
    return WEEKDAY_OPTIONS.map(() => [{ start: 0, end: DAY_MINUTES }]);
  }
  const blocked = WEEKDAY_OPTIONS.map(() => []);
  for (const period of record.not_call_periods || []) {
    const start = toMinutes(period.start_time), end = toMinutes(period.end_time);
    for (const day of period.days || []) {
      const index = WEEKDAY_OPTIONS.findIndex(option => option.key === day);
      if (index < 0) continue;
      if (end > start) blocked[index].push({ start, end });
      else {
        blocked[index].push({ start, end: DAY_MINUTES });
        blocked[(index + 1) % 7].push({ start: 0, end });
      }
    }
  }
  return blocked.map(intervals => {
    const available = [], merged = mergeIntervals(intervals);
    let cursor = 0;
    for (const interval of merged) {
      if (interval.start > cursor) available.push({ start: cursor, end: interval.start });
      cursor = Math.max(cursor, interval.end);
    }
    if (cursor < DAY_MINUTES) available.push({ start: cursor, end: DAY_MINUTES });
    return available;
  });
}

export function scheduleIntervalsByKind(record) {
  const result = { available: WEEKDAY_OPTIONS.map(() => []), emergency: WEEKDAY_OPTIONS.map(() => []) };
  for (const period of record?.availability_periods || []) {
    const target = period.kind === "emergency_only" ? result.emergency : result.available;
    const start = toMinutes(period.start_time), end = period.end_time === "24:00" ? DAY_MINUTES : toMinutes(period.end_time);
    for (const day of period.days || []) {
      const index = WEEKDAY_OPTIONS.findIndex(option => option.key === day);
      if (index >= 0 && end > start) target[index].push({ start, end });
    }
  }
  result.available = result.available.map(mergeIntervals);
  result.emergency = result.emergency.map(mergeIntervals);
  return result;
}