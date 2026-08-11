import { WEEKDAY_OPTIONS } from "./objectWarningAddressConfig";

export const TASK_SLOT_MINUTES = 5;
export const TASK_SLOT_COUNT = 1440 / TASK_SLOT_MINUTES;
export const EMPTY_TASK_SCHEDULE = () => WEEKDAY_OPTIONS.map(() => Array(TASK_SLOT_COUNT).fill(null));

const toMinutes = value => value === "24:00" ? 1440 : String(value || "00:00").split(":").map(Number).reduce((hours, minutes) => (hours * 60) + minutes);
const toTime = minutes => minutes === 1440 ? "24:00" : `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export function taskPeriodsToSchedule(periods = []) {
  const schedule = EMPTY_TASK_SCHEDULE();
  periods.forEach(period => (period.days || []).forEach(day => {
    const dayIndex = WEEKDAY_OPTIONS.findIndex(option => option.key === day);
    if (dayIndex < 0) return;
    const start = Math.floor(toMinutes(period.start_time) / TASK_SLOT_MINUTES);
    const end = Math.ceil(toMinutes(period.end_time) / TASK_SLOT_MINUTES);
    for (let slot = start; slot < Math.min(end, TASK_SLOT_COUNT); slot += 1) schedule[dayIndex][slot] = "available";
  }));
  return schedule;
}

export function taskScheduleToPeriods(schedule) {
  return schedule.flatMap((slots, dayIndex) => {
    const periods = [];
    for (let start = 0; start < TASK_SLOT_COUNT;) {
      if (!slots[start]) { start += 1; continue; }
      let end = start + 1;
      while (end < TASK_SLOT_COUNT && slots[end]) end += 1;
      periods.push({ days: [WEEKDAY_OPTIONS[dayIndex].key], start_time: toTime(start * TASK_SLOT_MINUTES), end_time: toTime(end * TASK_SLOT_MINUTES) });
      start = end;
    }
    return periods;
  });
}