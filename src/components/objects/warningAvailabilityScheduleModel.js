import { WEEKDAY_OPTIONS } from "./objectWarningAddressConfig";
import { availableIntervalsByDay } from "./warningAvailabilityTimeline";

export const SLOT_MINUTES = 30;
export const SLOT_COUNT = 48;
export const EMPTY_SCHEDULE = () => WEEKDAY_OPTIONS.map(() => Array(SLOT_COUNT).fill(null));

const toMinutes = value => value === "24:00" ? 1440 : String(value || "00:00").split(":").map(Number).reduce((hours, minutes) => (hours * 60) + minutes);
const toTime = minutes => minutes === 1440 ? "24:00" : `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export function periodsToSchedule(periods = []) {
  const schedule = EMPTY_SCHEDULE();
  periods.forEach(period => (period.days || []).forEach(day => {
    const dayIndex = WEEKDAY_OPTIONS.findIndex(option => option.key === day);
    if (dayIndex < 0) return;
    const start = Math.floor(toMinutes(period.start_time) / SLOT_MINUTES);
    const end = Math.ceil(toMinutes(period.end_time) / SLOT_MINUTES);
    for (let slot = start; slot < Math.min(end, SLOT_COUNT); slot += 1) schedule[dayIndex][slot] = period.kind;
  }));
  return schedule;
}

export function scheduleToPeriods(schedule) {
  return schedule.flatMap((slots, dayIndex) => {
    const periods = [];
    let start = 0;
    while (start < SLOT_COUNT) {
      const kind = slots[start];
      if (!kind) { start += 1; continue; }
      let end = start + 1;
      while (end < SLOT_COUNT && slots[end] === kind) end += 1;
      periods.push({ days: [WEEKDAY_OPTIONS[dayIndex].key], start_time: toTime(start * SLOT_MINUTES), end_time: toTime(end * SLOT_MINUTES), kind });
      start = end;
    }
    return periods;
  });
}

export function recordToAvailabilityPeriods(record) {
  if (!record) return [];
  if (record.availability_mode === "schedule") return Array.isArray(record.availability_periods) ? record.availability_periods : [];
  return availableIntervalsByDay(record).flatMap((intervals, dayIndex) => intervals.map(interval => ({ days: [WEEKDAY_OPTIONS[dayIndex].key], start_time: toTime(interval.start), end_time: toTime(interval.end), kind: "available" })));
}
