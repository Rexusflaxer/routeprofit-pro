import {
  addDays,
  parseDateKey,
  toDateKey,
} from "@/components/planning/planningDomain";

export const CAO_PB_PLANNING_PERIOD_SOURCE = Object.freeze({
  title: "Loonperiodes 2026",
  publisher: "Sociaal Fonds Particuliere Beveiliging",
  url: "https://www.beveiligingsbranche.nl/wp-content/uploads/Loonperiodes-2026.pdf",
});

const CAO_KEY = "cao_particuliere_beveiliging";
const EMPTY_PERIODS = Object.freeze([]);

const OFFICIAL_2026_ROWS = [
  [1, 1, 4, "2025-12-29", "2026-01-25"],
  [2, 5, 8, "2026-01-26", "2026-02-22"],
  [3, 9, 12, "2026-02-23", "2026-03-22"],
  [4, 13, 16, "2026-03-23", "2026-04-19"],
  [5, 17, 20, "2026-04-20", "2026-05-17"],
  [6, 21, 24, "2026-05-18", "2026-06-14"],
  [7, 25, 28, "2026-06-15", "2026-07-12"],
  [8, 29, 32, "2026-07-13", "2026-08-09"],
  [9, 33, 36, "2026-08-10", "2026-09-06"],
  [10, 37, 40, "2026-09-07", "2026-10-04"],
  [11, 41, 44, "2026-10-05", "2026-11-01"],
  [12, 45, 48, "2026-11-02", "2026-11-29"],
  [13, 49, 52, "2026-11-30", "2026-12-27"],
  [14, 53, 53, "2026-12-28", "2027-01-03"],
];

function inclusiveDayCount(startDate, endDate) {
  const start = parseDateKey(startDate);
  const end = parseDateKey(endDate);
  if (!start || !end || end < start) return 0;

  let count = 0;
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    count += 1;
  }
  return count;
}

/**
 * Official CAO PB period ownership is not the same as a Gregorian year:
 * period 1 starts in December 2025 and period 14 ends in January 2027.
 */
export const CAO_PB_PLANNING_PERIODS_2026 = Object.freeze(
  OFFICIAL_2026_ROWS.map(([periodNumber, startWeek, endWeek, startDate, endDate]) => Object.freeze({
    key: `2026-P${String(periodNumber).padStart(2, "0")}`,
    cao_key: CAO_KEY,
    year: 2026,
    period_number: periodNumber,
    start_week: startWeek,
    end_week: endWeek,
    start_date: startDate,
    end_date: endDate,
    duration_days: inclusiveDayCount(startDate, endDate),
    is_extra_period: periodNumber === 14,
    label: `Periode ${periodNumber} - 2026`,
    source_url: CAO_PB_PLANNING_PERIOD_SOURCE.url,
  })),
);

const PERIOD_BY_KEY = new Map(
  CAO_PB_PLANNING_PERIODS_2026.map(period => [period.key, period]),
);

const PERIOD_BY_NUMBER = new Map(
  CAO_PB_PLANNING_PERIODS_2026.map(period => [period.period_number, period]),
);

function dateKey(value) {
  if (value instanceof Date) return toDateKey(value);
  const direct = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || "";
  return direct && parseDateKey(direct) ? direct : "";
}

function periodFromReference(value) {
  if (!value) return null;
  if (typeof value === "object" && !(value instanceof Date)) {
    return getCaoPbPlanningPeriod(value.year ?? value.pay_period_year, value.period_number ?? value.pay_period_number);
  }
  return getCaoPbPlanningPeriodByKey(value) || resolveCaoPbPlanningPeriod(value);
}

export function listCaoPbPlanningPeriods(year) {
  return Number(year) === 2026 ? CAO_PB_PLANNING_PERIODS_2026 : EMPTY_PERIODS;
}

export function getCaoPbPlanningPeriod(year, periodNumber) {
  if (Number(year) !== 2026) return null;
  return PERIOD_BY_NUMBER.get(Number(periodNumber)) || null;
}

export function getCaoPbPlanningPeriodByKey(key) {
  return PERIOD_BY_KEY.get(String(key || "").toUpperCase()) || null;
}

export function resolveCaoPbPlanningPeriod(value) {
  const resolvedDate = dateKey(value);
  if (!resolvedDate) return null;
  return CAO_PB_PLANNING_PERIODS_2026.find(period => (
    period.start_date <= resolvedDate && period.end_date >= resolvedDate
  )) || null;
}

export function getAdjacentCaoPbPlanningPeriod(value, direction) {
  const period = periodFromReference(value);
  if (!period) return null;
  const offset = Number(direction) < 0 ? -1 : Number(direction) > 0 ? 1 : 0;
  if (offset === 0) return period;
  const index = CAO_PB_PLANNING_PERIODS_2026.indexOf(period);
  return CAO_PB_PLANNING_PERIODS_2026[index + offset] || null;
}

export function getCaoPbPlanningRange(value) {
  const period = periodFromReference(value);
  if (!period) return { period: null, start: null, end: null, days: [] };

  const start = parseDateKey(period.start_date);
  const end = parseDateKey(period.end_date);
  const days = Array.from(
    { length: period.duration_days },
    (_, index) => addDays(start, index),
  );

  return { period, start, end, days };
}
