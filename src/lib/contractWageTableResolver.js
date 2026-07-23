import { getOfficialPbWageRows, getOfficialPbWageTableYear } from "./caoPbWageTables.js";

const CAO_PARTICULIERE_BEVEILIGING_KEY = "cao_particuliere_beveiliging";

function dateKey(value, fallback = "") {
  if (!value) return fallback;
  return String(value).slice(0, 10);
}

function getYear(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().getFullYear() : date.getFullYear();
}

function getSalaryTables(option) {
  return option?.salary_tables || option?.salaryTables || option?.wage_tables || option?.wageTables || option?.scales || [];
}

function mapConfiguredWageRow(row, targetYear) {
  return {
    year: row.year || targetYear,
    scale: row.scale,
    period: row.period,
    hourlyRate: row.hourly_rate,
    validFrom: row.valid_from || null,
    validUntil: row.valid_until || null,
    source: row.source || "cao_configuration",
    sourceUrl: row.source_url || null,
    label: `Schaal ${row.scale ?? "-"} / periodiek ${row.period ?? "-"}`,
  };
}

function mapOfficialPbWageRows(referenceDate) {
  return getOfficialPbWageRows(referenceDate).map(row => ({
    year: row.year,
    scale: row.scale,
    period: row.period,
    hourlyRate: row.hourly_rate,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    source: row.source,
    sourceUrl: row.source_url,
    label: `Schaal ${row.scale} / periodiek ${row.period}`,
  }));
}

export function resolveContractWageRows(option, referenceDate, caoKey) {
  const targetDate = dateKey(referenceDate);
  const calendarYear = getYear(referenceDate || new Date());
  const officialPbYear = caoKey === CAO_PARTICULIERE_BEVEILIGING_KEY
    ? getOfficialPbWageTableYear(referenceDate)
    : null;
  const targetYear = officialPbYear || calendarYear;
  const normalizedOptions = Array.isArray(option?.wage_options) ? option.wage_options : [];

  if (normalizedOptions.length > 0) {
    const dateBoundRows = normalizedOptions.filter(row => (
      targetDate
      && row.valid_from
      && row.valid_until
      && String(row.valid_from).slice(0, 10) <= targetDate
      && String(row.valid_until).slice(0, 10) >= targetDate
    ));
    const exactYearRows = normalizedOptions.filter(row => targetYear && Number(row.year) === Number(targetYear));
    const unversionedRows = normalizedOptions.filter(row => !row.year);
    const selectedRows = dateBoundRows.length > 0
      ? dateBoundRows
      : exactYearRows.length > 0
        ? exactYearRows
        : caoKey === CAO_PARTICULIERE_BEVEILIGING_KEY && officialPbYear
          ? []
          : unversionedRows;
    if (selectedRows.length > 0) {
      return selectedRows.map(row => mapConfiguredWageRow(row, targetYear));
    }
  }

  if (caoKey === CAO_PARTICULIERE_BEVEILIGING_KEY) {
    const officialRows = mapOfficialPbWageRows(referenceDate);
    if (officialRows.length > 0) return officialRows;
  }

  if (normalizedOptions.length > 0) {
    return normalizedOptions
      .filter(row => !row.year)
      .map(row => mapConfiguredWageRow(row, targetYear));
  }

  const rows = [];
  getSalaryTables(option).forEach(table => {
    const tableYear = Number(table.year || table.valid_year || table.period_year || table.effective_year || "");
    if (targetYear && tableYear && tableYear !== Number(targetYear)) return;
    const scales = table.scales || table.salary_scales || table.rows || [];
    scales.forEach(scale => {
      const scaleNumber = scale.scale ?? scale.schaal ?? scale.number ?? scale.level;
      const periods = scale.periods || scale.steps || scale.periodieken || scale.rows || [];
      if (Array.isArray(periods) && periods.length > 0) {
        periods.forEach(period => {
          const periodNumber = period.period ?? period.periodic ?? period.step ?? period.trede ?? period.number;
          const hourlyRate = period.hourly_rate ?? period.hourlyRate ?? period.rate ?? period.amount ?? period.value;
          rows.push({
            year: tableYear || targetYear,
            scale: scaleNumber,
            period: periodNumber,
            hourlyRate,
            label: `Schaal ${scaleNumber ?? "-"} / trede ${periodNumber ?? "-"}`,
          });
        });
      } else if (scale.hourly_rate || scale.rate || scale.amount) {
        rows.push({
          year: tableYear || targetYear,
          scale: scaleNumber,
          period: scale.period ?? scale.trede ?? 0,
          hourlyRate: scale.hourly_rate ?? scale.rate ?? scale.amount,
          label: `Schaal ${scaleNumber ?? "-"} / trede ${scale.period ?? scale.trede ?? 0}`,
        });
      }
    });
  });
  return rows;
}
