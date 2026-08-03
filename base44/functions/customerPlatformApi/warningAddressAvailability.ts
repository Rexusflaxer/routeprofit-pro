type LooseRecord = Record<string, any>;

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const KINDS = new Set(['available', 'emergency_only']);
const START_PATTERN = /^([01]\d|2[0-3]):(?:00|30)$/;
const END_PATTERN = /^(?:([01]\d|2[0-3]):(?:00|30)|24:00)$/;

class AvailabilityError extends Error {
  status = 400;
}

export function normalizeWarningAvailabilityPeriods(value: unknown, availabilityMode: string) {
  if (availabilityMode !== 'schedule') return [];
  if (!Array.isArray(value)) throw new AvailabilityError('availability_periods moet een lijst zijn');
  if (value.length > 336) throw new AvailabilityError('Het weekrooster bevat te veel blokken');
  return value.map((period, index) => {
    if (!period || typeof period !== 'object' || Array.isArray(period)) throw new AvailabilityError(`Roosterblok ${index + 1} is ongeldig`);
    const item = period as LooseRecord;
    const days = Array.isArray(item.days) ? [...new Set(item.days.map(value => String(value || '').trim()))] : [];
    const startTime = String(item.start_time || '').trim();
    const endTime = String(item.end_time || '').trim();
    const kind = String(item.kind || '').trim();
    if (days.length !== 1 || !DAYS.includes(days[0] as string)) throw new AvailabilityError(`Roosterblok ${index + 1} heeft geen geldige dag`);
    if (!START_PATTERN.test(startTime) || !END_PATTERN.test(endTime) || startTime >= endTime) throw new AvailabilityError(`Roosterblok ${index + 1} moet op halve uren liggen`);
    if (!KINDS.has(kind)) throw new AvailabilityError(`Roosterblok ${index + 1} heeft geen geldige bereikbaarheid`);
    return { days, start_time: startTime, end_time: endTime, kind };
  });
}