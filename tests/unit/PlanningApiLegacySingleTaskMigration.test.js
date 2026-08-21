import fs from "node:fs";
import path from "node:path";
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from "node:util";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = fs.readFileSync(path.join(root, "base44/functions/planningApi/entry.ts"), "utf8");
let backend;

beforeAll(async () => {
  globalThis.TextEncoder = NodeTextEncoder;
  globalThis.TextDecoder = NodeTextDecoder;
  globalThis.Uint8Array = new NodeTextEncoder().encode("").constructor;
  globalThis.Deno = { serve: () => undefined };
  const { transform } = await import("esbuild");
  const compiled = await transform(source.replace(
    /^import \{ createClientFromRequest \} from 'npm:@base44\/sdk@[^']+';$/m,
    "const createClientFromRequest = () => ({});",
  ), { format: "esm", loader: "ts", target: "es2022" });
  backend = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString("base64")}`);
});

function entity(initial = [], prefix = "record") {
  const records = initial.map(item => structuredClone(item));
  const matches = (record, query = {}) => Object.entries(query).every(([key, value]) => (
    value && typeof value === "object" && Object.hasOwn(value, "$in")
      ? value.$in.includes(record[key])
      : record[key] === value
  ));
  return {
    records,
    async list() { return records.map(item => structuredClone(item)); },
    async filter(query) { return records.filter(item => matches(item, query)).map(item => structuredClone(item)); },
    async get(id) { return structuredClone(records.find(item => String(item.id) === String(id)) || null); },
    async create(data) {
      const record = { id: `${prefix}-${records.length + 1}`, ...structuredClone(data) };
      records.push(record);
      return structuredClone(record);
    },
    async updateMany(query, update) {
      const index = records.findIndex(item => matches(item, query));
      if (index < 0) return { success: true, updated: 0 };
      records[index] = { ...records[index], ...(update.$set || {}) };
      for (const [key, value] of Object.entries(update.$inc || {})) {
        records[index][key] = Number(records[index][key] || 0) + Number(value);
      }
      return { success: true, updated: 1 };
    },
  };
}

function legacyRecords({ withPlanning = true, occurrenceStart = "10:00", newerRevision = null } = {}) {
  const series = {
    id: "series-source",
    series_key: "source-series-key",
    customer_id: "customer-1",
    object_id: "object-1",
    object_task_definition_id: "definition-1",
    current_revision_id: newerRevision?.id || "revision-resume",
    current_revision_number: newerRevision?.revision_number || 3,
    status: "active",
    timezone: "Europe/Amsterdam",
    version: 1,
  };
  const sourceRevision = {
    id: "revision-source",
    series_id: series.id,
    series_key: series.series_key,
    customer_id: series.customer_id,
    object_id: series.object_id,
    object_task_definition_id: series.object_task_definition_id,
    revision_number: 1,
    previous_revision_id: null,
    operation: "schedule",
    effective_from: "2099-01-31",
    recurrence_anchor_date: "2099-01-31",
    recurrence_type: "monthly",
    recurrence_interval: 2,
    weekday: 6,
    start_time: "06:00",
    end_time: "18:00",
    recurrence_end_date: null,
    timezone: "Europe/Amsterdam",
    task_snapshot: { task_type: "reception", execution_mode: "continuous" },
  };
  const singleRevision = {
    ...sourceRevision,
    id: "revision-single",
    revision_number: 2,
    previous_revision_id: sourceRevision.id,
    effective_from: "2099-05-31",
    recurrence_anchor_date: null,
    recurrence_type: "one_time",
    recurrence_interval: 1,
    start_time: "10:00",
    end_time: "14:00",
    recurrence_end_date: "2099-05-31",
    metadata: { planning_only_single_occurrence: true, occurrence_id: "occurrence-source" },
  };
  const resumeRevision = {
    ...sourceRevision,
    id: "revision-resume",
    revision_number: 3,
    previous_revision_id: singleRevision.id,
    effective_from: "2099-06-07",
    // Het oude endpoint verloor interval en anker; migratie moet r1 gebruiken.
    recurrence_anchor_date: null,
    recurrence_interval: 1,
    metadata: { planning_only_resume: true, occurrence_id: "occurrence-source" },
  };
  const occurrence = {
    id: "occurrence-source",
    source_key: "object-task-series:source-series-key:2099-05-31:r2",
    logical_source_key: "object-task-series:source-series-key:2099-05-31",
    object_task_definition_id: "definition-1",
    object_task_schedule_series_id: series.id,
    object_task_schedule_revision_id: singleRevision.id,
    schedule_series_key: series.series_key,
    schedule_revision_number: 2,
    schedule_period_key: series.series_key,
    definition_version: 1,
    customer_id: "customer-1",
    object_id: "object-1",
    task_type: "reception",
    task_name_snapshot: "Receptiedienst",
    customer_name_snapshot: "Klant 1",
    object_name_snapshot: "Object 1",
    execution_mode: "continuous",
    service_date: "2099-05-31",
    end_date: "2099-05-31",
    window_start_time: occurrenceStart,
    window_end_time: "14:00",
    timezone: "Europe/Amsterdam",
    required_minutes: occurrenceStart === "10:00" ? 240 : 180,
    lifecycle_status: "active",
    revision: 1,
    published_revision: 0,
  };
  return {
    series,
    revisions: [sourceRevision, singleRevision, resumeRevision, ...(newerRevision ? [newerRevision] : [])],
    occurrences: withPlanning ? [occurrence] : [],
  };
}

function setup(options) {
  const legacy = legacyRecords(options);
  const occurrence = legacy.occurrences[0];
  const shift = occurrence ? {
    id: "shift-1",
    source_key: "manual-shift-1",
    source_type: "task",
    company_id: "company-1",
    customer_id: "customer-1",
    object_id: "object-1",
    service_date: "2099-05-31",
    end_date: null,
    start_time: "10:00",
    end_time: "14:00",
    duration_minutes: 240,
    required_count: 1,
    task_occurrence_ids: [occurrence.id],
    task_segment_count: 1,
    status: "draft",
    revision: 1,
  } : null;
  const segment = occurrence ? {
    id: "segment-1",
    shift_id: shift.id,
    task_occurrence_id: occurrence.id,
    object_task_definition_id: "definition-1",
    start_date: "2099-05-31",
    end_date: "2099-05-31",
    start_time: "10:00",
    end_time: "14:00",
    duration_minutes: 240,
    task_type: "reception",
    task_name_snapshot: "Receptiedienst",
    status: "draft",
    revision: 1,
  } : null;
  const entities = {
    ObjectTaskDefinition: entity([{
      id: "definition-1",
      customer_id: "customer-1",
      object_id: "object-1",
      task_type: "reception",
      execution_mode: "continuous",
      status: "active",
      version: 1,
    }], "definition"),
    ObjectTaskScheduleSeries: entity([legacy.series], "series"),
    ObjectTaskScheduleRevision: entity(legacy.revisions, "revision"),
    ObjectTaskScheduleException: entity([], "exception"),
    PlanningTaskOccurrence: entity(legacy.occurrences, "occurrence"),
    PlanningShiftTaskSegment: entity(segment ? [segment] : [], "segment"),
    PlanningShift: entity(shift ? [shift] : [], "shift"),
    PlanningAssignment: entity([], "assignment"),
    PlanningAuditEvent: entity([], "audit"),
    PlanningTaskSourceChange: entity([], "source-change"),
    PlanningMutationCoordinator: entity([], "coordinator"),
    SurveillanceObject: entity([{
      id: "object-1",
      customer_id: "customer-1",
      name: "Object 1",
      default_operating_company_id: "company-1",
    }], "object"),
    Customer: entity([{ id: "customer-1", trade_name: "Klant 1" }], "customer"),
    Personnel: entity([], "personnel"),
    PersonnelAbsence: entity([], "absence"),
    PersonnelRestriction: entity([], "restriction"),
    ObjectSecurityPlan: entity([], "security-plan"),
    ObjectSecurityPlanRevision: entity([], "security-plan-revision"),
  };
  return {
    base44: { asServiceRole: { entities, functions: { invoke: async () => ({}) } } },
    entities,
  };
}

const user = { id: "admin-1", role: "admin", full_name: "Planner" };
const context = { idempotencyKey: "bootstrap-legacy", correlationId: "bootstrap-legacy" };

describe("planningApi legacy changeSinglePlanningTask-migratie", () => {
  it("detecteert alleen een bereikbare legacy single/resume-keten en herstelt vanaf de echte broncadans", () => {
    const legacy = legacyRecords({ withPlanning: false });
    const detected = backend.detectLegacySingleTaskMigrations(
      [legacy.series],
      legacy.revisions,
      [],
    );

    expect(detected).toHaveLength(1);
    expect(detected[0]).toMatchObject({
      status: "ready",
      service_date: "2099-05-31",
      origin_occurrence_id: "occurrence-source",
    });
    expect(detected[0].source_revision).toMatchObject({
      id: "revision-source",
      recurrence_type: "monthly",
      recurrence_interval: 2,
      recurrence_anchor_date: "2099-01-31",
    });
  });

  it.each([
    {
      recurrence_type: "weekly",
      recurrence_interval: 2,
      anchor: "2099-01-05",
      service_date: "2099-01-19",
    },
    {
      recurrence_type: "yearly",
      recurrence_interval: 4,
      anchor: "2096-02-29",
      service_date: "2100-02-28",
    },
  ])("behoudt $recurrence_type interval $recurrence_interval inclusief het oorspronkelijke anker", values => {
    const legacy = legacyRecords({ withPlanning: false });
    const sourceRevision = legacy.revisions[0];
    const singleRevision = legacy.revisions[1];
    const resumeRevision = legacy.revisions[2];
    const weekday = ((new Date(`${values.service_date}T12:00:00.000Z`).getUTCDay() + 6) % 7) + 1;
    Object.assign(sourceRevision, {
      effective_from: values.anchor,
      recurrence_anchor_date: values.anchor,
      recurrence_type: values.recurrence_type,
      recurrence_interval: values.recurrence_interval,
      weekday,
    });
    Object.assign(singleRevision, {
      effective_from: values.service_date,
      recurrence_end_date: values.service_date,
      weekday,
    });
    Object.assign(resumeRevision, {
      effective_from: values.service_date,
      weekday,
    });

    const detected = backend.detectLegacySingleTaskMigrations(
      [legacy.series],
      legacy.revisions,
      [],
    );
    expect(detected[0]).toMatchObject({
      status: "ready",
      source_revision: {
        recurrence_type: values.recurrence_type,
        recurrence_interval: values.recurrence_interval,
        recurrence_anchor_date: values.anchor,
      },
    });
  });

  it("negeert legacy orphan-revisies die niet vanaf current_revision_id bereikbaar zijn", () => {
    const legacy = legacyRecords({ withPlanning: false });
    legacy.series.current_revision_id = "revision-source";
    legacy.series.current_revision_number = 1;
    expect(backend.detectLegacySingleTaskMigrations(
      [legacy.series],
      legacy.revisions,
      [],
    )).toEqual([]);
  });

  it("blokkeert fail-closed bij een nieuwere echte blauwdrukrevisie", () => {
    const base = legacyRecords({ withPlanning: false });
    const newer = {
      ...base.revisions[0],
      id: "revision-new-blueprint",
      revision_number: 4,
      previous_revision_id: "revision-resume",
      effective_from: "2099-07-31",
      start_time: "07:00",
    };
    const legacy = legacyRecords({ withPlanning: false, newerRevision: newer });

    expect(backend.detectLegacySingleTaskMigrations(
      [legacy.series],
      legacy.revisions,
      [],
    )[0]).toMatchObject({
      status: "blocked",
      blocked_code: "LEGACY_NEWER_BLUEPRINT_REVISION",
    });
  });

  it("maakt één exception en één one_time-alternatief, migreert dienstsegmenten en is idempotent", async () => {
    const { base44, entities } = setup();
    const snapshot = () => ({
      series: entities.ObjectTaskScheduleSeries.records.map(item => structuredClone(item)),
      revisions: entities.ObjectTaskScheduleRevision.records.map(item => structuredClone(item)),
      exceptions: entities.ObjectTaskScheduleException.records.map(item => structuredClone(item)),
      occurrences: entities.PlanningTaskOccurrence.records.map(item => structuredClone(item)),
    });

    const first = await backend.migrateLegacySinglePlanningTasks(
      base44,
      user,
      context,
      snapshot(),
    );
    expect(first).toHaveLength(1);
    expect(first[0].status).toBe("migrated");

    const sourceSeries = entities.ObjectTaskScheduleSeries.records.find(item => item.id === "series-source");
    const restore = entities.ObjectTaskScheduleRevision.records.find(item => (
      item.metadata?.legacy_single_task_source_restore === true
    ));
    expect(sourceSeries.current_revision_id).toBe(restore.id);
    expect(restore).toMatchObject({
      effective_from: "2099-05-31",
      recurrence_anchor_date: "2099-01-31",
      recurrence_type: "monthly",
      recurrence_interval: 2,
      start_time: "06:00",
      end_time: "18:00",
    });

    expect(entities.ObjectTaskScheduleException.records).toHaveLength(1);
    const exception = entities.ObjectTaskScheduleException.records[0];
    expect(exception).toMatchObject({
      source_series_id: "series-source",
      service_date: "2099-05-31",
      status: "active",
      metadata: { legacy_single_task_migration: { phase: "completed" } },
    });
    const alternativeSeries = entities.ObjectTaskScheduleSeries.records.find(item => (
      item.id === exception.alternative_series_id
    ));
    const alternativeRevision = entities.ObjectTaskScheduleRevision.records.find(item => (
      item.id === exception.alternative_revision_id
    ));
    expect(alternativeSeries.metadata.schedule_kind).toBe("alternative");
    expect(alternativeRevision).toMatchObject({
      series_id: alternativeSeries.id,
      effective_from: "2099-05-31",
      recurrence_anchor_date: "2099-05-31",
      recurrence_type: "one_time",
      recurrence_interval: 1,
      start_time: "10:00",
      end_time: "14:00",
    });

    const activeOccurrences = entities.PlanningTaskOccurrence.records.filter(item => item.lifecycle_status === "active");
    expect(activeOccurrences).toHaveLength(1);
    expect(activeOccurrences[0].object_task_schedule_series_id).toBe(alternativeSeries.id);
    expect(entities.PlanningTaskOccurrence.records.find(item => item.id === "occurrence-source"))
      .toMatchObject({ lifecycle_status: "superseded", superseded_by_task_occurrence_id: activeOccurrences[0].id });
    expect(entities.PlanningShiftTaskSegment.records[0].task_occurrence_id).toBe(activeOccurrences[0].id);
    expect(entities.PlanningShift.records[0].task_occurrence_ids).toEqual([activeOccurrences[0].id]);

    const counts = {
      series: entities.ObjectTaskScheduleSeries.records.length,
      revisions: entities.ObjectTaskScheduleRevision.records.length,
      exceptions: entities.ObjectTaskScheduleException.records.length,
      occurrences: entities.PlanningTaskOccurrence.records.length,
    };
    const replay = await backend.migrateLegacySinglePlanningTasks(
      base44,
      user,
      { ...context, idempotencyKey: "another-bootstrap" },
      snapshot(),
    );
    expect(replay[0].status).toBe("completed");
    expect({
      series: entities.ObjectTaskScheduleSeries.records.length,
      revisions: entities.ObjectTaskScheduleRevision.records.length,
      exceptions: entities.ObjectTaskScheduleException.records.length,
      occurrences: entities.PlanningTaskOccurrence.records.length,
    }).toEqual(counts);
  });

  it("fencet vanaf de legacy-journal en accepteert de completed exception als duurzaam herstelbewijs", async () => {
    const { base44, entities } = setup();
    const snapshot = () => ({
      series: entities.ObjectTaskScheduleSeries.records.map(item => structuredClone(item)),
      revisions: entities.ObjectTaskScheduleRevision.records.map(item => structuredClone(item)),
      exceptions: entities.ObjectTaskScheduleException.records.map(item => structuredClone(item)),
      occurrences: entities.PlanningTaskOccurrence.records.map(item => structuredClone(item)),
    });
    const originalExceptionCreate = entities.ObjectTaskScheduleException.create
      .bind(entities.ObjectTaskScheduleException);
    let failExceptionOnce = true;
    entities.ObjectTaskScheduleException.create = async data => {
      if (failExceptionOnce && data.metadata?.legacy_single_task_migration) {
        failExceptionOnce = false;
        throw new Error("simulated legacy exception failure");
      }
      return originalExceptionCreate(data);
    };
    const originalSeriesUpdateMany = entities.ObjectTaskScheduleSeries.updateMany
      .bind(entities.ObjectTaskScheduleSeries);
    let failJournalCompletionOnce = true;
    entities.ObjectTaskScheduleSeries.updateMany = async (query, update) => {
      if (
        failJournalCompletionOnce
        && update?.$set?.metadata?.legacy_single_task_migration_journal?.phase === "completed"
      ) {
        failJournalCompletionOnce = false;
        throw new Error("simulated legacy journal completion failure");
      }
      return originalSeriesUpdateMany(query, update);
    };

    const failed = await backend.migrateLegacySinglePlanningTasks(
      base44,
      user,
      context,
      snapshot(),
    );
    expect(failed[0]).toMatchObject({
      status: "blocked",
      code: "LEGACY_MIGRATION_FAILED_CLOSED",
      reason: "simulated legacy exception failure",
    });
    expect(entities.ObjectTaskScheduleException.records).toEqual([]);
    const journaledSeries = await entities.ObjectTaskScheduleSeries.get("series-source");
    expect(journaledSeries.metadata.legacy_single_task_migration_journal).toMatchObject({
      phase: "prepared",
      linked_shift_ids: ["shift-1"],
    });

    await expect(backend.mutateObjectTaskSeries(base44, user, {
      customer_id: "customer-1",
      object_id: "object-1",
      task_definition_id: "definition-1",
      series_id: "series-source",
      effective_from: "2099-05-31",
      start_time: "07:00",
      end_time: "17:00",
      recurrence_type: "one_time",
      recurrence_end_date: "2099-05-31",
      expected_version: journaledSeries.version,
    }, {
      idempotencyKey: "foreign-after-legacy-journal",
      correlationId: "foreign-after-legacy-journal",
    }, "schedule")).rejects.toMatchObject({
      status: 409,
      details: { code: "LEGACY_SINGLE_TASK_MIGRATION_RECOVERY_PENDING" },
    });

    const recovered = await backend.migrateLegacySinglePlanningTasks(
      base44,
      user,
      { ...context, idempotencyKey: "retry-after-legacy-exception-failure" },
      snapshot(),
    );
    expect(recovered[0]).toMatchObject({
      status: "blocked",
      code: "LEGACY_MIGRATION_FAILED_CLOSED",
      reason: "simulated legacy journal completion failure",
    });
    expect(entities.ObjectTaskScheduleException.records[0]).toMatchObject({
      status: "active",
      metadata: { legacy_single_task_migration: { phase: "completed" } },
    });
    expect((await entities.ObjectTaskScheduleSeries.get("series-source"))
      .metadata.legacy_single_task_migration_journal.phase).toBe("prepared");

    const completedReplay = await backend.migrateLegacySinglePlanningTasks(
      base44,
      user,
      { ...context, idempotencyKey: "bootstrap-after-journal-completion-failure" },
      snapshot(),
    );
    expect(completedReplay[0].status).toBe("completed");

    const restoredSeries = await entities.ObjectTaskScheduleSeries.get("series-source");
    const restoredRevision = await entities.ObjectTaskScheduleRevision.get(
      restoredSeries.current_revision_id,
    );
    const futureOccurrence = {
      ...structuredClone(entities.PlanningTaskOccurrence.records.find(item => (
        item.id === "occurrence-source"
      ))),
      id: "occurrence-after-completed-legacy-witness",
      source_key: "object-task-series:source-series-key:2099-07-31:r4",
      logical_source_key: "object-task-series:source-series-key:2099-07-31",
      object_task_schedule_revision_id: restoredRevision.id,
      schedule_revision_number: restoredRevision.revision_number,
      service_date: "2099-07-31",
      end_date: "2099-07-31",
      window_start_time: "06:00",
      window_end_time: "18:00",
      required_minutes: 720,
      lifecycle_status: "active",
      supersedes_task_occurrence_id: null,
      superseded_by_task_occurrence_id: null,
      revision: 1,
    };
    entities.PlanningTaskOccurrence.records.push(futureOccurrence);
    const laterEdit = await backend.changeSingleTaskOccurrence(base44, user, {
      occurrence_id: futureOccurrence.id,
      source_revision_id: restoredRevision.id,
      start_time: "07:00",
      end_time: "17:00",
      expected_occurrence_revision: 1,
      confirm_remove_outside_shifts: false,
    }, {
      idempotencyKey: "edit-after-completed-legacy-witness",
      correlationId: "edit-after-completed-legacy-witness",
    });
    expect(laterEdit).toMatchObject({
      ok: true,
      task_schedule_exception: { status: "active" },
    });

    const sourceBeforeSecondLegacy = await entities.ObjectTaskScheduleSeries.get("series-source");
    const sourceRevisionBeforeSecondLegacy = await entities.ObjectTaskScheduleRevision.get(
      sourceBeforeSecondLegacy.current_revision_id,
    );
    const secondOccurrenceId = "occurrence-second-legacy";
    const secondServiceDate = "2099-09-30";
    const secondSingleRevision = {
      ...structuredClone(sourceRevisionBeforeSecondLegacy),
      id: "revision-second-legacy-single",
      revision_number: Number(sourceRevisionBeforeSecondLegacy.revision_number) + 1,
      previous_revision_id: sourceRevisionBeforeSecondLegacy.id,
      effective_from: secondServiceDate,
      recurrence_anchor_date: null,
      recurrence_type: "one_time",
      recurrence_interval: 1,
      start_time: "09:00",
      end_time: "13:00",
      recurrence_end_date: secondServiceDate,
      metadata: {
        planning_only_single_occurrence: true,
        occurrence_id: secondOccurrenceId,
      },
    };
    const secondResumeRevision = {
      ...structuredClone(sourceRevisionBeforeSecondLegacy),
      id: "revision-second-legacy-resume",
      revision_number: secondSingleRevision.revision_number + 1,
      previous_revision_id: secondSingleRevision.id,
      effective_from: "2099-10-01",
      metadata: {
        planning_only_resume: true,
        occurrence_id: secondOccurrenceId,
      },
    };
    entities.ObjectTaskScheduleRevision.records.push(
      secondSingleRevision,
      secondResumeRevision,
    );
    const storedSourceSeries = entities.ObjectTaskScheduleSeries.records.find(item => (
      item.id === "series-source"
    ));
    storedSourceSeries.current_revision_id = secondResumeRevision.id;
    storedSourceSeries.current_revision_number = secondResumeRevision.revision_number;
    storedSourceSeries.version += 1;
    entities.PlanningTaskOccurrence.records.push({
      ...structuredClone(futureOccurrence),
      id: secondOccurrenceId,
      source_key: "object-task-series:source-series-key:2099-09-30:r5",
      logical_source_key: "object-task-series:source-series-key:2099-09-30",
      object_task_schedule_revision_id: secondSingleRevision.id,
      schedule_revision_number: secondSingleRevision.revision_number,
      service_date: secondServiceDate,
      end_date: secondServiceDate,
      window_start_time: "09:00",
      window_end_time: "13:00",
      required_minutes: 240,
      lifecycle_status: "active",
      supersedes_task_occurrence_id: null,
      superseded_by_task_occurrence_id: null,
      revision: 1,
      metadata: {},
    });
    entities.PlanningShift.records.push({
      ...structuredClone(entities.PlanningShift.records.find(item => item.id === "shift-1")),
      id: "shift-second-legacy",
      source_key: "manual-shift-second-legacy",
      service_date: secondServiceDate,
      start_time: "09:00",
      end_time: "13:00",
      duration_minutes: 240,
      task_occurrence_ids: [secondOccurrenceId],
      revision: 1,
      metadata: {},
    });
    entities.PlanningShiftTaskSegment.records.push({
      ...structuredClone(entities.PlanningShiftTaskSegment.records.find(item => (
        item.id === "segment-1"
      ))),
      id: "segment-second-legacy",
      shift_id: "shift-second-legacy",
      task_occurrence_id: secondOccurrenceId,
      start_date: secondServiceDate,
      end_date: secondServiceDate,
      start_time: "09:00",
      end_time: "13:00",
      duration_minutes: 240,
      revision: 1,
      metadata: {},
    });
    const firstShiftBeforeSecondMigration = await entities.PlanningShift.get("shift-1");

    const secondMigration = await backend.migrateLegacySinglePlanningTasks(
      base44,
      user,
      { ...context, idempotencyKey: "migrate-second-legacy-candidate" },
      snapshot(),
    );
    expect(secondMigration.find(item => item.service_date === secondServiceDate)?.status)
      .toBe("migrated");
    const secondException = entities.ObjectTaskScheduleException.records.find(item => (
      item.service_date === secondServiceDate
      && item.metadata?.legacy_single_task_migration
    ));
    expect(secondException.metadata.legacy_single_task_migration.linked_shift_ids)
      .toEqual(["shift-second-legacy"]);
    expect((await entities.ObjectTaskScheduleSeries.get("series-source"))
      .metadata.legacy_single_task_migration_journal).toMatchObject({
      phase: "completed",
      linked_shift_ids: ["shift-second-legacy"],
    });
    expect(await entities.PlanningShift.get("shift-1")).toEqual(firstShiftBeforeSecondMigration);
  });

  it("herstelt de legacy-dienstgrens als het segment al naar het alternatief is gemigreerd", async () => {
    const { base44, entities } = setup();
    const snapshot = () => ({
      series: entities.ObjectTaskScheduleSeries.records.map(item => structuredClone(item)),
      revisions: entities.ObjectTaskScheduleRevision.records.map(item => structuredClone(item)),
      exceptions: entities.ObjectTaskScheduleException.records.map(item => structuredClone(item)),
      occurrences: entities.PlanningTaskOccurrence.records.map(item => structuredClone(item)),
    });
    const originalShiftUpdateMany = entities.PlanningShift.updateMany
      .bind(entities.PlanningShift);
    let failShiftBoundaryOnce = true;
    entities.PlanningShift.updateMany = async (query, update) => {
      if (
        failShiftBoundaryOnce
        && String(query.id) === "shift-1"
        && update?.$set?.metadata?.task_boundary_migrated_at
      ) {
        failShiftBoundaryOnce = false;
        throw new Error("simulated legacy shift boundary failure");
      }
      return originalShiftUpdateMany(query, update);
    };

    const failed = await backend.migrateLegacySinglePlanningTasks(
      base44,
      user,
      context,
      snapshot(),
    );
    expect(failed[0]).toMatchObject({
      status: "blocked",
      code: "LEGACY_MIGRATION_FAILED_CLOSED",
      reason: "simulated legacy shift boundary failure",
    });
    const preparedException = entities.ObjectTaskScheduleException.records[0];
    expect(preparedException).toMatchObject({
      status: "pending",
      metadata: {
        legacy_single_task_migration: {
          phase: "prepared",
          source_occurrence_id: "occurrence-source",
          linked_shift_ids: ["shift-1"],
        },
      },
    });
    expect(entities.ObjectTaskScheduleSeries.records.find(item => (
      item.id === "series-source"
    ))).toMatchObject({
      metadata: {
        legacy_single_task_migration_journal: {
          phase: "prepared",
          linked_shift_ids: ["shift-1"],
        },
      },
    });
    const partiallyMigratedSegment = entities.PlanningShiftTaskSegment.records[0];
    expect(partiallyMigratedSegment.task_occurrence_id).not.toBe("occurrence-source");
    const alternativeOccurrenceId = partiallyMigratedSegment.task_occurrence_id;
    expect(entities.PlanningShift.records[0]).toMatchObject({
      start_time: "10:00",
      end_time: "14:00",
      task_occurrence_ids: ["occurrence-source"],
    });

    const currentSourceSeries = await entities.ObjectTaskScheduleSeries.get("series-source");
    await expect(backend.mutateObjectTaskSeries(base44, user, {
      customer_id: "customer-1",
      object_id: "object-1",
      task_definition_id: "definition-1",
      series_id: "series-source",
      effective_from: "2099-05-31",
      start_time: "07:00",
      end_time: "17:00",
      recurrence_type: "one_time",
      recurrence_end_date: "2099-05-31",
      expected_version: currentSourceSeries.version,
    }, {
      idempotencyKey: "foreign-series-during-legacy-recovery",
      correlationId: "foreign-series-during-legacy-recovery",
    }, "schedule")).rejects.toMatchObject({
      status: 409,
      details: { code: "LEGACY_SINGLE_TASK_MIGRATION_RECOVERY_PENDING" },
    });
    await expect(backend.changeSingleTaskOccurrence(base44, user, {
      occurrence_id: "occurrence-source",
      source_revision_id: "revision-single",
      start_time: "11:00",
      end_time: "14:00",
      expected_occurrence_revision: 1,
      confirm_remove_outside_shifts: false,
    }, {
      idempotencyKey: "foreign-occurrence-during-legacy-recovery",
      correlationId: "foreign-occurrence-during-legacy-recovery",
    })).rejects.toMatchObject({
      status: 409,
      details: { code: "LEGACY_SINGLE_TASK_MIGRATION_RECOVERY_PENDING" },
    });
    await expect(backend.cancelTaskShift(base44, user, {
      shift_id: "shift-1",
      expected_shift_revision: 1,
      expected_occurrence_revisions: { "occurrence-source": 1 },
    }, {
      idempotencyKey: "foreign-cancel-during-legacy-recovery",
      correlationId: "foreign-cancel-during-legacy-recovery",
    })).rejects.toMatchObject({
      status: 409,
      details: { code: "LEGACY_SINGLE_TASK_MIGRATION_RECOVERY_PENDING" },
    });

    const recovered = await backend.migrateLegacySinglePlanningTasks(
      base44,
      user,
      { ...context, idempotencyKey: "retry-after-partial-legacy-impact" },
      snapshot(),
    );
    expect(recovered[0].status).toBe("migrated");
    expect(entities.PlanningShiftTaskSegment.records[0]).toMatchObject({
      task_occurrence_id: alternativeOccurrenceId,
      start_time: "10:00",
      end_time: "14:00",
    });
    expect(entities.PlanningShift.records[0]).toMatchObject({
      status: "draft",
      start_time: "10:00",
      end_time: "14:00",
      task_occurrence_ids: [alternativeOccurrenceId],
    });
    expect(entities.PlanningTaskOccurrence.records.find(item => (
      item.id === "occurrence-source"
    ))).toMatchObject({
      lifecycle_status: "superseded",
      superseded_by_task_occurrence_id: alternativeOccurrenceId,
    });
    expect(entities.ObjectTaskScheduleException.records[0]).toMatchObject({
      status: "active",
      metadata: {
        legacy_single_task_migration: {
          phase: "completed",
          source_occurrence_id: "occurrence-source",
          linked_shift_ids: ["shift-1"],
          alternative_occurrence_id: alternativeOccurrenceId,
        },
      },
    });
    expect(entities.ObjectTaskScheduleSeries.records.find(item => (
      item.id === "series-source"
    ))).toMatchObject({
      metadata: {
        legacy_single_task_migration_journal: {
          phase: "completed",
          linked_shift_ids: ["shift-1"],
          exception_id: entities.ObjectTaskScheduleException.records[0].id,
        },
      },
    });
    expect(entities.PlanningTaskOccurrence.records.filter(item => (
      item.object_task_schedule_series_id
        === entities.ObjectTaskScheduleException.records[0].alternative_series_id
      && item.service_date === "2099-05-31"
    ))).toHaveLength(1);
  });

  it("wijzigt niets als een gepland occurrence-snapshot niet veilig aan de legacy-revisie is te koppelen", async () => {
    const { base44, entities } = setup({ occurrenceStart: "11:00" });
    const before = structuredClone({
      series: entities.ObjectTaskScheduleSeries.records,
      revisions: entities.ObjectTaskScheduleRevision.records,
      exceptions: entities.ObjectTaskScheduleException.records,
      occurrences: entities.PlanningTaskOccurrence.records,
      segments: entities.PlanningShiftTaskSegment.records,
    });

    const result = await backend.migrateLegacySinglePlanningTasks(base44, user, context, {
      series: entities.ObjectTaskScheduleSeries.records,
      revisions: entities.ObjectTaskScheduleRevision.records,
      exceptions: entities.ObjectTaskScheduleException.records,
      occurrences: entities.PlanningTaskOccurrence.records,
    });

    expect(result[0]).toMatchObject({
      status: "blocked",
      code: "LEGACY_OCCURRENCE_SNAPSHOT_MISMATCH",
    });
    expect({
      series: entities.ObjectTaskScheduleSeries.records,
      revisions: entities.ObjectTaskScheduleRevision.records,
      exceptions: entities.ObjectTaskScheduleException.records,
      occurrences: entities.PlanningTaskOccurrence.records,
      segments: entities.PlanningShiftTaskSegment.records,
    }).toEqual(before);
  });
});
