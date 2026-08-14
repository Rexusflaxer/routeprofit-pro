import { describe, expect, it } from "vitest";
import {
  getAmsterdamNow,
  isObjectTaskMomentEditable,
  objectTaskEditableBoundary,
  objectTaskIsoWeek,
  objectTaskWeek,
  objectTaskWeekStrip,
  projectObjectTaskSchedules,
} from "@/components/objects/objectTaskScheduleDomain";

const definition = {
  id: "definition-fire-closing-round",
  status: "active",
  task_type: "fire_closing_round",
  custom_task_type: "Brand- en sluitronde",
};

const series = {
  id: "series-monday-round",
  task_definition_id: definition.id,
  status: "active",
  version: 4,
};

function projectWeek(weekStart, revisions, sourceChanges = []) {
  return projectObjectTaskSchedules({
    definitions: [definition],
    series: [series],
    revisions,
    sourceChanges,
    weekStart,
  });
}

describe("objecttaak-weeknavigatie", () => {
  it("houdt ISO-week 52, 53 en week 1 correct uit elkaar over de jaargrens", () => {
    expect(objectTaskIsoWeek("2020-12-21")).toEqual({ year: 2020, week: 52 });
    expect(objectTaskIsoWeek("2020-12-28")).toEqual({ year: 2020, week: 53 });
    expect(objectTaskIsoWeek("2021-01-03")).toEqual({ year: 2020, week: 53 });
    expect(objectTaskIsoWeek("2021-01-04")).toEqual({ year: 2021, week: 1 });

    expect(objectTaskWeek("2026-12-31")).toMatchObject({
      start: "2026-12-28",
      end: "2027-01-03",
      year: 2026,
      week: 53,
      days: [
        "2026-12-28",
        "2026-12-29",
        "2026-12-30",
        "2026-12-31",
        "2027-01-01",
        "2027-01-02",
        "2027-01-03",
      ],
    });
    expect(objectTaskWeek("2027-01-04")).toMatchObject({ year: 2027, week: 1 });
  });

  it("bouwt de weekstrip chronologisch door van week 53 naar week 1", () => {
    expect(objectTaskWeekStrip("2026-12-28", "2026-12-21", 4).map(item => (
      `${item.year}-W${item.week}`
    ))).toEqual([
      "2026-W52",
      "2026-W53",
      "2027-W1",
      "2027-W2",
    ]);
  });
});

describe("objecttaak bewerken vanaf vandaag en nu", () => {
  it("gebruikt de klok van Europe/Amsterdam en blokkeert verleden en de lopende vijf minuten", () => {
    const now = getAmsterdamNow(new Date("2026-08-14T12:36:30.000Z"));

    expect(now).toMatchObject({
      dateKey: "2026-08-14",
      clock: "14:36",
      weekStart: "2026-08-10",
    });
    expect(objectTaskEditableBoundary("2026-08-13", now)).toBe(24 * 60);
    expect(objectTaskEditableBoundary("2026-08-14", now)).toBe(14 * 60 + 40);
    expect(objectTaskEditableBoundary("2026-08-15", now)).toBe(0);

    expect(isObjectTaskMomentEditable("2026-08-13", 23 * 60 + 55, now)).toBe(false);
    expect(isObjectTaskMomentEditable("2026-08-14", 14 * 60 + 35, now)).toBe(false);
    expect(isObjectTaskMomentEditable("2026-08-14", 14 * 60 + 40, now)).toBe(true);
    expect(isObjectTaskMomentEditable("2026-08-15", 0, now)).toBe(true);
  });

  it("vereist bij een exact vijfminutenmoment alsnog het eerstvolgende tijdvak", () => {
    const now = getAmsterdamNow(new Date("2026-08-14T12:40:00.000Z"));

    expect(objectTaskEditableBoundary("2026-08-14", now)).toBe(14 * 60 + 45);
    expect(isObjectTaskMomentEditable("2026-08-14", 14 * 60 + 40, now)).toBe(false);
    expect(isObjectTaskMomentEditable("2026-08-14", 14 * 60 + 45, now)).toBe(true);
  });

  it("verplaatst de Amsterdamse datum en huidige-weekgrens ook bij UTC-dagovergang", () => {
    expect(getAmsterdamNow(new Date("2026-08-14T22:05:00.000Z"))).toMatchObject({
      dateKey: "2026-08-15",
      clock: "00:05",
      weekStart: "2026-08-10",
    });
  });
});

describe("wekelijkse objecttaakreeks", () => {
  const initialRevision = {
    id: "revision-1",
    series_id: series.id,
    revision_number: 1,
    operation: "schedule",
    effective_from: "2026-08-17",
    recurrence_type: "weekly",
    weekday: 1,
    start_time: "06:30",
    end_time: "18:00",
    end_day_offset: 0,
    recurrence_end_date: "2026-08-31",
  };

  it("neemt de wekelijkse einddatum inclusief mee en stopt in de week erna", () => {
    expect(projectWeek("2026-08-17", [initialRevision])).toEqual([
      expect.objectContaining({ occurrence_date: "2026-08-17", start_time: "06:30" }),
    ]);
    expect(projectWeek("2026-08-24", [initialRevision])).toEqual([
      expect.objectContaining({ occurrence_date: "2026-08-24", start_time: "06:30" }),
    ]);
    expect(projectWeek("2026-08-31", [initialRevision])).toEqual([
      expect.objectContaining({ occurrence_date: "2026-08-31", start_time: "06:30" }),
    ]);
    expect(projectWeek("2026-09-07", [initialRevision])).toEqual([]);
  });

  it("past een wijziging alleen toe vanaf de gekozen occurrence", () => {
    const changedFromWeek24 = {
      id: "revision-2",
      series_id: series.id,
      revision_number: 2,
      operation: "schedule",
      effective_from: "2026-08-24",
      recurrence_type: "weekly",
      weekday: 1,
      start_time: "10:00",
      end_time: "18:00",
      end_day_offset: 0,
      recurrence_end_date: null,
    };

    expect(projectWeek("2026-08-17", [initialRevision, changedFromWeek24])).toEqual([
      expect.objectContaining({
        occurrence_date: "2026-08-17",
        start_time: "06:30",
        revision_id: "revision-1",
      }),
    ]);
    expect(projectWeek("2026-08-24", [initialRevision, changedFromWeek24])).toEqual([
      expect.objectContaining({
        occurrence_date: "2026-08-24",
        start_time: "10:00",
        revision_id: "revision-2",
      }),
    ]);
    expect(projectWeek("2026-09-07", [initialRevision, changedFromWeek24])).toEqual([
      expect.objectContaining({ occurrence_date: "2026-09-07", start_time: "10:00" }),
    ]);
  });

  it("stopt de reeks vanaf de gekozen occurrence zonder eerdere weken te verwijderen", () => {
    const stoppedFromWeek31 = {
      id: "revision-3",
      series_id: series.id,
      revision_number: 3,
      operation: "stop",
      effective_from: "2026-08-31",
      recurrence_type: "weekly",
      weekday: 1,
    };

    expect(projectWeek("2026-08-24", [initialRevision, stoppedFromWeek31])).toEqual([
      expect.objectContaining({ occurrence_date: "2026-08-24" }),
    ]);
    expect(projectWeek("2026-08-31", [initialRevision, stoppedFromWeek31])).toEqual([]);
    expect(projectWeek("2026-09-07", [initialRevision, stoppedFromWeek31])).toEqual([]);
  });

  it("markeert een open planningimpact uitsluitend op de bijbehorende occurrence", () => {
    const openChange = {
      id: "source-change-1",
      schedule_series_id: series.id,
      service_date: "2026-08-24",
      status: "open",
      change_type: "schedule_changed",
    };

    expect(projectWeek("2026-08-17", [initialRevision], [openChange])[0]?.source_change).toBeNull();
    expect(projectWeek("2026-08-24", [initialRevision], [openChange])[0]?.source_change).toMatchObject({
      id: "source-change-1",
      service_date: "2026-08-24",
    });
  });
});
