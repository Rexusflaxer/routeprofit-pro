export const localDateKey = date => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const overrideForDate = (record, date) => {
  const key = localDateKey(date);
  return (record?.specific_availability_overrides || []).find(item => item.dates?.includes(key)) || null;
};

export const expandDateRange = range => {
  if (!range?.from) return [];
  const end = range.to || range.from;
  const dates = [];
  for (const cursor = new Date(range.from); cursor <= end; cursor.setDate(cursor.getDate() + 1)) dates.push(localDateKey(cursor));
  return dates;
};

export const overrideStatusLabel = status => status === "available" ? "Bereikbaar" : status === "emergency_only" ? "Alleen noodgevallen" : "Niet bereikbaar";

const toMinutes = value => value === "24:00" ? 1440 : String(value || "00:00").split(":").map(Number).reduce((hours, minutes) => (hours * 60) + minutes);
const toTime = minutes => minutes === 1440 ? "24:00" : `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export function overrideIntervalsByKind(override) {
  const result = { available: [], emergency: [] };
  if (!override) return result;
  if (Array.isArray(override.availability_periods) && (override.availability_status == null || override.availability_periods.length > 0)) {
    override.availability_periods.forEach(period => {
      const interval = { start: toMinutes(period.start_time), end: toMinutes(period.end_time) };
      (period.kind === "emergency_only" ? result.emergency : result.available).push(interval);
    });
    return result;
  }
  const fullDay = [{ start: 0, end: 1440 }];
  if (override.availability_status === "available") result.available = fullDay;
  if (override.availability_status === "emergency_only") result.emergency = fullDay;
  return result;
}

export function intervalsToSlots(available = [], emergency = []) {
  const slots = Array(48).fill(null);
  available.forEach(interval => { for (let slot = Math.floor(interval.start / 30); slot < Math.ceil(interval.end / 30); slot += 1) slots[slot] = "available"; });
  emergency.forEach(interval => { for (let slot = Math.floor(interval.start / 30); slot < Math.ceil(interval.end / 30); slot += 1) slots[slot] = "emergency_only"; });
  return slots;
}

export function slotsToOverridePeriods(slots) {
  const periods = [];
  for (let start = 0; start < 48;) {
    const kind = slots[start];
    if (!kind) { start += 1; continue; }
    let end = start + 1;
    while (end < 48 && slots[end] === kind) end += 1;
    periods.push({ start_time: toTime(start * 30), end_time: toTime(end * 30), kind });
    start = end;
  }
  return periods;
}