import { describe, expect, it } from "vitest";
import {
  buildCopyTaskOccurrencePayload,
  buildOptimisticCopiedTaskOccurrence,
  planningTaskCopyReference,
  reconcileOptimisticTaskCopy,
  rollbackOptimisticTaskCopy,
} from "@/components/planning/planningTaskCopyDomain";

function sourceOccurrence(overrides = {}) {
  return {
    id: "occurrence-source",
    source_key: "object-task-series:weekly-reception:2026-08-24:r2",
    logical_source_key: "object-task-series:weekly-reception:2026-08-24",
    object_task_definition_id: "definition-reception",
    object_task_schedule_series_id: "series-weekly-reception",
    object_task_schedule_revision_id: "revision-weekly-reception-2",
    schedule_series_key: "weekly-reception",
    schedule_revision_number: 2,
    schedule_period_key: "weekly-reception",
    definition_version: 7,
    company_id: "company-1",
    customer_id: "customer-1",
    object_id: "object-1",
    security_plan_id: "security-plan-1",
    security_plan_revision_id: "security-plan-revision-3",
    security_plan_snapshot: { published_revision: { id: "security-plan-revision-3" } },
    security_plan_checksum: "checksum-3",
    task_type: "reception",
    custom_task_type: null,
    execution_mode: "continuous",
    service_date: "2026-08-24",
    end_date: "2026-08-24",
    window_start_time: "06:30",
    window_end_time: "18:00",
    timezone: "Europe/Amsterdam",
    required_minutes: 690,
    lifecycle_status: "active",
    task_name_snapshot: "Receptiedienst",
    customer_name_snapshot: "Klant 1",
    object_name_snapshot: "Object 1",
    instructions_snapshot: "Meld bezoekers aan.",
    revision: 4,
    published_revision: 0,
    metadata: { bootstrap_source: "ObjectTaskScheduleSeries" },
    ...overrides,
  };
}

function authoritativeCopy(optimistic, overrides = {}) {
  return {
    ...optimistic,
    id: "occurrence-copied",
    source_key: "object-task-series:copy-series:2026-08-27:r1",
    logical_source_key: "object-task-series:copy-series:2026-08-27",
    object_task_schedule_series_id: "series-copy",
    object_task_schedule_revision_id: "revision-copy-1",
    schedule_series_key: "copy-series",
    schedule_revision_number: 1,
    schedule_period_key: "copy-series",
    revision: 1,
    metadata: {
      copy_kind: "standalone_one_time",
      copied_from_task_occurrence_id: "occurrence-source",
    },
    _optimistic_pending: undefined,
    _optimistic_task_copy: undefined,
    _task_copy_reference: undefined,
    _copy_source_occurrence_id: undefined,
    ...overrides,
  };
}

describe("planning task copy domain", () => {
  it("bouwt een occurrence-CAS payload zonder globale definitieversie of clienttijden", () => {
    const payload = buildCopyTaskOccurrencePayload({
      occurrence: sourceOccurrence({ definition_version: 99 }),
      targetServiceDate: "2026-08-27",
    });

    expect(payload).toEqual({
      action: "copy_task_occurrence",
      source_occurrence_id: "occurrence-source",
      expected_source_occurrence_revision: 4,
      target_service_date: "2026-08-27",
    });
    expect(payload).not.toHaveProperty("expected_version");
    expect(payload).not.toHaveProperty("task_definition_id");
    expect(payload).not.toHaveProperty("schedule_block");
  });

  it("weigert een niet-actieve bron, ontbrekende revisie en ongeldige doeldatum", () => {
    expect(() => buildCopyTaskOccurrencePayload({
      occurrence: sourceOccurrence({ lifecycle_status: "superseded" }),
      targetServiceDate: "2026-08-27",
    })).toThrow("Alleen een actieve taak");
    expect(() => buildCopyTaskOccurrencePayload({
      occurrence: sourceOccurrence({ revision: 0 }),
      targetServiceDate: "2026-08-27",
    })).toThrow("actuele taakrevisie");
    expect(() => buildCopyTaskOccurrencePayload({
      occurrence: sourceOccurrence(),
      targetServiceDate: "2026-02-30",
    })).toThrow("Doeldatum is ongeldig");
  });

  it("maakt voor dezelfde bron en datum één stabiele optimistische referentie", () => {
    const source = sourceOccurrence();
    const first = buildOptimisticCopiedTaskOccurrence({ occurrence: source, targetServiceDate: "2026-08-27" });
    const second = buildOptimisticCopiedTaskOccurrence({ occurrence: source, targetServiceDate: "2026-08-27" });

    expect(first.id).toBe(second.id);
    expect(first._task_copy_reference).toBe(planningTaskCopyReference({
      sourceOccurrenceId: source.id,
      targetServiceDate: "2026-08-27",
    }));
    expect(first).toMatchObject({
      service_date: "2026-08-27",
      end_date: "2026-08-27",
      window_start_time: "06:30",
      window_end_time: "18:00",
      required_minutes: 690,
      lifecycle_status: "active",
      _optimistic_pending: true,
      _optimistic_task_copy: true,
      metadata: {
        copy_kind: "standalone_one_time",
        copied_from_task_occurrence_id: "occurrence-source",
        copied_from_task_occurrence_revision: 4,
        copy_target_service_date: "2026-08-27",
        source_was_alternative: false,
      },
    });
    expect(source.service_date).toBe("2026-08-24");
  });

  it("rebased een overnight taak naar de kalenderdag na de doeldatum", () => {
    const optimistic = buildOptimisticCopiedTaskOccurrence({
      occurrence: sourceOccurrence({
        service_date: "2026-08-24",
        end_date: "2026-08-25",
        window_start_time: "22:00",
        window_end_time: "02:00",
        required_minutes: 240,
      }),
      targetServiceDate: "2026-08-31",
    });

    expect(optimistic).toMatchObject({
      service_date: "2026-08-31",
      end_date: "2026-09-01",
      window_start_time: "22:00",
      window_end_time: "02:00",
      required_minutes: 240,
    });
  });

  it("leidt een ontbrekende overnight-einddatum veilig af en bewaart time-windowduur", () => {
    const optimistic = buildOptimisticCopiedTaskOccurrence({
      occurrence: sourceOccurrence({
        end_date: null,
        execution_mode: "time_window",
        window_start_time: "23:30",
        window_end_time: "00:30",
        required_minutes: 25,
      }),
      targetServiceDate: "2026-12-31",
    });

    expect(optimistic).toMatchObject({
      service_date: "2026-12-31",
      end_date: "2027-01-01",
      execution_mode: "time_window",
      required_minutes: 25,
    });
  });

  it("maakt van een alternatief een losse one-time kopie zonder exception- of reekslink", () => {
    const optimistic = buildOptimisticCopiedTaskOccurrence({
      occurrence: sourceOccurrence({
        object_task_schedule_series_id: "series-alternative",
        object_task_schedule_revision_id: "revision-alternative-2",
        schedule_series_key: "ots-alt-source",
        supersedes_task_occurrence_id: "occurrence-original",
        window_start_time: "09:15",
        window_end_time: "13:45",
        required_minutes: 270,
        metadata: {
          planning_alternative: true,
          task_schedule_exception_id: "exception-1",
          schedule_kind: "alternative",
        },
      }),
      targetServiceDate: "2026-08-28",
    });

    expect(optimistic).toMatchObject({
      object_task_schedule_series_id: null,
      object_task_schedule_revision_id: null,
      schedule_series_key: null,
      schedule_revision_number: null,
      supersedes_task_occurrence_id: null,
      superseded_by_task_occurrence_id: null,
      logical_source_key: null,
      service_date: "2026-08-28",
      window_start_time: "09:15",
      window_end_time: "13:45",
      metadata: {
        copy_kind: "standalone_one_time",
        source_was_alternative: true,
      },
    });
    expect(optimistic.metadata).not.toHaveProperty("planning_alternative");
    expect(optimistic.metadata).not.toHaveProperty("task_schedule_exception_id");
  });

  it("vervangt de tijdelijke occurrence door de autoritatieve serverkopie", () => {
    const existing = sourceOccurrence();
    const optimistic = buildOptimisticCopiedTaskOccurrence({
      occurrence: existing,
      targetServiceDate: "2026-08-27",
    });
    const target = authoritativeCopy(optimistic);
    const reconciled = reconcileOptimisticTaskCopy({
      occurrences: [existing, optimistic],
      optimisticOccurrence: optimistic,
      result: { task_occurrences: [existing, target] },
    });

    expect(reconciled).toMatchObject({
      reconciled: true,
      targetOccurrence: { id: "occurrence-copied", service_date: "2026-08-27" },
      optimisticOccurrenceId: optimistic.id,
    });
    expect(reconciled.occurrences.map(item => item.id)).toEqual([
      "occurrence-source",
      "occurrence-copied",
    ]);
  });

  it("upsert een al aanwezige serverkopie zonder dubbele kaart bij herhaald plakken", () => {
    const optimistic = buildOptimisticCopiedTaskOccurrence({
      occurrence: sourceOccurrence(),
      targetServiceDate: "2026-08-27",
    });
    const target = authoritativeCopy(optimistic);
    const reconciled = reconcileOptimisticTaskCopy({
      occurrences: [target, optimistic],
      optimisticOccurrence: optimistic,
      result: { target_occurrence: { ...target, revision: 2 } },
    });

    expect(reconciled.occurrences).toHaveLength(1);
    expect(reconciled.occurrences[0]).toMatchObject({ id: "occurrence-copied", revision: 2 });
  });

  it("houdt de optimistische kaart vast tot de server een passend target retourneert", () => {
    const optimistic = buildOptimisticCopiedTaskOccurrence({
      occurrence: sourceOccurrence(),
      targetServiceDate: "2026-08-27",
    });
    const occurrences = [sourceOccurrence(), optimistic];
    const reconciled = reconcileOptimisticTaskCopy({
      occurrences,
      optimisticOccurrence: optimistic,
      result: { task_occurrences: [sourceOccurrence()] },
    });

    expect(reconciled).toMatchObject({ reconciled: false, targetOccurrence: null });
    expect(reconciled.occurrences).toBe(occurrences);
  });

  it("weigert een target met een andere datum, afwijkend venster of alternative-koppeling", () => {
    const optimistic = buildOptimisticCopiedTaskOccurrence({
      occurrence: sourceOccurrence(),
      targetServiceDate: "2026-08-27",
    });
    const wrongDate = authoritativeCopy(optimistic, { service_date: "2026-08-28", end_date: "2026-08-28" });
    expect(reconcileOptimisticTaskCopy({
      occurrences: [optimistic],
      optimisticOccurrence: optimistic,
      result: { target_occurrence: wrongDate },
    }).reconciled).toBe(false);

    const wrongWindow = authoritativeCopy(optimistic, { window_end_time: "17:00", required_minutes: 630 });
    expect(() => reconcileOptimisticTaskCopy({
      occurrences: [optimistic],
      optimisticOccurrence: optimistic,
      result: { target_occurrence: wrongWindow },
    })).toThrow("wijkt af");

    const alternative = authoritativeCopy(optimistic, {
      metadata: { planning_alternative: true, task_schedule_exception_id: "exception-new" },
    });
    expect(() => reconcileOptimisticTaskCopy({
      occurrences: [optimistic],
      optimisticOccurrence: optimistic,
      result: { target_occurrence: alternative },
    })).toThrow("taakuitzondering");
  });

  it("rolt uitsluitend de eigen optimistische kaart terug", () => {
    const optimistic = buildOptimisticCopiedTaskOccurrence({
      occurrence: sourceOccurrence(),
      targetServiceDate: "2026-08-27",
    });
    expect(rollbackOptimisticTaskCopy({
      occurrences: [sourceOccurrence(), optimistic, { id: "other-pending" }],
      optimisticOccurrence: optimistic,
    }).map(item => item.id)).toEqual(["occurrence-source", "other-pending"]);
  });
});
