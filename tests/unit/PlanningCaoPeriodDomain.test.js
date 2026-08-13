import { describe, expect, it } from "vitest";
import {
  CAO_PB_PLANNING_PERIOD_SOURCE,
  CAO_PB_PLANNING_PERIODS_2026,
  getAdjacentCaoPbPlanningPeriod,
  getCaoPbPlanningPeriod,
  getCaoPbPlanningPeriodByKey,
  getCaoPbPlanningRange,
  listCaoPbPlanningPeriods,
  resolveCaoPbPlanningPeriod,
} from "@/components/planning/planningCaoPeriodDomain";
import { addDays, parseDateKey, toDateKey } from "@/components/planning/planningDomain";

const EXPECTED_2026_PERIODS = [
  [1, 1, 4, "2025-12-29", "2026-01-25", false],
  [2, 5, 8, "2026-01-26", "2026-02-22", false],
  [3, 9, 12, "2026-02-23", "2026-03-22", false],
  [4, 13, 16, "2026-03-23", "2026-04-19", false],
  [5, 17, 20, "2026-04-20", "2026-05-17", false],
  [6, 21, 24, "2026-05-18", "2026-06-14", false],
  [7, 25, 28, "2026-06-15", "2026-07-12", false],
  [8, 29, 32, "2026-07-13", "2026-08-09", false],
  [9, 33, 36, "2026-08-10", "2026-09-06", false],
  [10, 37, 40, "2026-09-07", "2026-10-04", false],
  [11, 41, 44, "2026-10-05", "2026-11-01", false],
  [12, 45, 48, "2026-11-02", "2026-11-29", false],
  [13, 49, 52, "2026-11-30", "2026-12-27", false],
  [14, 53, 53, "2026-12-28", "2027-01-03", true],
];

describe("officiële CAO PB-planningperioden 2026", () => {
  it("bevat exact de veertien gepubliceerde perioden en bronmetadata", () => {
    expect(CAO_PB_PLANNING_PERIODS_2026.map(period => [
      period.period_number,
      period.start_week,
      period.end_week,
      period.start_date,
      period.end_date,
      period.is_extra_period,
    ])).toEqual(EXPECTED_2026_PERIODS);
    expect(CAO_PB_PLANNING_PERIOD_SOURCE.url).toBe(
      "https://www.beveiligingsbranche.nl/wp-content/uploads/Loonperiodes-2026.pdf",
    );
    expect(CAO_PB_PLANNING_PERIODS_2026.every(period => (
      period.source_url === CAO_PB_PLANNING_PERIOD_SOURCE.url
      && period.cao_key === "cao_particuliere_beveiliging"
    ))).toBe(true);
  });

  it("houdt de officiële records onveranderlijk en benoemt ze voor de interface", () => {
    expect(Object.isFrozen(CAO_PB_PLANNING_PERIODS_2026)).toBe(true);
    expect(CAO_PB_PLANNING_PERIODS_2026.every(Object.isFrozen)).toBe(true);
    expect(getCaoPbPlanningPeriod(2026, 9)).toMatchObject({
      key: "2026-P09",
      label: "Periode 9 - 2026",
    });
    expect(getCaoPbPlanningPeriodByKey("2026-p14")).toMatchObject({
      period_number: 14,
      label: "Periode 14 - 2026",
    });
    expect(listCaoPbPlanningPeriods("2026")).toBe(CAO_PB_PLANNING_PERIODS_2026);
    expect(listCaoPbPlanningPeriods(2025)).toEqual([]);
  });

  it("kent perioden toe op officiële inclusieve datumgrenzen, ook over jaargrenzen", () => {
    expect(resolveCaoPbPlanningPeriod("2025-12-28")).toBeNull();
    expect(resolveCaoPbPlanningPeriod("2025-12-29")?.period_number).toBe(1);
    expect(resolveCaoPbPlanningPeriod("2026-01-25")?.period_number).toBe(1);
    expect(resolveCaoPbPlanningPeriod("2026-01-26")?.period_number).toBe(2);
    expect(resolveCaoPbPlanningPeriod("2026-08-13")?.period_number).toBe(9);
    expect(resolveCaoPbPlanningPeriod("2026-12-27")?.period_number).toBe(13);
    expect(resolveCaoPbPlanningPeriod("2026-12-28")?.period_number).toBe(14);
    expect(resolveCaoPbPlanningPeriod("2027-01-03")?.period_number).toBe(14);
    expect(resolveCaoPbPlanningPeriod("2027-01-04")).toBeNull();
  });

  it("accepteert Date- en ISO-datetimewaarden zonder UTC-datumverschuiving", () => {
    expect(resolveCaoPbPlanningPeriod(parseDateKey("2026-08-13"))?.period_number).toBe(9);
    expect(resolveCaoPbPlanningPeriod("2026-08-13T23:59:59+02:00")?.period_number).toBe(9);
    expect(resolveCaoPbPlanningPeriod("geen-datum")).toBeNull();
  });

  it("vormt 28-daagse perioden en de eenweekse extra periode zonder zomertijdsdrift", () => {
    const springRange = getCaoPbPlanningRange("2026-P04");
    expect(springRange.period?.period_number).toBe(4);
    expect(springRange.days).toHaveLength(28);
    expect(springRange.days.map(toDateKey)).toEqual(
      Array.from({ length: 28 }, (_, index) => toDateKey(addDays("2026-03-23", index))),
    );
    expect(toDateKey(springRange.start)).toBe("2026-03-23");
    expect(toDateKey(springRange.end)).toBe("2026-04-19");

    const extraRange = getCaoPbPlanningRange({ year: 2026, period_number: 14 });
    expect(extraRange.days).toHaveLength(7);
    expect(extraRange.days.map(toDateKey)).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ]);
  });

  it("navigeert op perioderecords in plaats van met een vaste stap van 28 dagen", () => {
    expect(getAdjacentCaoPbPlanningPeriod("2026-P08", 1)?.period_number).toBe(9);
    expect(getAdjacentCaoPbPlanningPeriod("2026-08-13", -1)?.period_number).toBe(8);
    expect(getAdjacentCaoPbPlanningPeriod({ pay_period_year: 2026, pay_period_number: 13 }, 1)?.period_number).toBe(14);
    expect(getAdjacentCaoPbPlanningPeriod("2026-P14", 1)).toBeNull();
    expect(getAdjacentCaoPbPlanningPeriod("2026-P01", -1)).toBeNull();
  });

  it("heeft geen gaten of overlap en begint/eindigt steeds op maandag/zondag", () => {
    CAO_PB_PLANNING_PERIODS_2026.forEach((period, index) => {
      expect(parseDateKey(period.start_date)?.getDay()).toBe(1);
      expect(parseDateKey(period.end_date)?.getDay()).toBe(0);
      expect(period.duration_days).toBe(period.is_extra_period ? 7 : 28);

      const nextPeriod = CAO_PB_PLANNING_PERIODS_2026[index + 1];
      if (nextPeriod) {
        expect(toDateKey(addDays(period.end_date, 1))).toBe(nextPeriod.start_date);
      }
    });
  });

  it("geeft een lege range terug voor onbekende perioden", () => {
    expect(getCaoPbPlanningPeriod(2026, 15)).toBeNull();
    expect(getCaoPbPlanningPeriod(2027, 1)).toBeNull();
    expect(getCaoPbPlanningPeriodByKey("2026-P15")).toBeNull();
    expect(getCaoPbPlanningRange("2026-P15")).toEqual({
      period: null,
      start: null,
      end: null,
      days: [],
    });
  });
});
