import {
  addObjectTaskDays,
  createObjectTaskClientId,
  objectTaskClockToMinutes,
} from "./objectTaskScheduleDomain";

const toTime = value => value === 1440
  ? "24:00"
  : `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;

export function remainingTaskIntervals(entry, eraseStart, eraseEnd) {
  const start = objectTaskClockToMinutes(entry.start_time);
  const end = objectTaskClockToMinutes(entry.end_time);
  if (start == null || end == null || eraseEnd <= start || eraseStart >= end) {
    return [{ start, end }];
  }
  return [
    { start, end: Math.min(end, eraseStart) },
    { start: Math.max(start, eraseEnd), end },
  ].filter(interval => interval.end > interval.start);
}

export function eraseTaskOccurrence(source, occurrenceDate, eraseStart, eraseEnd) {
  const remaining = remainingTaskIntervals(source, eraseStart, eraseEnd);
  const startsLater = source.frequency === "weekly" && occurrenceDate > source.occurrence_date;
  const prefix = startsLater
    ? [{ ...source, repeat_until: addObjectTaskDays(occurrenceDate, -1) }]
    : [];
  return [
    ...prefix,
    ...remaining.map((interval, index) => ({
      ...source,
      client_id: startsLater || index > 0 ? createObjectTaskClientId() : source.client_id,
      occurrence_date: occurrenceDate,
      start_time: toTime(interval.start),
      end_time: toTime(interval.end),
    })),
  ];
}