export const OBJECT_TASK_RECURRENCE_OPTIONS = [
  { key: "once", type: "one_time", interval: 1, label: "Eenmalig" },
  { key: "weekly-1", type: "weekly", interval: 1, label: "Elke week" },
  { key: "weekly-2", type: "weekly", interval: 2, label: "Elke 2 weken" },
  { key: "weekly-3", type: "weekly", interval: 3, label: "Elke 3 weken" },
  { key: "weekly-4", type: "weekly", interval: 4, label: "Elke 4 weken" },
  { key: "monthly-1", type: "monthly", interval: 1, label: "Elke maand" },
  { key: "monthly-3", type: "monthly", interval: 3, label: "Elk kwartaal" },
  { key: "monthly-6", type: "monthly", interval: 6, label: "Elk halfjaar" },
  { key: "yearly-1", type: "yearly", interval: 1, label: "Elk jaar" },
];

export function objectTaskRecurrence(entry = {}) {
  const type = entry.recurrence_type || entry.frequency || "one_time";
  const normalizedType = ["weekly", "monthly", "yearly"].includes(type) ? type : "one_time";
  const interval = normalizedType === "one_time" ? 1 : Math.max(1, Number(entry.recurrence_interval || entry.revision?.recurrence_interval || entry.revision?.metadata?.recurrence_interval || 1));
  const key = normalizedType === "one_time" ? "once" : `${normalizedType}-${interval}`;
  return { type: normalizedType, interval, key, repeating: normalizedType !== "one_time" };
}

export function objectTaskRecurrenceLabel(entry = {}) {
  const pattern = objectTaskRecurrence(entry);
  return OBJECT_TASK_RECURRENCE_OPTIONS.find(option => option.key === pattern.key)?.label
    || (pattern.type === "weekly" ? `Elke ${pattern.interval} weken` : pattern.type === "monthly" ? `Elke ${pattern.interval} maanden` : `Elke ${pattern.interval} jaar`);
}

export function objectTaskRecursOn(entry, date) {
  const pattern = objectTaskRecurrence(entry);
  const anchor = entry.effective_from || entry.occurrence_date;
  if (!anchor || date < anchor) return false;
  if (!pattern.repeating) return date === anchor;
  const start = new Date(`${anchor}T12:00:00Z`), target = new Date(`${date}T12:00:00Z`);
  if (pattern.type === "weekly") return Math.round((target - start) / 86400000) % (pattern.interval * 7) === 0;
  const monthDelta = (target.getUTCFullYear() - start.getUTCFullYear()) * 12 + target.getUTCMonth() - start.getUTCMonth();
  const wantedDay = Math.min(start.getUTCDate(), new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate());
  if (pattern.type === "monthly") return monthDelta % pattern.interval === 0 && target.getUTCDate() === wantedDay;
  return (target.getUTCFullYear() - start.getUTCFullYear()) % pattern.interval === 0 && target.getUTCMonth() === start.getUTCMonth() && target.getUTCDate() === wantedDay;
}