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
import { objectTaskRecursOn } from "@/components/objects/objectTaskRecurrence";

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
  current_revision_id: "revision-1",
};

function projectWeek(weekStart, revisions, sourceChanges = []) {
  const connectedRevisions = [...revisions]
    .sort((left, right) => Number(left.revision_number || 0) - Number(right.revision_number || 0))
    .map((revision, index, ordered) => ({
      ...revision,
      ...(index > 0 && !revision.previous_revision_id
        ? { previous_revision_id: ordered[index - 1].id }
        : {}),
    }));
  return projectObjectTaskSchedules({
    definitions: [definition],
    series: [{
      ...series,
      current_revision_id: connectedRevisions.at(-1)?.id || null,
    }],
    revisions: connectedRevisions,
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

describe("stabiele herhalingsankers", () => {
  it("behoudt bij een latere revisie de fase van een tweewekelijkse reeks", () => {
    const revised = {
      effective_from: "2026-08-24",
      recurrence_anchor_date: "2026-08-17",
      recurrence_type: "weekly",
      recurrence_interval: 2,
    };

    expect(objectTaskRecursOn(revised, "2026-08-24")).toBe(false);
    expect(objectTaskRecursOn(revised, "2026-08-31")).toBe(true);
    expect(objectTaskRecursOn(revised, "2026-09-07")).toBe(false);
    expect(objectTaskRecursOn(revised, "2026-09-14")).toBe(true);
  });

  it("klemt een maandultimo-anker op de laatste dag van kortere maanden", () => {
    const monthly = {
      effective_from: "2026-01-31",
      recurrence_anchor_date: "2026-01-31",
      recurrence_type: "monthly",
      recurrence_interval: 1,
    };

    expect(objectTaskRecursOn(monthly, "2026-02-27")).toBe(false);
    expect(objectTaskRecursOn(monthly, "2026-02-28")).toBe(true);
    expect(objectTaskRecursOn(monthly, "2026-03-31")).toBe(true);
    expect(objectTaskRecursOn(monthly, "2026-04-30")).toBe(true);
  });

  it("projecteert een jaarlijks schrikkeljaaranker op 28 februari en terug op 29 februari", () => {
    const yearly = {
      effective_from: "2024-02-29",
      recurrence_anchor_date: "2024-02-29",
      recurrence_type: "yearly",
      recurrence_interval: 1,
    };

    expect(objectTaskRecursOn(yearly, "2025-02-28")).toBe(true);
    expect(objectTaskRecursOn(yearly, "2025-03-01")).toBe(false);
    expect(objectTaskRecursOn(yearly, "2028-02-28")).toBe(false);
    expect(objectTaskRecursOn(yearly, "2028-02-29")).toBe(true);
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
    expect(projectWeek("2026-08-10", [initialRevision])).toEqual([]);
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

  it("negeert een orphan revisie die niet bereikbaar is vanaf current_revision_id", () => {
    const connectedRevision = {
      ...initialRevision,
      id: "revision-connected",
      previous_revision_id: initialRevision.id,
      revision_number: 2,
      effective_from: "2026-08-24",
      recurrence_end_date: null,
      start_time: "07:00",
      end_time: "17:00",
    };
    const orphanRevision = {
      ...connectedRevision,
      id: "revision-orphan",
      previous_revision_id: initialRevision.id,
      revision_number: 99,
      start_time: "13:00",
      end_time: "14:00",
    };

    const projected = projectObjectTaskSchedules({
      definitions: [definition],
      series: [{ ...series, current_revision_id: connectedRevision.id }],
      revisions: [initialRevision, orphanRevision, connectedRevision],
      weekStart: "2026-08-24",
    });

    expect(projected).toEqual([
      expect.objectContaining({
        revision_id: connectedRevision.id,
        start_time: "07:00",
        end_time: "17:00",
      }),
    ]);
  });

  it("projecteert fail-closed wanneer de aangewezen current revisie ontbreekt", () => {
    const projected = projectObjectTaskSchedules({
      definitions: [definition],
      series: [{ ...series, current_revision_id: "revision-missing" }],
      revisions: [initialRevision, {
        ...initialRevision,
        id: "revision-orphan",
        revision_number: 99,
        start_time: "13:00",
        end_time: "14:00",
      }],
      weekStart: "2026-08-17",
    });

    expect(projected).toEqual([]);
  });

  it("projecteert fail-closed wanneer een moderne reeks nog geen current revisiepointer heeft", () => {
    const projected = projectObjectTaskSchedules({
      definitions: [definition],
      series: [{ ...series, current_revision_id: null }],
      revisions: [initialRevision, {
        ...initialRevision,
        id: "revision-uncommitted",
        revision_number: 99,
        start_time: "13:00",
        end_time: "14:00",
      }],
      weekStart: "2026-08-17",
    });

    expect(projected).toEqual([]);
  });

  it("laat een latere objectkaartwijziging een planningalternatief en hervatting vanaf dezelfde reeks overschrijven", () => {
    const planningAlternative = {
      ...initialRevision,
      id: "revision-2-alternative",
      revision_number: 2,
      effective_from: "2026-08-17",
      recurrence_type: "one_time",
      recurrence_end_date: "2026-08-17",
      end_time: "12:00",
      metadata: { planning_only_single_occurrence: true },
    };
    const planningResume = {
      ...initialRevision,
      id: "revision-3-resume",
      revision_number: 3,
      effective_from: "2026-08-24",
      recurrence_end_date: null,
    };
    const objectCardChange = {
      ...initialRevision,
      id: "revision-4-object-card",
      revision_number: 4,
      effective_from: "2026-08-17",
      recurrence_end_date: null,
      end_time: "12:00",
    };

    expect(projectWeek("2026-08-17", [initialRevision, planningAlternative, planningResume])).toEqual([
      expect.objectContaining({ revision_id: "revision-2-alternative", frequency: "once", end_time: "12:00" }),
    ]);
    expect(projectWeek("2026-08-24", [initialRevision, planningAlternative, planningResume])).toEqual([
      expect.objectContaining({ revision_id: "revision-3-resume", frequency: "weekly", end_time: "18:00" }),
    ]);
    expect(projectWeek("2026-08-24", [initialRevision, planningAlternative, planningResume, objectCardChange])).toEqual([
      expect.objectContaining({ revision_id: "revision-4-object-card", frequency: "weekly", end_time: "12:00" }),
    ]);
  });

  it("stopt de reeks vanaf de gekozen occurrence zonder eerdere weken te verwijderen", () => {
    const stoppedFromWeek31 = {
      id: "revision-3",
      series_id: series.id,
      previous_revision_id: initialRevision.id,
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

  it("behoudt bij een gestopte reeks de occurrences van voor de toekomstige stopdatum", () => {
    const stoppedSeries = { ...series, status: "stopped", current_revision_id: "revision-3" };
    const stoppedFromWeek31 = {
      id: "revision-3",
      series_id: series.id,
      previous_revision_id: initialRevision.id,
      revision_number: 3,
      operation: "stop",
      effective_from: "2026-08-31",
      recurrence_type: "weekly",
      weekday: 1,
    };
    const projectStoppedWeek = weekStart => projectObjectTaskSchedules({
      definitions: [definition],
      series: [stoppedSeries],
      revisions: [initialRevision, stoppedFromWeek31],
      sourceChanges: [],
      weekStart,
    });

    expect(projectStoppedWeek("2026-08-24")).toEqual([
      expect.objectContaining({ occurrence_date: "2026-08-24", start_time: "06:30" }),
    ]);
    expect(projectStoppedWeek("2026-08-31")).toEqual([]);
    expect(projectStoppedWeek("2026-09-07")).toEqual([]);
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

  it("verwisselt alleen bij een actieve uitzondering de bronoccurrence voor de gekoppelde alternatiefreeks", () => {
    const alternativeSeries = {
      id: "series-monday-alternative",
      task_definition_id: definition.id,
      status: "active",
      version: 1,
      current_revision_id: "revision-alternative",
      metadata: { alternative: true },
    };
    const alternativeRevision = {
      id: "revision-alternative",
      series_id: alternativeSeries.id,
      revision_number: 1,
      operation: "schedule",
      effective_from: "2026-08-24",
      recurrence_anchor_date: "2026-08-24",
      recurrence_type: "one_time",
      start_time: "10:00",
      end_time: "12:00",
      recurrence_end_date: "2026-08-24",
    };
    const exception = status => ({
      id: `exception-${status}`,
      source_series_id: series.id,
      alternative_series_id: alternativeSeries.id,
      service_date: "2026-08-24",
      status,
    });
    const project = exceptions => projectObjectTaskSchedules({
      definitions: [definition],
      series: [series, alternativeSeries],
      revisions: [initialRevision, alternativeRevision],
      exceptions,
      weekStart: "2026-08-24",
    });

    for (const status of ["pending", "restored"]) {
      expect(project([exception(status)])).toEqual([
        expect.objectContaining({
          series_id: series.id,
          occurrence_date: "2026-08-24",
          alternative: false,
        }),
      ]);
    }
    expect(project([])).toEqual([
      expect.objectContaining({ series_id: series.id, alternative: false }),
    ]);
    expect(project([exception("active")])).toEqual([
      expect.objectContaining({
        series_id: alternativeSeries.id,
        source_series_id: series.id,
        occurrence_date: "2026-08-24",
        start_time: "10:00",
        end_time: "12:00",
        alternative: true,
        schedule_exception: expect.objectContaining({ status: "active" }),
      }),
    ]);
    expect(project([{ ...exception("active"), kind: "cancelled" }])).toEqual([]);
  });

  it("onderdrukt een geannuleerde bronoccurrence zonder een niet-gekoppeld alternatief te lekken", () => {
    const unrelatedAlternative = {
      id: "series-unrelated-alternative",
      task_definition_id: definition.id,
      status: "active",
      current_revision_id: "revision-unrelated-alternative",
      metadata: { alternative: true },
    };
    const unrelatedRevision = {
      id: "revision-unrelated-alternative",
      series_id: unrelatedAlternative.id,
      revision_number: 1,
      operation: "schedule",
      effective_from: "2026-08-24",
      recurrence_type: "one_time",
      start_time: "14:00",
      end_time: "16:00",
    };

    expect(projectObjectTaskSchedules({
      definitions: [definition],
      series: [series, unrelatedAlternative],
      revisions: [initialRevision, unrelatedRevision],
      exceptions: [{
        id: "exception-cancelled-occurrence",
        source_series_id: series.id,
        alternative_series_id: null,
        service_date: "2026-08-24",
        status: "active",
      }],
      weekStart: "2026-08-24",
    })).toEqual([]);
  });

  it("isoleert een alternatief op zijn servicedatum wanneer de blauwdruk later wordt gewijzigd", () => {
    const alternativeSeries = {
      id: "series-isolated-alternative",
      task_definition_id: definition.id,
      status: "active",
      current_revision_id: "revision-isolated-alternative",
      metadata: { alternative: true },
    };
    const alternativeRevision = {
      id: "revision-isolated-alternative",
      series_id: alternativeSeries.id,
      revision_number: 1,
      operation: "schedule",
      effective_from: "2026-08-24",
      recurrence_type: "one_time",
      start_time: "10:00",
      end_time: "12:00",
    };
    const laterBlueprintRevision = {
      ...initialRevision,
      id: "revision-later-blueprint",
      previous_revision_id: initialRevision.id,
      revision_number: 2,
      effective_from: "2026-08-24",
      recurrence_anchor_date: "2026-08-17",
      recurrence_end_date: null,
      start_time: "07:00",
      end_time: "19:00",
    };
    const activeException = {
      id: "exception-isolated-alternative",
      source_series_id: series.id,
      alternative_series_id: alternativeSeries.id,
      service_date: "2026-08-24",
      status: "active",
    };
    const project = weekStart => projectObjectTaskSchedules({
      definitions: [definition],
      series: [{ ...series, current_revision_id: laterBlueprintRevision.id }, alternativeSeries],
      revisions: [initialRevision, laterBlueprintRevision, alternativeRevision],
      exceptions: [activeException],
      weekStart,
    });

    expect(project("2026-08-24")).toEqual([
      expect.objectContaining({
        series_id: alternativeSeries.id,
        occurrence_date: "2026-08-24",
        start_time: "10:00",
        end_time: "12:00",
      }),
    ]);
    expect(project("2026-08-31")).toEqual([
      expect.objectContaining({
        series_id: series.id,
        occurrence_date: "2026-08-31",
        revision_id: laterBlueprintRevision.id,
        start_time: "07:00",
        end_time: "19:00",
        alternative: false,
      }),
    ]);
  });

  it.each(["archived", "stopped", "deleted"])(
    "projecteert geen taakblokken voor een reeks met status %s",
    status => {
      const hiddenSeries = { ...series, status };
      expect(projectObjectTaskSchedules({
        definitions: [definition],
        series: [hiddenSeries],
        revisions: [initialRevision],
        sourceChanges: [],
        weekStart: "2026-08-17",
      })).toEqual([]);
    },
  );

  it.each(["archived", "deleted"])(
    "projecteert geen legacytaak met definitiestatus %s",
    status => {
      expect(projectObjectTaskSchedules({
        definitions: [{
          ...definition,
          status,
          recurrence_type: "weekly",
          schedule_periods: [{
            period_key: "legacy-monday",
            days: ["mon"],
            start_time: "08:00",
            end_time: "18:00",
          }],
        }],
        series: [],
        revisions: [],
        sourceChanges: [],
        weekStart: "2026-08-17",
      })).toEqual([]);
    },
  );

  it("blijft een actieve legacytaak zonder moderne reeks projecteren", () => {
    expect(projectObjectTaskSchedules({
      definitions: [{
        ...definition,
        recurrence_type: "weekly",
        schedule_periods: [{
          period_key: "legacy-monday",
          days: ["mon"],
          start_time: "08:00",
          end_time: "18:00",
        }],
      }],
      series: [],
      revisions: [],
      sourceChanges: [],
      weekStart: "2026-08-17",
    })).toEqual([
      expect.objectContaining({
        definition_id: definition.id,
        occurrence_date: "2026-08-17",
        start_time: "08:00",
        legacy: true,
      }),
    ]);
  });

  it("projecteert een wekelijkse legacytaak uitsluitend binnen valid_from en de inclusieve valid_until", () => {
    const boundedLegacyDefinition = {
      ...definition,
      recurrence_type: "weekly",
      valid_from: "2026-08-17",
      valid_until: "2026-08-21",
      schedule_periods: [{
        period_key: "legacy-weekdays",
        days: ["mon", "tue", "wed", "thu", "fri"],
        start_time: "06:30",
        end_time: "18:00",
      }],
    };
    const projectLegacyWeek = weekStart => projectObjectTaskSchedules({
      definitions: [boundedLegacyDefinition],
      series: [],
      revisions: [],
      sourceChanges: [],
      weekStart,
    });

    expect(projectLegacyWeek("2026-08-10")).toEqual([]);
    expect(projectLegacyWeek("2026-08-17").map(item => item.occurrence_date)).toEqual([
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
    ]);
    expect(projectLegacyWeek("2026-08-24")).toEqual([]);
  });
});
