const OFFICIAL_CAO_PB_WAGE_TABLES = [
  {
    year: 2025,
    valid_from: "2024-12-30",
    valid_until: "2025-12-28",
    source_url: "https://www.beveiligingsbranche.nl/wp-content/uploads/Salarisschaal-per-loonperiode-1-2025-per-uur-en-per-4-weken-1.pdf",
    hourly_rates: {
      2: { 0: 16.02, 1: 16.38 },
      3: { 1: 16.73, 2: 17.09, 3: 17.45, 4: 17.80, 5: 18.16, 6: 18.52, 7: 18.87, 8: 19.23, 9: 19.58, 10: 19.94 },
      4: { 2: 17.45, 3: 17.80, 4: 18.16, 5: 18.52, 6: 18.87, 7: 19.23, 8: 19.58, 9: 19.94, 10: 20.30, 11: 20.65, 12: 21.01 },
      5: { 4: 18.52, 5: 18.87, 6: 19.23, 7: 19.58, 8: 19.94, 9: 20.30, 10: 20.65, 11: 21.01, 12: 21.36, 13: 21.72 },
      6: { 5: 19.23, 6: 19.58, 7: 19.94, 8: 20.30, 9: 20.65, 10: 21.01, 11: 21.36, 12: 21.72, 13: 22.08, 14: 22.43 },
      7: { 6: 20.30, 7: 20.65, 8: 21.01, 9: 21.36, 10: 21.72, 11: 22.08, 12: 22.43, 13: 22.79, 14: 23.14, 15: 23.52, 16: 23.89 },
    },
  },
  {
    year: 2026,
    valid_from: "2025-12-29",
    valid_until: "2026-12-27",
    source_url: "https://www.beveiligingsbranche.nl/wp-content/uploads/Salarisschaal-per-loonperiode-1-2026-per-uur-en-per-4-weken.pdf",
    hourly_rates: {
      2: { 0: 16.63, 1: 17.00 },
      3: { 1: 17.37, 2: 17.74, 3: 18.11, 4: 18.48, 5: 18.85, 6: 19.22, 7: 19.59, 8: 19.96, 9: 20.33, 10: 20.70 },
      4: { 2: 18.11, 3: 18.48, 4: 18.85, 5: 19.22, 6: 19.59, 7: 19.96, 8: 20.33, 9: 20.70, 10: 21.07, 11: 21.44, 12: 21.81 },
      5: { 4: 19.22, 5: 19.59, 6: 19.96, 7: 20.33, 8: 20.70, 9: 21.07, 10: 21.44, 11: 21.81, 12: 22.18, 13: 22.55 },
      6: { 5: 19.96, 6: 20.33, 7: 20.70, 8: 21.07, 9: 21.44, 10: 21.81, 11: 22.18, 12: 22.55, 13: 22.92, 14: 23.29 },
      7: { 6: 21.07, 7: 21.44, 8: 21.81, 9: 22.18, 10: 22.55, 11: 22.92, 12: 23.29, 13: 23.66, 14: 24.02, 15: 24.41, 16: 24.80 },
    },
  },
];

function isoDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const direct = String(value).match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (direct) return direct;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

export function getOfficialPbWageTable(referenceDate) {
  const date = isoDate(referenceDate);
  if (!date) return null;
  return OFFICIAL_CAO_PB_WAGE_TABLES.find(table => table.valid_from <= date && table.valid_until >= date) || null;
}

export function getOfficialPbWageTableYear(referenceDate) {
  return getOfficialPbWageTable(referenceDate)?.year || null;
}

export function getOfficialPbWageRows(referenceDate) {
  const table = getOfficialPbWageTable(referenceDate);
  if (!table) return [];
  return Object.entries(table.hourly_rates).flatMap(([scale, periods]) => (
    Object.entries(periods).map(([period, hourlyRate]) => ({
      year: table.year,
      scale: Number(scale),
      period: Number(period),
      hourly_rate: hourlyRate,
      valid_from: table.valid_from,
      valid_until: table.valid_until,
      source: "official_cao_pb_fallback",
      source_url: table.source_url,
    }))
  ));
}

export { OFFICIAL_CAO_PB_WAGE_TABLES };
