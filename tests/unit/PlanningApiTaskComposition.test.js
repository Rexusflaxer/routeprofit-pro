import fs from "node:fs";
import path from "node:path";
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from "node:util";
import { fileURLToPath } from "node:url";
import { QueryClient } from "@tanstack/react-query";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { applyPlanningMutationResultToCache } from "@/components/planning/planningQueryCache";

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
      ? value.$in.some(candidate => candidate === record[key])
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

function occurrence(id, objectId, start, end, minutes) {
  return {
    id,
    source_key: `source-${id}`,
    object_task_definition_id: `definition-${id}`,
    definition_version: 1,
    schedule_period_key: `period-${id}`,
    customer_id: "customer-1",
    object_id: objectId,
    task_type: id.includes("reception") ? "reception" : "external_control_round",
    task_name_snapshot: id.includes("reception") ? "Receptiedienst" : "Controleronde",
    object_name_snapshot: objectId === "object-1" ? "Object 1" : "Object 2",
    customer_name_snapshot: "Klant 1",
    execution_mode: "continuous",
    service_date: "2026-08-17",
    end_date: "2026-08-17",
    window_start_time: start,
    window_end_time: end,
    timezone: "Europe/Amsterdam",
    required_minutes: minutes,
    lifecycle_status: "active",
    revision: 1,
    published_revision: 0,
  };
}

function withPublishedSecurityPlan(record) {
  return {
    ...record,
    security_plan_id: `security-plan-${record.id}`,
    security_plan_revision_id: `security-plan-revision-${record.id}`,
    security_plan_snapshot: {
      plan: { id: `security-plan-${record.id}` },
      published_revision: {
        id: `security-plan-revision-${record.id}`,
        security_plan_id: `security-plan-${record.id}`,
        status: "published",
        revision_number: 1,
      },
    },
  };
}

function setup(occurrences) {
  const entities = {
    PlanningTaskOccurrence: entity(occurrences, "occurrence"),
    PlanningShiftTaskSegment: entity([], "segment"),
    PlanningShift: entity([], "shift"),
    PlanningAssignment: entity([], "assignment"),
    PlanningAuditEvent: entity([], "audit"),
    PlanningMutationCoordinator: entity([], "coordinator"),
    PlanningPublication: entity([], "publication"),
    RouteExecution: entity([], "route-execution"),
    Route: entity([], "route"),
    Task: entity([], "task"),
    ObjectTaskDefinition: entity([], "object-task-definition"),
    ObjectTaskScheduleSeries: entity([], "object-task-schedule-series"),
    ObjectTaskScheduleRevision: entity([], "object-task-schedule-revision"),
    ObjectTaskScheduleException: entity([], "object-task-schedule-exception"),
    PlanningTaskSourceChange: entity([], "planning-task-source-change"),
    ObjectSecurityPlan: entity([], "object-security-plan"),
    ObjectSecurityPlanRevision: entity([], "object-security-plan-revision"),
    SurveillanceObject: entity([
      { id: "object-1", customer_id: "customer-1", name: "Object 1", default_operating_company_id: "company-1", contract_assignment_policy: "allow_manual_review" },
      { id: "object-2", customer_id: "customer-1", name: "Object 2", default_operating_company_id: "company-1", contract_assignment_policy: "allow_manual_review" },
    ], "object"),
    Customer: entity([{ id: "customer-1", trade_name: "Klant 1" }], "customer"),
    Personnel: entity([], "personnel"),
    PersonnelAbsence: entity([], "absence"),
    PersonnelRestriction: entity([], "restriction"),
    PersonnelSecurityPass: entity([], "security-pass"),
  };
  return {
    base44: { asServiceRole: { entities, functions: { invoke: async () => ({}) } } },
    entities,
  };
}

function instrumentBackendCalls(base44, entities) {
  const counts = new Map();
  const increment = key => counts.set(key, Number(counts.get(key) || 0) + 1);
  for (const [entityName, entityClient] of Object.entries(entities)) {
    for (const method of ["list", "filter", "get", "create", "updateMany"]) {
      if (typeof entityClient[method] !== "function") continue;
      const original = entityClient[method].bind(entityClient);
      entityClient[method] = async (...args) => {
        increment(`${entityName}.${method}`);
        return original(...args);
      };
    }
  }
  const originalInvoke = base44.asServiceRole.functions.invoke.bind(base44.asServiceRole.functions);
  base44.asServiceRole.functions.invoke = async (...args) => {
    increment(`functions.invoke:${args[0]}`);
    return originalInvoke(...args);
  };
  return {
    count: key => Number(counts.get(key) || 0),
    total: () => [...counts.values()].reduce((sum, value) => sum + value, 0),
  };
}

const user = { id: "admin-1", role: "admin", name: "Planner" };
const context = key => ({ idempotencyKey: key, correlationId: key });

async function prepareAssignedTaskPartition({
  key,
  startTime = "06:30",
  endTime = "18:00",
  splitTime = "15:30",
}) {
  const startMinutes = Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3));
  const endMinutes = Number(endTime.slice(0, 2)) * 60 + Number(endTime.slice(3));
  const requiredMinutes = endMinutes > startMinutes
    ? endMinutes - startMinutes
    : 24 * 60 - startMinutes + endMinutes;
  const demand = occurrence(`occurrence-${key}`, "object-1", startTime, endTime, requiredMinutes);
  if (endMinutes <= startMinutes) demand.end_date = "2026-08-18";
  const { base44, entities } = setup([demand]);
  const personnelId = `personnel-${key}`;
  entities.Personnel.records.push({ id: personnelId, name: "Dagbeveiliger", status: "active" });
  const composed = await backend.composeAndAssign(base44, user, {
    personnel_id: personnelId,
    segments: [{
      task_occurrence_id: demand.id,
      start_date: demand.service_date,
      start_time: demand.window_start_time,
      end_date: demand.end_date,
      end_time: demand.window_end_time,
    }],
    expected_occurrence_revisions: { [demand.id]: demand.revision },
  }, context(`${key}-compose`));
  const beforeResizeOccurrence = await entities.PlanningTaskOccurrence.get(demand.id);
  const splitDate = endMinutes <= startMinutes && splitTime < startTime
    ? "2026-08-18"
    : demand.service_date;
  const resized = await backend.resizeTaskShiftPreservingCoverage(base44, user, {
    shift_id: composed.shift.id,
    segment_id: composed.segments[0].id,
    start_date: demand.service_date,
    start_time: demand.window_start_time,
    end_date: splitDate,
    end_time: splitTime,
    expected_shift_revision: composed.shift.revision,
    expected_segment_revision: composed.segments[0].revision,
    expected_occurrence_revision: beforeResizeOccurrence.revision,
    expected_assignment_revisions: { [composed.assignment.id]: composed.assignment.revision },
  }, context(`${key}-resize`));
  const adjacentShift = resized.shift;
  const adjacentSegment = resized.segment;
  const adjacentAssignment = resized.assignments[0];
  const targetShift = resized.shifts.find(item => item.id !== adjacentShift.id);
  const targetSegment = resized.segments.find(item => item.shift_id === targetShift.id);
  const currentOccurrence = await entities.PlanningTaskOccurrence.get(demand.id);
  const payload = {
    target_shift_id: targetShift.id,
    target_segment_id: targetSegment.id,
    adjacent_shift_id: adjacentShift.id,
    adjacent_segment_id: adjacentSegment.id,
    adjacent_assignment_id: adjacentAssignment.id,
    personnel_id: personnelId,
    expected_target_shift_revision: targetShift.revision,
    expected_target_segment_revision: targetSegment.revision,
    expected_adjacent_shift_revision: adjacentShift.revision,
    expected_adjacent_segment_revision: adjacentSegment.revision,
    expected_adjacent_assignment_revision: adjacentAssignment.revision,
    expected_occurrence_revision: currentOccurrence.revision,
  };
  return {
    base44,
    entities,
    demand,
    personnelId,
    targetShift,
    targetSegment,
    adjacentShift,
    adjacentSegment,
    adjacentAssignment,
    payload,
  };
}

async function idempotencyClaimId(key) {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new NodeTextEncoder().encode(`${user.id}:${key}`),
  );
  const hash = [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
  return hash;
}

async function idempotencyRegistryKey(key) {
  return `idempotency_registry:v3:${(await idempotencyClaimId(key)).slice(0, 2)}`;
}

async function createWeeklyObjectTask({
  base44,
  entities,
  key,
  startDate = "2099-08-17",
  startTime = "06:30",
  endTime = "18:00",
  recurrenceEndDate = null,
  recurrenceInterval = 1,
  recurrenceAnchorDate = startDate,
  withSecurityPlan = false,
}) {
  let securityPlanId = null;
  if (withSecurityPlan) {
    securityPlanId = `security-plan-${key}`;
    const revisionId = `security-plan-revision-${key}`;
    entities.ObjectSecurityPlan.records.push({
      id: securityPlanId,
      customer_id: "customer-1",
      object_id: "object-1",
      task_type: "reception",
      status: "active",
      current_published_revision_id: revisionId,
      latest_revision_number: 1,
      version: 1,
    });
    entities.ObjectSecurityPlanRevision.records.push({
      id: revisionId,
      security_plan_id: securityPlanId,
      customer_id: "customer-1",
      object_id: "object-1",
      revision_number: 1,
      status: "published",
      content_checksum: `checksum-${key}`,
      version: 1,
    });
  }
  return backend.createObjectTask(base44, user, {
    customer_id: "customer-1",
    object_id: "object-1",
    expected_version: 0,
    task: {
      security_plan_id: securityPlanId,
      task_type: "reception",
      execution_mode: "continuous",
      instructions: "Volg de receptie-instructie.",
    },
    schedule_blocks: [{
      service_date: startDate,
      start_time: startTime,
      end_time: endTime,
      repeat_weekly: true,
      recurrence_interval: recurrenceInterval,
      recurrence_anchor_date: recurrenceAnchorDate,
      recurrence_end_date: recurrenceEndDate,
    }],
  }, context(`create-object-task-${key}`));
}

async function prepareCancellableWeeklyOccurrence({
  key,
  serviceDate = "2099-08-31",
}) {
  const { base44, entities } = setup([]);
  const created = await createWeeklyObjectTask({
    base44,
    entities,
    key,
  });
  await backend.bootstrapRange(base44, user, {
    period_start: serviceDate,
    period_end: serviceDate,
  }, context(`bootstrap-${key}`));
  const sourceOccurrence = entities.PlanningTaskOccurrence.records.find(item => (
    item.lifecycle_status === "active"
    && item.object_task_definition_id === created.definition.id
    && item.service_date === serviceDate
  ));
  const personnelId = `personnel-${key}`;
  entities.Personnel.records.push({
    id: personnelId,
    name: "Dagbeveiliger",
    status: "active",
  });
  const composition = await backend.composeAndAssign(base44, user, {
    personnel_id: personnelId,
    segments: [{
      task_occurrence_id: sourceOccurrence.id,
      start_date: sourceOccurrence.service_date,
      start_time: sourceOccurrence.window_start_time,
      end_date: sourceOccurrence.end_date,
      end_time: sourceOccurrence.window_end_time,
    }],
    expected_occurrence_revisions: {
      [sourceOccurrence.id]: sourceOccurrence.revision,
    },
  }, context(`compose-${key}`));
  const plannedOccurrence = await entities.PlanningTaskOccurrence.get(sourceOccurrence.id);
  const body = {
    occurrence_id: sourceOccurrence.id,
    source_revision_id: sourceOccurrence.object_task_schedule_revision_id,
    expected_occurrence_revision: plannedOccurrence.revision,
    cancel_occurrence: true,
    confirm_remove_outside_shifts: true,
  };
  return {
    base44,
    entities,
    created,
    sourceOccurrence: plannedOccurrence,
    composition,
    personnelId,
    body,
  };
}

function weeklyReceptionDefinitionStartingAugust17() {
  const weekdays = [
    ["mon", 1],
    ["tue", 2],
    ["wed", 3],
    ["thu", 4],
    ["fri", 5],
  ];
  return {
    id: "definition-reception-from-august-17",
    customer_id: "customer-1",
    object_id: "object-1",
    task_type: "reception",
    execution_mode: "continuous",
    recurrence_type: "weekly",
    schedule_periods: weekdays.map(([day], index) => ({
      period_key: `series-${index + 1}`,
      days: [day],
      start_time: "06:30",
      end_time: "18:00",
    })),
    weekdays: weekdays.map(([, weekday]) => weekday),
    valid_from: "2026-08-17",
    valid_until: null,
    start_time: "06:30",
    end_time: "18:00",
    duration_minutes: 690,
    status: "active",
    version: 1,
  };
}

async function createAdjacentAssignedTaskShifts({
  demand,
  base44,
  entities,
  prefix = "shared-boundary",
}) {
  entities.Personnel.records.push(
    { id: `${prefix}-early-personnel`, name: "Vroege Beveiliger", status: "active" },
    { id: `${prefix}-late-personnel`, name: "Late Beveiliger", status: "active" },
  );
  const early = await backend.composeAndAssign(base44, user, {
    personnel_id: `${prefix}-early-personnel`,
    segments: [{ task_occurrence_id: demand.id, start_time: "10:00", end_time: "14:00" }],
    expected_occurrence_revisions: { [demand.id]: 1 },
  }, context(`${prefix}-compose-early`));
  const afterEarly = await entities.PlanningTaskOccurrence.get(demand.id);
  const late = await backend.composeAndAssign(base44, user, {
    personnel_id: `${prefix}-late-personnel`,
    segments: [{ task_occurrence_id: demand.id, start_time: "14:00", end_time: "18:00" }],
    expected_occurrence_revisions: { [demand.id]: afterEarly.revision },
  }, context(`${prefix}-compose-late`));
  const currentOccurrence = await entities.PlanningTaskOccurrence.get(demand.id);
  return {
    early,
    late,
    currentOccurrence,
    body: {
      action: "resize_shared_task_boundary",
      task_occurrence_id: demand.id,
      left_shift_id: early.shift.id,
      left_segment_id: early.segments[0].id,
      right_shift_id: late.shift.id,
      right_segment_id: late.segments[0].id,
      boundary_date: demand.service_date,
      boundary_time: "15:00",
      expected_shift_revisions: {
        [early.shift.id]: early.shift.revision,
        [late.shift.id]: late.shift.revision,
      },
      expected_segment_revisions: {
        [early.segments[0].id]: early.segments[0].revision,
        [late.segments[0].id]: late.segments[0].revision,
      },
      expected_assignment_revisions: {
        [early.assignment.id]: early.assignment.revision,
        [late.assignment.id]: late.assignment.revision,
      },
      expected_occurrence_revision: currentOccurrence.revision,
    },
  };
}

function addCarryInPublicationFixture(entities, externalShiftStatus) {
  const demand = withPublishedSecurityPlan({
    ...occurrence("occurrence-reception-carry-in", "object-1", "22:00", "06:00", 480),
    service_date: "2026-08-16",
    end_date: "2026-08-17",
  });
  entities.PlanningTaskOccurrence.records.push(demand);
  entities.PlanningShift.records.push(
    {
      id: "shift-sunday-external",
      source_key: "manual-sunday-external",
      source_type: "manual",
      service_name_snapshot: "Zondagse nachtdienst",
      service_date: "2026-08-16",
      end_date: "2026-08-17",
      start_time: "22:00",
      end_time: "02:00",
      required_count: 1,
      status: externalShiftStatus,
      revision: 1,
      published_revision: externalShiftStatus === "published" ? 1 : 0,
    },
    {
      id: "shift-monday-selected",
      source_key: "manual-monday-selected",
      source_type: "manual",
      service_name_snapshot: "Maandagse carry-in dienst",
      service_date: "2026-08-17",
      end_date: "2026-08-17",
      start_time: "02:00",
      end_time: "06:00",
      required_count: 1,
      status: "draft",
      revision: 1,
      published_revision: 0,
    },
  );
  entities.PlanningShiftTaskSegment.records.push(
    {
      id: "segment-sunday-external",
      shift_id: "shift-sunday-external",
      task_occurrence_id: demand.id,
      object_task_definition_id: demand.object_task_definition_id,
      sequence_index: 0,
      start_date: "2026-08-16",
      end_date: "2026-08-17",
      start_time: "22:00",
      end_time: "02:00",
      timezone: "Europe/Amsterdam",
      duration_minutes: 240,
      customer_id: demand.customer_id,
      object_id: demand.object_id,
      task_type: demand.task_type,
      task_name_snapshot: demand.task_name_snapshot,
      status: "published",
      revision: 1,
      published_revision: 1,
    },
    {
      id: "segment-monday-selected",
      shift_id: "shift-monday-selected",
      task_occurrence_id: demand.id,
      object_task_definition_id: demand.object_task_definition_id,
      sequence_index: 0,
      start_date: "2026-08-17",
      end_date: "2026-08-17",
      start_time: "02:00",
      end_time: "06:00",
      timezone: "Europe/Amsterdam",
      duration_minutes: 240,
      customer_id: demand.customer_id,
      object_id: demand.object_id,
      task_type: demand.task_type,
      task_name_snapshot: demand.task_name_snapshot,
      status: "draft",
      revision: 1,
      published_revision: 0,
    },
  );
  if (externalShiftStatus === "published") {
    const externalShift = entities.PlanningShift.records.find(item => item.id === "shift-sunday-external");
    const externalSegment = entities.PlanningShiftTaskSegment.records.find(item => item.id === "segment-sunday-external");
    entities.PlanningPublication.records.push({
      id: "publication-sunday-external",
      scope_type: "selection",
      scope_key: "selection:sunday-external",
      period_start: "2026-08-16",
      period_end: "2026-08-16",
      version: 1,
      checksum: "checksum-sunday-external",
      published_at: "2026-08-16T20:00:00.000Z",
      correlation_id: "publish-sunday-external",
      idempotency_key: "publish-sunday-external",
      metadata: {
        actor_user_id: user.id,
        request_hash: "request-sunday-external",
      },
      snapshot: {
        shifts: [structuredClone(externalShift)],
        task_segments: [structuredClone(externalSegment)],
      },
    });
    entities.PlanningAuditEvent.records.push({
      id: "audit-sunday-external",
      action: "publish",
      resource_type: "PlanningPublication",
      resource_id: "publication-sunday-external",
      publication_id: "publication-sunday-external",
      actor_user_id: user.id,
      idempotency_key: "publish-sunday-external",
      metadata: {
        request_hash: "request-sunday-external",
        publication_checksum: "checksum-sunday-external",
      },
    });
    // Live records may evolve after publication; carry-in evidence must keep
    // using the exact immutable, audited revision above.
    externalShift.status = "draft";
    externalShift.revision = 2;
    externalShift.start_time = "23:00";
    externalSegment.status = "draft";
    externalSegment.revision = 2;
    externalSegment.start_time = "23:00";
  }
  return demand;
}

describe("planningApi occurrence-generatie", () => {
  it("materialiseert meerdere weekperioden en normaliseert 24:00 naar de volgende dag", () => {
    const weekly = backend.occurrenceBlueprints({
      id: "definition-1",
      version: 1,
      status: "active",
      recurrence_type: "weekly",
      execution_mode: "continuous",
      task_type: "reception",
      schedule_periods: [
        { period_key: "monday-day", days: ["mon"], start_time: "08:00", end_time: "16:00" },
        { period_key: "monday-night", days: ["mon"], start_time: "20:00", end_time: "24:00" },
      ],
    }, "2026-08-17", "2026-08-17");

    expect(weekly).toHaveLength(2);
    expect(weekly[0]).toMatchObject({ source_key: "object-task:definition-1:monday-day:2026-08-17", required_minutes: 480 });
    expect(weekly[1]).toMatchObject({ end_date: "2026-08-18", window_end_time: "00:00", required_minutes: 240 });
  });

  it("hanteert voor vandaag de Amsterdamse klok als harde backendgrens", () => {
    const clock = backend.amsterdamServerClock(new Date("2026-08-14T12:36:30.000Z"));

    expect(clock).toMatchObject({
      timezone: "Europe/Amsterdam",
      date: "2026-08-14",
      time: "14:36",
      minute_of_day: 14 * 60 + 36,
    });
    for (const [serviceDate, startTime] of [
      ["2026-08-13", "23:55"],
      ["2026-08-14", "14:35"],
      ["2026-08-14", "14:36"],
    ]) {
      let error = null;
      try {
        backend.assertFutureSchedule(serviceDate, startTime, clock);
      } catch (caught) {
        error = caught;
      }
      expect(error).toMatchObject({
        status: 409,
        details: {
          code: "TASK_SCHEDULE_IN_PAST",
          service_date: serviceDate,
          start_time: startTime,
          server_clock: clock,
        },
      });
    }

    expect(() => backend.assertFutureSchedule("2026-08-14", "14:40", clock)).not.toThrow();
    expect(() => backend.assertFutureSchedule("2026-08-15", "00:00", clock)).not.toThrow();
  });

  it("materialiseert een weekreeks tot en met de inclusieve einddatum", async () => {
    const { base44, entities } = setup([]);
    const created = await createWeeklyObjectTask({
      base44,
      entities,
      key: "inclusive-end",
      recurrenceEndDate: "2099-08-31",
    });

    expect(created.series).toEqual([
      expect.objectContaining({
        current_revision: expect.objectContaining({
          recurrence_type: "weekly",
          weekday: 1,
          effective_from: "2099-08-17",
          recurrence_end_date: "2099-08-31",
        }),
      }),
    ]);

    await backend.bootstrapRange(base44, user, {
      period_start: "2099-08-17",
      period_end: "2099-09-07",
    }, context("bootstrap-weekly-inclusive-end"));

    expect(entities.PlanningTaskOccurrence.records
      .filter(item => item.lifecycle_status === "active")
      .map(item => item.service_date)
      .sort()).toEqual([
      "2099-08-17",
      "2099-08-24",
      "2099-08-31",
    ]);
  });

  it("projecteert uitsluitend revisies die vanaf current_revision_id bereikbaar zijn", async () => {
    const { base44, entities } = setup([]);
    const created = await createWeeklyObjectTask({
      base44,
      entities,
      key: "ignore-orphan-blueprint-revision",
    });
    const scheduleSeries = created.series[0].series;
    const currentRevision = created.series[0].current_revision;
    await entities.ObjectTaskScheduleRevision.create({
      ...currentRevision,
      id: "orphan-blueprint-revision",
      revision_number: 99,
      previous_revision_id: currentRevision.id,
      effective_from: "2099-08-24",
      start_time: "22:00",
      end_time: "23:00",
      creation_idempotency_key: "orphan-blueprint-revision",
      creation_request_fingerprint: "orphan-blueprint-revision",
    });

    await backend.bootstrapRange(base44, user, {
      period_start: "2099-08-24",
      period_end: "2099-08-24",
    }, context("bootstrap-ignores-orphan-blueprint-revision"));

    expect(await entities.ObjectTaskScheduleSeries.get(scheduleSeries.id)).toMatchObject({
      current_revision_id: currentRevision.id,
      current_revision_number: 1,
    });
    expect(entities.PlanningTaskOccurrence.records.filter(item => (
      item.lifecycle_status === "active" && item.service_date === "2099-08-24"
    ))).toEqual([expect.objectContaining({
      object_task_schedule_revision_id: currentRevision.id,
      window_start_time: "06:30",
      window_end_time: "18:00",
    })]);
  });

  it("projecteert fail-closed zolang een nieuwe reeks nog geen current_revision_id heeft", async () => {
    const { base44, entities } = setup([]);
    const created = await createWeeklyObjectTask({
      base44,
      entities,
      key: "null-pointer-orphan-blueprint-revision",
    });
    const scheduleSeries = entities.ObjectTaskScheduleSeries.records.find(item => (
      item.id === created.series[0].series.id
    ));
    scheduleSeries.current_revision_id = null;
    scheduleSeries.current_revision_number = 0;

    await backend.bootstrapRange(base44, user, {
      period_start: "2099-08-24",
      period_end: "2099-08-24",
    }, context("bootstrap-ignores-null-pointer-orphan-revision"));

    expect(entities.ObjectTaskScheduleRevision.records.filter(item => (
      item.series_id === scheduleSeries.id
    ))).toHaveLength(1);
    expect(entities.PlanningTaskOccurrence.records.filter(item => (
      item.lifecycle_status === "active" && item.service_date === "2099-08-24"
    ))).toEqual([]);
  });

  it("stopt een weekreeks vanaf de gekozen occurrence en laat eerdere uitvoeringen staan", async () => {
    const { base44, entities } = setup([]);
    const created = await createWeeklyObjectTask({
      base44,
      entities,
      key: "stop-from-occurrence",
    });
    await backend.bootstrapRange(base44, user, {
      period_start: "2099-08-17",
      period_end: "2099-09-07",
    }, context("bootstrap-before-series-stop"));
    const scheduleSeries = created.series[0].series;

    const stopped = await backend.mutateObjectTaskSeries(base44, user, {
      customer_id: "customer-1",
      object_id: "object-1",
      task_definition_id: created.definition.id,
      series_id: scheduleSeries.id,
      effective_from: "2099-08-31",
      expected_version: scheduleSeries.version,
    }, context("stop-weekly-from-occurrence"), "stop");

    expect(stopped.current_revision).toMatchObject({
      operation: "stop",
      effective_from: "2099-08-31",
      revision_number: 2,
    });
    expect(entities.PlanningTaskOccurrence.records
      .filter(item => item.lifecycle_status === "active")
      .map(item => item.service_date)
      .sort()).toEqual([
      "2099-08-17",
      "2099-08-24",
    ]);
    expect(entities.PlanningTaskOccurrence.records
      .filter(item => item.lifecycle_status === "superseded")
      .map(item => item.service_date)
      .sort()).toEqual([
      "2099-08-31",
      "2099-09-07",
    ]);
  });

  it("maakt na stoppen en opnieuw tekenen een nieuwe reeks zonder de oude historie te heropenen", async () => {
    const { base44, entities } = setup([]);
    const created = await createWeeklyObjectTask({
      base44,
      entities,
      key: "redraw-after-stop",
    });
    await backend.bootstrapRange(base44, user, {
      period_start: "2099-08-17",
      period_end: "2099-09-07",
    }, context("bootstrap-before-redraw-after-stop"));
    const stoppedSeries = created.series[0].series;
    const stopped = await backend.mutateObjectTaskSeries(base44, user, {
      customer_id: "customer-1",
      object_id: "object-1",
      task_definition_id: created.definition.id,
      series_id: stoppedSeries.id,
      effective_from: "2099-08-31",
      expected_version: stoppedSeries.version,
    }, context("stop-before-redraw"), "stop");

    const body = {
      customer_id: "customer-1",
      object_id: "object-1",
      task_definition_id: created.definition.id,
      expected_version: stopped.definition.version,
      schedule_block: {
        service_date: "2099-08-31",
        start_time: "12:00",
        end_time: "18:00",
        repeat_weekly: true,
        recurrence_end_date: null,
      },
    };
    const mutation = context("add-series-after-stop");
    const added = await backend.addObjectTaskSeries(base44, user, body, mutation);
    const replay = await backend.addObjectTaskSeries(base44, user, body, mutation);

    expect(added.series).toMatchObject({
      object_task_definition_id: created.definition.id,
      status: "active",
      current_revision_number: 1,
    });
    expect(added.series.id).not.toBe(stoppedSeries.id);
    expect(added.current_revision).toMatchObject({
      series_id: added.series.id,
      operation: "schedule",
      effective_from: "2099-08-31",
      start_time: "12:00",
      end_time: "18:00",
      recurrence_type: "weekly",
    });
    expect(replay).toMatchObject({
      ok: true,
      idempotent: true,
      series: { id: added.series.id },
    });
    expect(entities.ObjectTaskScheduleSeries.records).toHaveLength(2);
    expect(entities.ObjectTaskScheduleRevision.records).toHaveLength(3);

    await backend.bootstrapRange(base44, user, {
      period_start: "2099-08-31",
      period_end: "2099-09-07",
    }, context("bootstrap-after-redraw"));
    expect(entities.PlanningTaskOccurrence.records
      .filter(item => item.lifecycle_status === "active" && item.service_date >= "2099-08-31")
      .map(item => ({
        service_date: item.service_date,
        series_id: item.object_task_schedule_series_id,
        start_time: item.window_start_time,
      }))
      .sort((left, right) => left.service_date.localeCompare(right.service_date))).toEqual([
      { service_date: "2099-08-31", series_id: added.series.id, start_time: "12:00" },
      { service_date: "2099-09-07", series_id: added.series.id, start_time: "12:00" },
    ]);
    expect(entities.PlanningTaskOccurrence.records
      .filter(item => item.object_task_schedule_series_id === stoppedSeries.id && item.service_date >= "2099-08-31")
      .every(item => item.lifecycle_status === "superseded")).toBe(true);
  });
});

describe("planningApi losse taakuitzonderingen vanuit Planning", () => {
  it("houdt bij een oorspronkelijke eenmalige taak ook de legacy objectkaartspiegel gelijk", async () => {
    const { base44, entities } = setup([]);
    const created = await backend.createObjectTask(base44, user, {
      customer_id: "customer-1",
      object_id: "object-1",
      expected_version: 0,
      task: {
        task_type: "reception",
        execution_mode: "continuous",
        instructions: "Eenmalige receptietaak.",
      },
      schedule_blocks: [{
        service_date: "2099-08-24",
        start_time: "08:00",
        end_time: "12:00",
        recurrence_type: "one_time",
      }],
    }, context("create-one-time-task-for-single-edit"));
    await backend.bootstrapRange(base44, user, {
      period_start: "2099-08-24",
      period_end: "2099-08-24",
    }, context("bootstrap-one-time-task-for-single-edit"));
    const sourceOccurrence = entities.PlanningTaskOccurrence.records.find(item => (
      item.lifecycle_status === "active"
      && item.object_task_definition_id === created.definition.id
      && item.service_date === "2099-08-24"
    ));

    const changed = await backend.changeSingleTaskOccurrence(base44, user, {
      occurrence_id: sourceOccurrence.id,
      source_revision_id: sourceOccurrence.object_task_schedule_revision_id,
      start_time: "09:00",
      end_time: "13:30",
      expected_occurrence_revision: sourceOccurrence.revision,
      confirm_remove_outside_shifts: false,
    }, context("edit-one-time-task-and-mirror"));

    expect(changed.task_schedule_exception).toBeNull();
    expect(changed.alternative_series).toBeNull();
    expect(await entities.ObjectTaskDefinition.get(created.definition.id)).toMatchObject({
      recurrence_type: "one_time",
      specific_date: "2099-08-24",
      start_time: "09:00",
      end_time: "13:30",
      schedule_periods: [expect.objectContaining({
        start_time: "09:00",
        end_time: "13:30",
      })],
      metadata: expect.objectContaining({
        last_single_occurrence_mirror_mutation: expect.objectContaining({
          idempotency_key: "edit-one-time-task-and-mirror",
          revision_id: changed.task_occurrences.find(item => item.lifecycle_status === "active")
            .object_task_schedule_revision_id,
        }),
      }),
    });
  });

  it("maakt voor één weekoccurrence een actieve uitzondering en een eigen one_time-reeks en replayt idempotent", async () => {
    const { base44, entities } = setup([]);
    const created = await createWeeklyObjectTask({
      base44,
      entities,
      key: "single-weekly-alternative",
    });
    await backend.bootstrapRange(base44, user, {
      period_start: "2099-08-24",
      period_end: "2099-08-24",
    }, context("bootstrap-single-weekly-alternative"));
    const sourceSeries = created.series[0].series;
    const sourceOccurrence = entities.PlanningTaskOccurrence.records.find(item => (
      item.lifecycle_status === "active"
      && item.object_task_definition_id === created.definition.id
      && item.service_date === "2099-08-24"
    ));
    const body = {
      occurrence_id: sourceOccurrence.id,
      source_revision_id: sourceOccurrence.object_task_schedule_revision_id,
      start_time: "08:00",
      end_time: "16:00",
      expected_occurrence_revision: sourceOccurrence.revision,
      confirm_remove_outside_shifts: false,
    };
    const mutation = context("change-single-weekly-alternative");

    const changed = await backend.changeSingleTaskOccurrence(base44, user, body, mutation);
    const replacement = changed.task_occurrences.find(item => item.lifecycle_status === "active");
    const stateAfterFirst = structuredClone({
      occurrences: entities.PlanningTaskOccurrence.records,
      series: entities.ObjectTaskScheduleSeries.records,
      revisions: entities.ObjectTaskScheduleRevision.records,
      exceptions: entities.ObjectTaskScheduleException.records,
    });
    const replay = await backend.changeSingleTaskOccurrence(base44, user, body, mutation);

    expect(changed.task_schedule_exception).toMatchObject({
      source_series_id: sourceSeries.id,
      service_date: "2099-08-24",
      kind: "alternative",
      status: "active",
      alternative_series_id: changed.alternative_series.id,
      alternative_revision_id: changed.alternative_revision.id,
    });
    expect(changed.alternative_series).toMatchObject({
      object_task_definition_id: created.definition.id,
      status: "active",
      metadata: {
        schedule_kind: "alternative",
        source_series_id: sourceSeries.id,
      },
    });
    expect(changed.alternative_series.id).not.toBe(sourceSeries.id);
    expect(changed.alternative_revision).toMatchObject({
      series_id: changed.alternative_series.id,
      recurrence_type: "one_time",
      recurrence_interval: 1,
      recurrence_anchor_date: "2099-08-24",
      effective_from: "2099-08-24",
      recurrence_end_date: "2099-08-24",
      start_time: "08:00",
      end_time: "16:00",
    });
    expect(await entities.PlanningTaskOccurrence.get(sourceOccurrence.id)).toMatchObject({
      lifecycle_status: "superseded",
      superseded_by_task_occurrence_id: replacement.id,
    });
    expect(replacement).toMatchObject({
      lifecycle_status: "active",
      supersedes_task_occurrence_id: sourceOccurrence.id,
      object_task_schedule_series_id: changed.alternative_series.id,
      object_task_schedule_revision_id: changed.alternative_revision.id,
      logical_source_key: sourceOccurrence.logical_source_key,
      service_date: "2099-08-24",
      window_start_time: "08:00",
      window_end_time: "16:00",
      metadata: expect.objectContaining({
        planning_alternative: true,
        task_schedule_exception_id: changed.task_schedule_exception.id,
      }),
    });
    expect(replay).toMatchObject({
      ok: true,
      idempotent: true,
      audit_event_id: changed.audit_event_id,
      task_schedule_exception: { id: changed.task_schedule_exception.id },
      alternative_series: { id: changed.alternative_series.id },
      alternative_revision: { id: changed.alternative_revision.id },
    });
    expect({
      occurrences: entities.PlanningTaskOccurrence.records,
      series: entities.ObjectTaskScheduleSeries.records,
      revisions: entities.ObjectTaskScheduleRevision.records,
      exceptions: entities.ObjectTaskScheduleException.records,
    }).toEqual(stateAfterFirst);
    expect(entities.PlanningAuditEvent.records.filter(item => (
      item.action === "change_single_task_occurrence"
    ))).toHaveLength(1);
  });

  it("behoudt een week-2-alternatief en de oorspronkelijke recurrence-anchor bij een latere bronwijziging", async () => {
    const { base44, entities } = setup([]);
    const created = await createWeeklyObjectTask({
      base44,
      entities,
      key: "weekly-two-anchor-alternative",
      recurrenceInterval: 2,
      recurrenceAnchorDate: "2099-08-17",
    });
    await backend.bootstrapRange(base44, user, {
      period_start: "2099-08-17",
      period_end: "2099-08-31",
    }, context("bootstrap-weekly-two-before-alternative"));
    const sourceSeries = created.series[0].series;
    const sourceOccurrence = entities.PlanningTaskOccurrence.records.find(item => (
      item.lifecycle_status === "active"
      && item.object_task_definition_id === created.definition.id
      && item.service_date === "2099-08-31"
    ));
    const alternative = await backend.changeSingleTaskOccurrence(base44, user, {
      occurrence_id: sourceOccurrence.id,
      source_revision_id: sourceOccurrence.object_task_schedule_revision_id,
      start_time: "09:00",
      end_time: "15:00",
      expected_occurrence_revision: sourceOccurrence.revision,
      confirm_remove_outside_shifts: false,
    }, context("change-weekly-two-alternative"));
    const alternativeOccurrence = alternative.task_occurrences.find(item => item.lifecycle_status === "active");
    const currentSourceSeries = await entities.ObjectTaskScheduleSeries.get(sourceSeries.id);

    const changedSource = await backend.mutateObjectTaskSeries(base44, user, {
      customer_id: "customer-1",
      object_id: "object-1",
      task_definition_id: created.definition.id,
      series_id: sourceSeries.id,
      effective_from: "2099-08-31",
      start_time: "07:00",
      end_time: "17:00",
      repeat_weekly: true,
      recurrence_end_date: null,
      expected_version: currentSourceSeries.version,
    }, context("change-weekly-two-source-after-alternative"), "schedule");
    await backend.bootstrapRange(base44, user, {
      period_start: "2099-08-17",
      period_end: "2099-09-28",
    }, context("bootstrap-weekly-two-after-source-change"));

    expect(changedSource.current_revision).toMatchObject({
      recurrence_type: "weekly",
      recurrence_interval: 2,
      recurrence_anchor_date: "2099-08-17",
      effective_from: "2099-08-31",
      start_time: "07:00",
      end_time: "17:00",
    });
    expect(await entities.ObjectTaskScheduleException.get(alternative.task_schedule_exception.id)).toMatchObject({
      status: "active",
      source_series_id: sourceSeries.id,
      alternative_series_id: alternative.alternative_series.id,
      service_date: "2099-08-31",
    });
    expect(await entities.PlanningTaskOccurrence.get(alternativeOccurrence.id)).toMatchObject({
      lifecycle_status: "active",
      object_task_schedule_series_id: alternative.alternative_series.id,
      window_start_time: "09:00",
      window_end_time: "15:00",
    });
    const active = entities.PlanningTaskOccurrence.records
      .filter(item => (
        item.lifecycle_status === "active"
        && item.object_task_definition_id === created.definition.id
      ))
      .sort((left, right) => left.service_date.localeCompare(right.service_date));
    expect(active.map(item => item.service_date)).toEqual([
      "2099-08-17",
      "2099-08-31",
      "2099-09-14",
      "2099-09-28",
    ]);
    expect(active.find(item => item.service_date === "2099-08-31")).toMatchObject({
      id: alternativeOccurrence.id,
      object_task_schedule_series_id: alternative.alternative_series.id,
      window_start_time: "09:00",
    });
    expect(active.filter(item => ["2099-09-14", "2099-09-28"].includes(item.service_date))).toEqual([
      expect.objectContaining({
        object_task_schedule_series_id: sourceSeries.id,
        object_task_schedule_revision_id: changedSource.current_revision.id,
        window_start_time: "07:00",
      }),
      expect.objectContaining({
        object_task_schedule_series_id: sourceSeries.id,
        object_task_schedule_revision_id: changedSource.current_revision.id,
        window_start_time: "07:00",
      }),
    ]);
  });

  it("annuleert alleen de gekozen week-2-occurrence en laat de blauwdrukcadans intact", async () => {
    const { base44, entities } = setup([]);
    const created = await createWeeklyObjectTask({
      base44,
      entities,
      key: "cancel-single-weekly-two-occurrence",
      recurrenceInterval: 2,
      recurrenceAnchorDate: "2099-08-17",
    });
    await backend.bootstrapRange(base44, user, {
      period_start: "2099-08-17",
      period_end: "2099-09-14",
    }, context("bootstrap-before-cancel-single-weekly-two"));
    const sourceSeries = created.series[0].series;
    const sourceRevision = created.series[0].current_revision;
    const sourceSeriesBefore = structuredClone(await entities.ObjectTaskScheduleSeries.get(sourceSeries.id));
    const sourceRevisionsBefore = structuredClone(entities.ObjectTaskScheduleRevision.records.filter(item => (
      item.series_id === sourceSeries.id
    )));
    const sourceOccurrence = entities.PlanningTaskOccurrence.records.find(item => (
      item.lifecycle_status === "active"
      && item.object_task_schedule_series_id === sourceSeries.id
      && item.service_date === "2099-08-31"
    ));
    const composition = await backend.composeShift(base44, user, {
      segments: [{
        task_occurrence_id: sourceOccurrence.id,
        start_time: "06:30",
        end_time: "18:00",
      }],
      expected_occurrence_revisions: { [sourceOccurrence.id]: sourceOccurrence.revision },
    }, context("compose-before-cancel-single-weekly-two"));
    const plannedOccurrence = await entities.PlanningTaskOccurrence.get(sourceOccurrence.id);
    const body = {
      occurrence_id: sourceOccurrence.id,
      source_revision_id: sourceRevision.id,
      expected_occurrence_revision: plannedOccurrence.revision,
      cancel_occurrence: true,
      confirm_remove_outside_shifts: true,
    };
    const mutation = context("cancel-single-weekly-two");

    const cancelled = await backend.changeSingleTaskOccurrence(base44, user, body, mutation);
    const replay = await backend.changeSingleTaskOccurrence(base44, user, body, mutation);

    expect(cancelled.task_schedule_exception).toMatchObject({
      source_series_id: sourceSeries.id,
      source_revision_id: sourceRevision.id,
      service_date: "2099-08-31",
      kind: "cancelled",
      status: "active",
      alternative_series_id: null,
      alternative_revision_id: null,
    });
    expect(cancelled.alternative_series).toBeNull();
    expect(cancelled.alternative_revision).toBeNull();
    expect(cancelled.task_occurrences).toEqual([expect.objectContaining({
      id: sourceOccurrence.id,
      lifecycle_status: "superseded",
      superseded_by_task_occurrence_id: null,
      metadata: expect.objectContaining({ cancelled_from_planning: true }),
    })]);
    expect(cancelled.shifts).toEqual([expect.objectContaining({
      id: composition.shift.id,
      status: "cancelled",
      task_occurrence_ids: [],
      task_segment_count: 0,
    })]);
    expect(cancelled.segments).toEqual([expect.objectContaining({
      id: composition.segments[0].id,
      status: "removed",
    })]);
    expect(await entities.ObjectTaskScheduleSeries.get(sourceSeries.id)).toEqual(sourceSeriesBefore);
    expect(entities.ObjectTaskScheduleRevision.records.filter(item => (
      item.series_id === sourceSeries.id
    ))).toEqual(sourceRevisionsBefore);
    expect(replay).toMatchObject({
      ok: true,
      idempotent: true,
      audit_event_id: cancelled.audit_event_id,
      task_schedule_exception: { id: cancelled.task_schedule_exception.id },
    });
    expect(entities.ObjectTaskScheduleException.records).toHaveLength(1);
    expect(entities.PlanningAuditEvent.records.filter(item => (
      item.action === "change_single_task_occurrence"
    ))).toHaveLength(1);

    await backend.bootstrapRange(base44, user, {
      period_start: "2099-08-17",
      period_end: "2099-09-14",
    }, context("bootstrap-after-cancel-single-weekly-two"));
    expect(entities.PlanningTaskOccurrence.records.filter(item => (
      item.lifecycle_status === "active"
      && item.object_task_schedule_series_id === sourceSeries.id
    )).map(item => item.service_date).sort()).toEqual([
      "2099-08-17",
      "2099-09-14",
    ]);
  });

  it("annuleert een reeds begonnen ongepubliceerde taak met dienst en medewerker", async () => {
    const fixture = await prepareCancellableWeeklyOccurrence({
      key: "cancel-started-unpublished-occurrence",
    });
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2099-08-31T07:00:00.000Z"));
      expect(backend.amsterdamServerClock()).toMatchObject({
        date: "2099-08-31",
        time: "09:00",
      });

      const cancelled = await backend.changeSingleTaskOccurrence(
        fixture.base44,
        user,
        fixture.body,
        context("cancel-started-unpublished-occurrence"),
      );

      expect(cancelled.task_schedule_exception).toMatchObject({
        service_date: "2099-08-31",
        kind: "cancelled",
        status: "active",
      });
      expect(cancelled.task_occurrences).toEqual([
        expect.objectContaining({
          id: fixture.sourceOccurrence.id,
          lifecycle_status: "superseded",
          superseded_by_task_occurrence_id: null,
        }),
      ]);
      expect(cancelled.shifts).toEqual([
        expect.objectContaining({
          id: fixture.composition.shift.id,
          status: "cancelled",
        }),
      ]);
      expect(cancelled.segments).toEqual([
        expect.objectContaining({
          id: fixture.composition.segments[0].id,
          status: "removed",
        }),
      ]);
      expect(cancelled.assignments).toEqual([
        expect.objectContaining({
          id: fixture.composition.assignment.id,
          status: "removed",
        }),
      ]);
      expect(cancelled.removed_segment_ids).toEqual([fixture.composition.segments[0].id]);
      expect(cancelled.removed_assignment_ids).toEqual([fixture.composition.assignment.id]);
      expect(fixture.entities.PlanningAuditEvent.records.filter(item => (
        item.action === "change_single_task_occurrence"
      ))).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("verwijdert uit een samengestelde dienst alleen het gekozen taakdeel en behoudt de medewerker", async () => {
    const { base44, entities } = setup([]);
    const earlyTask = await createWeeklyObjectTask({
      base44,
      entities,
      key: "cancel-composed-early-task",
      startTime: "06:30",
      endTime: "12:00",
    });
    const lateTask = await createWeeklyObjectTask({
      base44,
      entities,
      key: "cancel-composed-late-task",
      startTime: "12:00",
      endTime: "18:00",
    });
    await backend.bootstrapRange(base44, user, {
      period_start: "2099-08-31",
      period_end: "2099-08-31",
    }, context("bootstrap-cancel-composed-task"));
    const earlyOccurrence = entities.PlanningTaskOccurrence.records.find(item => (
      item.lifecycle_status === "active"
      && item.object_task_definition_id === earlyTask.definition.id
      && item.service_date === "2099-08-31"
    ));
    const lateOccurrence = entities.PlanningTaskOccurrence.records.find(item => (
      item.lifecycle_status === "active"
      && item.object_task_definition_id === lateTask.definition.id
      && item.service_date === "2099-08-31"
    ));
    entities.Personnel.records.push({
      id: "personnel-cancel-composed-task",
      name: "Samengestelde beveiliger",
      status: "active",
    });
    const composition = await backend.composeAndAssign(base44, user, {
      personnel_id: "personnel-cancel-composed-task",
      segments: [
        {
          task_occurrence_id: earlyOccurrence.id,
          start_date: "2099-08-31",
          end_date: "2099-08-31",
          start_time: "06:30",
          end_time: "12:00",
        },
        {
          task_occurrence_id: lateOccurrence.id,
          start_date: "2099-08-31",
          end_date: "2099-08-31",
          start_time: "12:00",
          end_time: "18:00",
        },
      ],
      expected_occurrence_revisions: {
        [earlyOccurrence.id]: earlyOccurrence.revision,
        [lateOccurrence.id]: lateOccurrence.revision,
      },
    }, context("compose-before-partial-task-cancel"));
    const earlySegment = composition.segments.find(item => (
      item.task_occurrence_id === earlyOccurrence.id
    ));
    const lateSegment = composition.segments.find(item => (
      item.task_occurrence_id === lateOccurrence.id
    ));
    const currentEarlyOccurrence = await entities.PlanningTaskOccurrence.get(earlyOccurrence.id);

    const cancelled = await backend.changeSingleTaskOccurrence(base44, user, {
      occurrence_id: earlyOccurrence.id,
      source_revision_id: earlyOccurrence.object_task_schedule_revision_id,
      expected_occurrence_revision: currentEarlyOccurrence.revision,
      cancel_occurrence: true,
      confirm_remove_outside_shifts: true,
    }, context("cancel-one-task-from-composed-shift"));

    expect(cancelled.task_occurrences).toContainEqual(expect.objectContaining({
      id: earlyOccurrence.id,
      lifecycle_status: "superseded",
    }));
    expect(cancelled.shifts).toContainEqual(expect.objectContaining({
      id: composition.shift.id,
      status: "draft",
      start_time: "12:00",
      end_time: "18:00",
      task_occurrence_ids: [lateOccurrence.id],
      task_segment_count: 1,
    }));
    expect(await entities.PlanningShiftTaskSegment.get(earlySegment.id)).toMatchObject({
      status: "removed",
      task_occurrence_id: earlyOccurrence.id,
    });
    expect(await entities.PlanningShiftTaskSegment.get(lateSegment.id)).toMatchObject({
      status: "draft",
      task_occurrence_id: lateOccurrence.id,
    });
    expect(await entities.PlanningAssignment.get(composition.assignment.id)).toMatchObject({
      status: "draft",
      personnel_id: "personnel-cancel-composed-task",
      metadata: expect.objectContaining({
        task_boundary_revalidated_at: expect.any(String),
        source_task_occurrence_id: earlyOccurrence.id,
      }),
    });
    expect(cancelled.removed_segment_ids).toEqual([earlySegment.id]);
    expect(cancelled.removed_assignment_ids).toEqual([]);
  });

  it("houdt een reeds begonnen gepubliceerde taakdienst fail-closed", async () => {
    const fixture = await prepareCancellableWeeklyOccurrence({
      key: "cancel-started-published-occurrence",
    });
    const storedShift = fixture.entities.PlanningShift.records.find(item => (
      item.id === fixture.composition.shift.id
    ));
    storedShift.status = "published";
    storedShift.published_revision = 1;
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2099-08-31T07:00:00.000Z"));

      await expect(backend.changeSingleTaskOccurrence(
        fixture.base44,
        user,
        fixture.body,
        context("cancel-started-published-occurrence"),
      )).rejects.toMatchObject({
        status: 409,
        details: {
          code: "TASK_PUBLISHED_SHIFT_CANCELLATION_REQUIRED",
          shifts: [expect.objectContaining({ id: fixture.composition.shift.id })],
        },
      });
      expect(fixture.entities.ObjectTaskScheduleException.records).toHaveLength(0);
      expect(fixture.entities.PlanningAuditEvent.records.filter(item => (
        item.action === "change_single_task_occurrence"
      ))).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("blijft een taakwijziging naar een reeds begonnen tijd weigeren", async () => {
    const fixture = await prepareCancellableWeeklyOccurrence({
      key: "edit-started-occurrence-remains-blocked",
    });
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2099-08-31T07:00:00.000Z"));

      await expect(backend.changeSingleTaskOccurrence(
        fixture.base44,
        user,
        {
          occurrence_id: fixture.sourceOccurrence.id,
          source_revision_id: fixture.sourceOccurrence.object_task_schedule_revision_id,
          expected_occurrence_revision: fixture.sourceOccurrence.revision,
          start_time: "08:00",
          end_time: "16:00",
          confirm_remove_outside_shifts: true,
        },
        context("edit-started-occurrence-remains-blocked"),
      )).rejects.toMatchObject({
        status: 409,
        details: {
          code: "TASK_SCHEDULE_IN_PAST",
          service_date: "2099-08-31",
          start_time: "08:00",
        },
      });
      expect(fixture.entities.ObjectTaskScheduleException.records).toHaveLength(0);
      expect(fixture.entities.PlanningAuditEvent.records.filter(item => (
        item.action === "change_single_task_occurrence"
      ))).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("herstelt een onderbroken annulering na de starttijd exact eenmaal", async () => {
    const fixture = await prepareCancellableWeeklyOccurrence({
      key: "recover-cancel-after-start-boundary",
    });
    const mutation = context("recover-cancel-after-start-boundary");
    const originalExceptionCreate = fixture.entities.ObjectTaskScheduleException.create
      .bind(fixture.entities.ObjectTaskScheduleException);
    let failExceptionOnce = true;
    fixture.entities.ObjectTaskScheduleException.create = async data => {
      if (failExceptionOnce) {
        failExceptionOnce = false;
        throw new Error("tijdelijke cancel-exception-writefout");
      }
      return originalExceptionCreate(data);
    };
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2099-08-31T04:00:00.000Z"));
      expect(backend.amsterdamServerClock()).toMatchObject({ time: "06:00" });
      await expect(backend.changeSingleTaskOccurrence(
        fixture.base44,
        user,
        fixture.body,
        mutation,
      )).rejects.toThrow("tijdelijke cancel-exception-writefout");
      expect(await fixture.entities.PlanningTaskOccurrence.get(fixture.sourceOccurrence.id))
        .toMatchObject({
          lifecycle_status: "active",
          metadata: {
            single_task_occurrence_mutation: {
              phase: "state_written_audit_pending",
              idempotency_key: mutation.idempotencyKey,
            },
          },
        });

      vi.setSystemTime(new Date("2099-08-31T07:00:00.000Z"));
      expect(backend.amsterdamServerClock()).toMatchObject({ time: "09:00" });
      const recovery = await backend.bootstrapRange(fixture.base44, user, {
        period_start: "2099-08-31",
        period_end: "2099-08-31",
      }, context("bootstrap-late-recover-cancel-after-start-boundary"));
      const replay = await backend.changeSingleTaskOccurrence(
        fixture.base44,
        user,
        fixture.body,
        mutation,
      );

      expect(recovery.repaired_single_task_occurrence_ids)
        .toContain(fixture.sourceOccurrence.id);
      expect(replay).toMatchObject({
        ok: true,
        idempotent: true,
        task_schedule_exception: {
          kind: "cancelled",
          status: "active",
        },
      });
      expect(fixture.entities.ObjectTaskScheduleException.records).toHaveLength(1);
      expect(fixture.entities.PlanningAuditEvent.records.filter(item => (
        item.action === "change_single_task_occurrence"
        && item.idempotency_key === mutation.idempotencyKey
      ))).toHaveLength(1);
      expect(await fixture.entities.PlanningShift.get(fixture.composition.shift.id))
        .toMatchObject({ status: "cancelled" });
      expect(await fixture.entities.PlanningAssignment.get(fixture.composition.assignment.id))
        .toMatchObject({ status: "removed" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("wijzigt een bestaand planningalternatief alleen binnen diens eigen one_time-reeks", async () => {
    const { base44, entities } = setup([]);
    const created = await createWeeklyObjectTask({
      base44,
      entities,
      key: "edit-existing-alternative",
    });
    await backend.bootstrapRange(base44, user, {
      period_start: "2099-08-24",
      period_end: "2099-08-24",
    }, context("bootstrap-edit-existing-alternative"));
    const sourceSeries = created.series[0].series;
    const sourceOccurrence = entities.PlanningTaskOccurrence.records.find(item => (
      item.lifecycle_status === "active"
      && item.object_task_definition_id === created.definition.id
      && item.service_date === "2099-08-24"
    ));
    const first = await backend.changeSingleTaskOccurrence(base44, user, {
      occurrence_id: sourceOccurrence.id,
      source_revision_id: sourceOccurrence.object_task_schedule_revision_id,
      start_time: "08:00",
      end_time: "16:00",
      expected_occurrence_revision: sourceOccurrence.revision,
      confirm_remove_outside_shifts: false,
    }, context("create-existing-alternative"));
    const firstAlternativeOccurrence = first.task_occurrences.find(item => item.lifecycle_status === "active");
    const sourceSeriesBefore = structuredClone(await entities.ObjectTaskScheduleSeries.get(sourceSeries.id));
    const sourceRevisionsBefore = structuredClone(entities.ObjectTaskScheduleRevision.records.filter(item => (
      item.series_id === sourceSeries.id
    )));

    const second = await backend.changeSingleTaskOccurrence(base44, user, {
      occurrence_id: firstAlternativeOccurrence.id,
      source_revision_id: firstAlternativeOccurrence.object_task_schedule_revision_id,
      start_time: "09:00",
      end_time: "13:00",
      expected_occurrence_revision: firstAlternativeOccurrence.revision,
      confirm_remove_outside_shifts: false,
    }, context("edit-existing-alternative-second-time"));
    const secondAlternativeOccurrence = second.task_occurrences.find(item => item.lifecycle_status === "active");

    expect(second.task_schedule_exception).toMatchObject({
      id: first.task_schedule_exception.id,
      status: "active",
      source_series_id: sourceSeries.id,
      alternative_series_id: first.alternative_series.id,
      alternative_revision_id: second.alternative_revision.id,
    });
    expect(second.alternative_series).toMatchObject({
      id: first.alternative_series.id,
      current_revision_id: second.alternative_revision.id,
      current_revision_number: 2,
      metadata: expect.objectContaining({ schedule_kind: "alternative" }),
    });
    expect(second.alternative_revision).toMatchObject({
      series_id: first.alternative_series.id,
      previous_revision_id: first.alternative_revision.id,
      revision_number: 2,
      recurrence_type: "one_time",
      recurrence_anchor_date: "2099-08-24",
      start_time: "09:00",
      end_time: "13:00",
    });
    expect(await entities.PlanningTaskOccurrence.get(firstAlternativeOccurrence.id)).toMatchObject({
      lifecycle_status: "superseded",
      superseded_by_task_occurrence_id: secondAlternativeOccurrence.id,
    });
    expect(secondAlternativeOccurrence).toMatchObject({
      lifecycle_status: "active",
      object_task_schedule_series_id: first.alternative_series.id,
      object_task_schedule_revision_id: second.alternative_revision.id,
      supersedes_task_occurrence_id: firstAlternativeOccurrence.id,
      window_start_time: "09:00",
      window_end_time: "13:00",
    });
    expect(await entities.ObjectTaskScheduleSeries.get(sourceSeries.id)).toEqual(sourceSeriesBefore);
    expect(entities.ObjectTaskScheduleRevision.records.filter(item => (
      item.series_id === sourceSeries.id
    ))).toEqual(sourceRevisionsBefore);
    expect(entities.ObjectTaskScheduleException.records).toHaveLength(1);
    expect(entities.PlanningTaskOccurrence.records.filter(item => (
      item.lifecycle_status === "active"
      && item.object_task_definition_id === created.definition.id
      && item.service_date === "2099-08-24"
    ))).toEqual([expect.objectContaining({ id: secondAlternativeOccurrence.id })]);
  });

  it("annuleert een bestaand planningalternatief zonder de oorspronkelijke weekreeks te stoppen", async () => {
    const { base44, entities } = setup([]);
    const created = await createWeeklyObjectTask({
      base44,
      entities,
      key: "cancel-existing-alternative",
    });
    await backend.bootstrapRange(base44, user, {
      period_start: "2099-08-24",
      period_end: "2099-08-31",
    }, context("bootstrap-before-cancel-existing-alternative"));
    const sourceSeries = created.series[0].series;
    const sourceSeriesBefore = structuredClone(await entities.ObjectTaskScheduleSeries.get(sourceSeries.id));
    const sourceOccurrence = entities.PlanningTaskOccurrence.records.find(item => (
      item.lifecycle_status === "active"
      && item.object_task_schedule_series_id === sourceSeries.id
      && item.service_date === "2099-08-24"
    ));
    const alternative = await backend.changeSingleTaskOccurrence(base44, user, {
      occurrence_id: sourceOccurrence.id,
      source_revision_id: sourceOccurrence.object_task_schedule_revision_id,
      start_time: "08:00",
      end_time: "16:00",
      expected_occurrence_revision: sourceOccurrence.revision,
      confirm_remove_outside_shifts: false,
    }, context("create-before-cancel-existing-alternative"));
    const alternativeOccurrence = alternative.task_occurrences.find(item => (
      item.lifecycle_status === "active"
    ));

    const cancelled = await backend.changeSingleTaskOccurrence(base44, user, {
      occurrence_id: alternativeOccurrence.id,
      source_revision_id: alternativeOccurrence.object_task_schedule_revision_id,
      expected_occurrence_revision: alternativeOccurrence.revision,
      cancel_occurrence: true,
      confirm_remove_outside_shifts: true,
    }, context("cancel-existing-alternative"));

    expect(cancelled.task_schedule_exception).toMatchObject({
      id: alternative.task_schedule_exception.id,
      source_series_id: sourceSeries.id,
      alternative_series_id: alternative.alternative_series.id,
      service_date: "2099-08-24",
      kind: "cancelled",
      status: "active",
    });
    expect(cancelled.alternative_series).toBeNull();
    expect(cancelled.alternative_revision).toBeNull();
    expect(await entities.ObjectTaskScheduleSeries.get(alternative.alternative_series.id)).toMatchObject({
      status: "stopped",
      current_revision_number: 2,
    });
    expect(await entities.PlanningTaskOccurrence.get(alternativeOccurrence.id)).toMatchObject({
      lifecycle_status: "superseded",
      superseded_by_task_occurrence_id: null,
      metadata: expect.objectContaining({ cancelled_from_planning: true }),
    });
    expect(await entities.ObjectTaskScheduleSeries.get(sourceSeries.id)).toEqual(sourceSeriesBefore);

    await backend.bootstrapRange(base44, user, {
      period_start: "2099-08-24",
      period_end: "2099-08-31",
    }, context("bootstrap-after-cancel-existing-alternative"));
    expect(entities.PlanningTaskOccurrence.records.filter(item => (
      item.lifecycle_status === "active"
      && item.object_task_definition_id === created.definition.id
    )).map(item => item.service_date)).toEqual(["2099-08-31"]);
  });

  it("wijzigt en verwijdert een planningalternatief vanuit de objectkaart zonder de bronreeks te veranderen", async () => {
    const { base44, entities } = setup([]);
    const created = await createWeeklyObjectTask({
      base44,
      entities,
      key: "object-card-edits-alternative",
    });
    await backend.bootstrapRange(base44, user, {
      period_start: "2099-08-24",
      period_end: "2099-08-31",
    }, context("bootstrap-object-card-alternative"));
    const sourceSeries = created.series[0].series;
    const sourceOccurrence = entities.PlanningTaskOccurrence.records.find(item => (
      item.lifecycle_status === "active"
      && item.object_task_schedule_series_id === sourceSeries.id
      && item.service_date === "2099-08-24"
    ));
    const alternative = await backend.changeSingleTaskOccurrence(base44, user, {
      occurrence_id: sourceOccurrence.id,
      source_revision_id: sourceOccurrence.object_task_schedule_revision_id,
      start_time: "08:00",
      end_time: "16:00",
      expected_occurrence_revision: sourceOccurrence.revision,
      confirm_remove_outside_shifts: false,
    }, context("create-object-card-alternative"));
    const sourceSeriesBefore = structuredClone(await entities.ObjectTaskScheduleSeries.get(sourceSeries.id));
    const sourceRevisionsBefore = structuredClone(entities.ObjectTaskScheduleRevision.records.filter(item => (
      item.series_id === sourceSeries.id
    )));

    const changed = await backend.mutateObjectTaskSeries(base44, user, {
      customer_id: "customer-1",
      object_id: "object-1",
      task_definition_id: created.definition.id,
      series_id: alternative.alternative_series.id,
      effective_from: "2099-08-24",
      start_time: "09:15",
      end_time: "13:45",
      recurrence_type: "one_time",
      recurrence_interval: 1,
      recurrence_end_date: "2099-08-24",
      expected_version: alternative.alternative_series.version,
    }, context("object-card-change-alternative"), "schedule");

    expect(changed.task_schedule_exception).toMatchObject({
      id: alternative.task_schedule_exception.id,
      source_series_id: sourceSeries.id,
      alternative_series_id: alternative.alternative_series.id,
      alternative_revision_id: changed.current_revision.id,
      service_date: "2099-08-24",
      kind: "alternative",
      status: "active",
    });
    expect(entities.PlanningTaskOccurrence.records.filter(item => (
      item.lifecycle_status === "active"
      && item.object_task_definition_id === created.definition.id
      && item.service_date === "2099-08-24"
    ))).toEqual([expect.objectContaining({
      object_task_schedule_series_id: alternative.alternative_series.id,
      object_task_schedule_revision_id: changed.current_revision.id,
      window_start_time: "09:15",
      window_end_time: "13:45",
    })]);
    expect(await entities.ObjectTaskScheduleSeries.get(sourceSeries.id)).toEqual(sourceSeriesBefore);
    expect(entities.ObjectTaskScheduleRevision.records.filter(item => (
      item.series_id === sourceSeries.id
    ))).toEqual(sourceRevisionsBefore);

    const stopped = await backend.mutateObjectTaskSeries(base44, user, {
      customer_id: "customer-1",
      object_id: "object-1",
      task_definition_id: created.definition.id,
      series_id: alternative.alternative_series.id,
      effective_from: "2099-08-24",
      expected_version: changed.series.version,
    }, context("object-card-stop-alternative"), "stop");
    await backend.bootstrapRange(base44, user, {
      period_start: "2099-08-24",
      period_end: "2099-08-31",
    }, context("bootstrap-after-object-card-stop-alternative"));

    expect(stopped.task_schedule_exception).toMatchObject({
      id: alternative.task_schedule_exception.id,
      kind: "cancelled",
      status: "active",
      alternative_revision_id: stopped.current_revision.id,
    });
    expect(entities.PlanningTaskOccurrence.records.filter(item => (
      item.lifecycle_status === "active"
      && item.object_task_definition_id === created.definition.id
      && item.service_date === "2099-08-24"
    ))).toEqual([]);
    expect(entities.PlanningTaskOccurrence.records.filter(item => (
      item.lifecycle_status === "active"
      && item.object_task_schedule_series_id === sourceSeries.id
      && item.service_date === "2099-08-31"
    ))).toHaveLength(1);
    expect(await entities.ObjectTaskScheduleSeries.get(sourceSeries.id)).toEqual(sourceSeriesBefore);
    expect(entities.ObjectTaskScheduleRevision.records.filter(item => (
      item.series_id === sourceSeries.id
    ))).toEqual(sourceRevisionsBefore);
  });

  it("houdt een objectkaart-alternatief strikt eenmalig en blokkeert dubbel gekoppelde uitzonderingen", async () => {
    const { base44, entities } = setup([]);
    const created = await createWeeklyObjectTask({
      base44,
      entities,
      key: "object-card-alternative-fences",
    });
    await backend.bootstrapRange(base44, user, {
      period_start: "2099-08-24",
      period_end: "2099-08-24",
    }, context("bootstrap-object-card-alternative-fences"));
    const sourceOccurrence = entities.PlanningTaskOccurrence.records.find(item => (
      item.lifecycle_status === "active" && item.service_date === "2099-08-24"
    ));
    const alternative = await backend.changeSingleTaskOccurrence(base44, user, {
      occurrence_id: sourceOccurrence.id,
      source_revision_id: sourceOccurrence.object_task_schedule_revision_id,
      start_time: "08:00",
      end_time: "16:00",
      expected_occurrence_revision: sourceOccurrence.revision,
      confirm_remove_outside_shifts: false,
    }, context("create-object-card-alternative-fences"));
    const recurringBody = {
      customer_id: "customer-1",
      object_id: "object-1",
      task_definition_id: created.definition.id,
      series_id: alternative.alternative_series.id,
      effective_from: "2099-08-24",
      start_time: "09:00",
      end_time: "13:00",
      recurrence_type: "weekly",
      recurrence_interval: 1,
      repeat_weekly: true,
      recurrence_end_date: null,
      expected_version: alternative.alternative_series.version,
    };

    await expect(backend.mutateObjectTaskSeries(
      base44,
      user,
      recurringBody,
      context("reject-recurring-object-card-alternative"),
      "schedule",
    )).rejects.toMatchObject({
      status: 409,
      details: { code: "TASK_ALTERNATIVE_MUST_REMAIN_ONE_TIME" },
    });

    entities.ObjectTaskScheduleException.records.push({
      ...structuredClone(alternative.task_schedule_exception),
      id: "duplicate-object-card-alternative-exception",
      exception_key: "duplicate-object-card-alternative-exception",
      version: 1,
    });
    await expect(backend.mutateObjectTaskSeries(base44, user, {
      ...recurringBody,
      recurrence_type: "one_time",
      repeat_weekly: false,
      recurrence_end_date: "2099-08-24",
    }, context("reject-ambiguous-object-card-alternative"), "schedule")).rejects.toMatchObject({
      status: 409,
      details: { code: "TASK_ALTERNATIVE_EXCEPTION_AMBIGUOUS" },
    });
  });

  it("herstelt een objectkaart-stop van een alternatief idempotent na uitval tussen uitzondering en reeks", async () => {
    const { base44, entities } = setup([]);
    const created = await createWeeklyObjectTask({
      base44,
      entities,
      key: "recover-object-card-alternative-stop",
    });
    await backend.bootstrapRange(base44, user, {
      period_start: "2099-08-24",
      period_end: "2099-08-24",
    }, context("bootstrap-recover-object-card-alternative-stop"));
    const sourceOccurrence = entities.PlanningTaskOccurrence.records.find(item => (
      item.lifecycle_status === "active" && item.service_date === "2099-08-24"
    ));
    const alternative = await backend.changeSingleTaskOccurrence(base44, user, {
      occurrence_id: sourceOccurrence.id,
      source_revision_id: sourceOccurrence.object_task_schedule_revision_id,
      start_time: "08:00",
      end_time: "16:00",
      expected_occurrence_revision: sourceOccurrence.revision,
      confirm_remove_outside_shifts: false,
    }, context("create-recoverable-object-card-alternative"));
    const stopBody = {
      customer_id: "customer-1",
      object_id: "object-1",
      task_definition_id: created.definition.id,
      series_id: alternative.alternative_series.id,
      effective_from: "2099-08-24",
      expected_version: alternative.alternative_series.version,
    };
    const stopContext = context("recover-object-card-alternative-stop");
    const originalUpdateMany = entities.ObjectTaskScheduleSeries.updateMany
      .bind(entities.ObjectTaskScheduleSeries);
    let failSeriesAdvanceOnce = true;
    entities.ObjectTaskScheduleSeries.updateMany = async (query, update) => {
      if (
        failSeriesAdvanceOnce
        && String(query.id) === String(alternative.alternative_series.id)
        && update?.$set?.status === "stopped"
      ) {
        failSeriesAdvanceOnce = false;
        throw new Error("simulated series pointer failure");
      }
      return originalUpdateMany(query, update);
    };

    await expect(backend.mutateObjectTaskSeries(
      base44,
      user,
      stopBody,
      stopContext,
      "stop",
    )).rejects.toThrow("simulated series pointer failure");
    const preparedException = await entities.ObjectTaskScheduleException.get(
      alternative.task_schedule_exception.id,
    );
    const unchangedAlternative = await entities.ObjectTaskScheduleSeries.get(
      alternative.alternative_series.id,
    );
    expect(preparedException).toMatchObject({
      kind: "cancelled",
      alternative_revision_id: expect.any(String),
      metadata: {
        last_alternative_object_task_mutation: expect.objectContaining({
          idempotency_key: stopContext.idempotencyKey,
        }),
      },
    });
    expect(unchangedAlternative).toMatchObject({
      status: "active",
      current_revision_id: alternative.alternative_revision.id,
    });

    const recovered = await backend.mutateObjectTaskSeries(
      base44,
      user,
      stopBody,
      stopContext,
      "stop",
    );
    expect(recovered).toMatchObject({
      ok: true,
      series: {
        id: alternative.alternative_series.id,
        status: "stopped",
      },
      task_schedule_exception: {
        id: alternative.task_schedule_exception.id,
        kind: "cancelled",
        alternative_revision_id: recovered.current_revision.id,
      },
    });
    expect(entities.ObjectTaskScheduleRevision.records.filter(item => (
      item.series_id === alternative.alternative_series.id
      && item.operation === "stop"
    ))).toHaveLength(1);
  });

  it("laat een late retry van een oude alternatief-stop een nieuwere uitzondering niet annuleren", async () => {
    const { base44, entities } = setup([]);
    const created = await createWeeklyObjectTask({
      base44,
      entities,
      key: "stale-object-card-alternative-stop",
    });
    await backend.bootstrapRange(base44, user, {
      period_start: "2099-08-24",
      period_end: "2099-08-24",
    }, context("bootstrap-stale-object-card-alternative-stop"));
    const sourceOccurrence = entities.PlanningTaskOccurrence.records.find(item => (
      item.lifecycle_status === "active" && item.service_date === "2099-08-24"
    ));
    const alternative = await backend.changeSingleTaskOccurrence(base44, user, {
      occurrence_id: sourceOccurrence.id,
      source_revision_id: sourceOccurrence.object_task_schedule_revision_id,
      start_time: "08:00",
      end_time: "16:00",
      expected_occurrence_revision: sourceOccurrence.revision,
      confirm_remove_outside_shifts: false,
    }, context("create-stale-stop-alternative"));
    const stopBody = {
      customer_id: "customer-1",
      object_id: "object-1",
      task_definition_id: created.definition.id,
      series_id: alternative.alternative_series.id,
      effective_from: "2099-08-24",
      expected_version: alternative.alternative_series.version,
    };
    const stopContext = context("stale-alternative-stop-retry");
    const originalSeriesUpdateMany = entities.ObjectTaskScheduleSeries.updateMany
      .bind(entities.ObjectTaskScheduleSeries);
    let failSeriesAdvanceOnce = true;
    entities.ObjectTaskScheduleSeries.updateMany = async (query, update) => {
      if (
        failSeriesAdvanceOnce
        && String(query.id) === String(alternative.alternative_series.id)
        && update?.$set?.status === "stopped"
      ) {
        failSeriesAdvanceOnce = false;
        throw new Error("simulated stale stop pointer failure");
      }
      return originalSeriesUpdateMany(query, update);
    };

    await expect(backend.mutateObjectTaskSeries(
      base44,
      user,
      stopBody,
      stopContext,
      "stop",
    )).rejects.toThrow("simulated stale stop pointer failure");
    const staleStopRevision = entities.ObjectTaskScheduleRevision.records.find(item => (
      item.series_id === alternative.alternative_series.id && item.operation === "stop"
    ));
    const newerRevision = await entities.ObjectTaskScheduleRevision.create({
      ...alternative.alternative_revision,
      id: "newer-alternative-revision-after-stale-stop",
      revision_number: Number(staleStopRevision.revision_number) + 1,
      previous_revision_id: alternative.alternative_revision.id,
      start_time: "09:00",
      end_time: "15:00",
      creation_idempotency_key: "newer-alternative-revision-after-stale-stop",
      creation_request_fingerprint: "newer-alternative-revision-after-stale-stop",
    });
    const seriesBeforeNewer = await entities.ObjectTaskScheduleSeries.get(
      alternative.alternative_series.id,
    );
    await originalSeriesUpdateMany(
      { id: seriesBeforeNewer.id, version: seriesBeforeNewer.version },
      {
        $set: {
          current_revision_id: newerRevision.id,
          current_revision_number: newerRevision.revision_number,
          status: "active",
        },
        $inc: { version: 1 },
      },
    );
    const exceptionBeforeNewer = await entities.ObjectTaskScheduleException.get(
      alternative.task_schedule_exception.id,
    );
    await entities.ObjectTaskScheduleException.updateMany(
      { id: exceptionBeforeNewer.id, version: exceptionBeforeNewer.version },
      {
        $set: {
          kind: "alternative",
          alternative_revision_id: newerRevision.id,
        },
        $inc: { version: 1 },
      },
    );

    await expect(backend.mutateObjectTaskSeries(
      base44,
      user,
      stopBody,
      stopContext,
      "stop",
    )).rejects.toMatchObject({
      status: 409,
      details: { code: "TASK_SERIES_NEWER_REVISION" },
    });
    expect(await entities.ObjectTaskScheduleException.get(
      alternative.task_schedule_exception.id,
    )).toMatchObject({
      kind: "alternative",
      alternative_revision_id: newerRevision.id,
    });
    expect(await entities.ObjectTaskScheduleSeries.get(
      alternative.alternative_series.id,
    )).toMatchObject({
      current_revision_id: newerRevision.id,
      current_revision_number: newerRevision.revision_number,
      status: "active",
    });
  });

  it("vereist bevestiging voor een buitenvallende dienst en migreert daarna segmenten en dienstgrenzen", async () => {
    const { base44, entities } = setup([]);
    entities.Personnel.records.push({
      id: "personnel-task-boundary-revalidation",
      name: "Hercontrole Beveiliger",
      status: "active",
    });
    const created = await createWeeklyObjectTask({
      base44,
      entities,
      key: "planned-alternative-migration",
    });
    await backend.bootstrapRange(base44, user, {
      period_start: "2099-08-24",
      period_end: "2099-08-24",
    }, context("bootstrap-planned-alternative-migration"));
    const sourceOccurrence = entities.PlanningTaskOccurrence.records.find(item => (
      item.lifecycle_status === "active"
      && item.object_task_definition_id === created.definition.id
      && item.service_date === "2099-08-24"
    ));
    const outside = await backend.composeShift(base44, user, {
      segments: [{
        task_occurrence_id: sourceOccurrence.id,
        start_time: "06:30",
        end_time: "08:00",
      }],
      expected_occurrence_revisions: { [sourceOccurrence.id]: sourceOccurrence.revision },
    }, context("compose-outside-before-single-change"));
    const afterOutside = await entities.PlanningTaskOccurrence.get(sourceOccurrence.id);
    const overlapping = await backend.composeAndAssign(base44, user, {
      personnel_id: "personnel-task-boundary-revalidation",
      segments: [{
        task_occurrence_id: sourceOccurrence.id,
        start_time: "08:00",
        end_time: "18:00",
      }],
      expected_occurrence_revisions: { [sourceOccurrence.id]: afterOutside.revision },
    }, context("compose-overlap-before-single-change"));
    const plannedOccurrence = await entities.PlanningTaskOccurrence.get(sourceOccurrence.id);
    const body = {
      occurrence_id: sourceOccurrence.id,
      source_revision_id: sourceOccurrence.object_task_schedule_revision_id,
      start_time: "08:00",
      end_time: "14:00",
      expected_occurrence_revision: plannedOccurrence.revision,
      confirm_remove_outside_shifts: false,
    };

    await expect(backend.changeSingleTaskOccurrence(
      base44,
      user,
      body,
      context("reject-unconfirmed-outside-shift"),
    )).rejects.toMatchObject({
      status: 409,
      details: {
        code: "TASK_SHIFT_REMOVAL_CONFIRMATION_REQUIRED",
        shifts: [expect.objectContaining({ id: outside.shift.id })],
      },
    });
    expect(entities.ObjectTaskScheduleException.records).toHaveLength(0);
    expect(entities.ObjectTaskScheduleSeries.records).toHaveLength(1);

    const changed = await backend.changeSingleTaskOccurrence(base44, user, {
      ...body,
      confirm_remove_outside_shifts: true,
    }, context("confirm-outside-shift-migration"));
    const replacement = changed.task_occurrences.find(item => item.lifecycle_status === "active");
    const outsideSegment = await entities.PlanningShiftTaskSegment.get(outside.segments[0].id);
    const overlappingSegment = await entities.PlanningShiftTaskSegment.get(overlapping.segments[0].id);

    expect(await entities.PlanningShift.get(outside.shift.id)).toMatchObject({
      status: "cancelled",
      task_occurrence_ids: [],
      task_segment_count: 0,
    });
    expect(outsideSegment).toMatchObject({
      status: "removed",
      task_occurrence_id: sourceOccurrence.id,
      metadata: expect.objectContaining({ removed_by_task_boundary_change: true }),
    });
    expect(await entities.PlanningShift.get(overlapping.shift.id)).toMatchObject({
      status: "draft",
      service_date: "2099-08-24",
      start_time: "08:00",
      end_time: "14:00",
      duration_minutes: 360,
      task_occurrence_ids: [replacement.id],
      task_segment_count: 1,
      metadata: expect.objectContaining({
        source_task_occurrence_id: sourceOccurrence.id,
        replacement_task_occurrence_id: replacement.id,
      }),
    });
    expect(overlappingSegment).toMatchObject({
      status: "draft",
      task_occurrence_id: replacement.id,
      start_time: "08:00",
      end_time: "14:00",
      duration_minutes: 360,
      metadata: expect.objectContaining({
        source_task_occurrence_id: sourceOccurrence.id,
        migrated_by_task_boundary_change: true,
      }),
    });
    expect(await entities.PlanningAssignment.get(overlapping.assignment.id)).toMatchObject({
      status: "draft",
      personnel_id: "personnel-task-boundary-revalidation",
      metadata: expect.objectContaining({
        task_boundary_revalidated_at: expect.any(String),
        source_task_occurrence_id: sourceOccurrence.id,
        replacement_task_occurrence_id: replacement.id,
      }),
    });
    expect(changed.removed_segment_ids).toContain(outsideSegment.id);
    expect(changed.shifts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: outside.shift.id, status: "cancelled" }),
      expect.objectContaining({ id: overlapping.shift.id, end_time: "14:00" }),
    ]));
    expect(changed.segments).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: outsideSegment.id, status: "removed" }),
      expect.objectContaining({ id: overlappingSegment.id, task_occurrence_id: replacement.id }),
    ]));
  });

  it("herstelt dezelfde dienst nadat de segmentmigratie wel en de dienstgrens nog niet was opgeslagen", async () => {
    const { base44, entities } = setup([]);
    const created = await createWeeklyObjectTask({
      base44,
      entities,
      key: "recover-partial-single-occurrence-migration",
    });
    await backend.bootstrapRange(base44, user, {
      period_start: "2099-08-24",
      period_end: "2099-08-24",
    }, context("bootstrap-partial-single-occurrence-migration"));
    const sourceOccurrence = entities.PlanningTaskOccurrence.records.find(item => (
      item.lifecycle_status === "active"
      && item.object_task_definition_id === created.definition.id
      && item.service_date === "2099-08-24"
    ));
    const composition = await backend.composeShift(base44, user, {
      segments: [{
        task_occurrence_id: sourceOccurrence.id,
        start_time: "06:30",
        end_time: "18:00",
      }],
      expected_occurrence_revisions: { [sourceOccurrence.id]: sourceOccurrence.revision },
    }, context("compose-before-partial-single-occurrence-migration"));
    const plannedOccurrence = await entities.PlanningTaskOccurrence.get(sourceOccurrence.id);
    const body = {
      occurrence_id: sourceOccurrence.id,
      source_revision_id: sourceOccurrence.object_task_schedule_revision_id,
      start_time: "08:00",
      end_time: "14:00",
      expected_occurrence_revision: plannedOccurrence.revision,
      confirm_remove_outside_shifts: false,
    };
    const mutation = context("partial-single-occurrence-migration");
    const originalShiftUpdateMany = entities.PlanningShift.updateMany.bind(entities.PlanningShift);
    let failBoundaryShiftOnce = true;
    entities.PlanningShift.updateMany = async (query, update) => {
      if (failBoundaryShiftOnce && update.$set?.metadata?.task_boundary_migrated_at) {
        failBoundaryShiftOnce = false;
        throw new Error("tijdelijke dienstgrens-writefout");
      }
      return originalShiftUpdateMany(query, update);
    };

    await expect(backend.changeSingleTaskOccurrence(base44, user, body, mutation))
      .rejects.toThrow("tijdelijke dienstgrens-writefout");
    const replacementAfterFailure = entities.PlanningTaskOccurrence.records.find(item => (
      item.lifecycle_status === "active"
      && item.supersedes_task_occurrence_id === sourceOccurrence.id
    ));
    expect(await entities.PlanningShiftTaskSegment.get(composition.segments[0].id)).toMatchObject({
      task_occurrence_id: replacementAfterFailure.id,
      start_time: "08:00",
      end_time: "14:00",
    });
    expect(await entities.PlanningShift.get(composition.shift.id)).toMatchObject({
      start_time: "06:30",
      end_time: "18:00",
      task_occurrence_ids: [sourceOccurrence.id],
    });

    const recovered = await backend.changeSingleTaskOccurrence(base44, user, body, mutation);
    const replacement = recovered.task_occurrences.find(item => item.lifecycle_status === "active");
    expect(await entities.PlanningShift.get(composition.shift.id)).toMatchObject({
      status: "draft",
      start_time: "08:00",
      end_time: "14:00",
      duration_minutes: 360,
      task_occurrence_ids: [replacement.id],
      task_segment_count: 1,
    });
    expect(entities.ObjectTaskScheduleException.records).toHaveLength(1);
    expect(entities.PlanningAuditEvent.records.filter(item => (
      item.action === "change_single_task_occurrence"
    ))).toHaveLength(1);
  });

  it("herlaadt de blauwdrukprojectie nadat bootstrap een onderbroken alternatief heeft hersteld", async () => {
    const { base44, entities } = setup([]);
    const created = await createWeeklyObjectTask({
      base44,
      entities,
      key: "bootstrap-reloads-repaired-alternative",
    });
    await backend.bootstrapRange(base44, user, {
      period_start: "2099-08-24",
      period_end: "2099-08-24",
    }, context("bootstrap-before-repaired-alternative"));
    const sourceOccurrence = entities.PlanningTaskOccurrence.records.find(item => (
      item.lifecycle_status === "active"
      && item.object_task_definition_id === created.definition.id
      && item.service_date === "2099-08-24"
    ));
    const body = {
      occurrence_id: sourceOccurrence.id,
      source_revision_id: sourceOccurrence.object_task_schedule_revision_id,
      start_time: "09:00",
      end_time: "15:00",
      expected_occurrence_revision: sourceOccurrence.revision,
      confirm_remove_outside_shifts: false,
    };
    const originalExceptionCreate = entities.ObjectTaskScheduleException.create
      .bind(entities.ObjectTaskScheduleException);
    let failExceptionOnce = true;
    entities.ObjectTaskScheduleException.create = async data => {
      if (failExceptionOnce) {
        failExceptionOnce = false;
        throw new Error("tijdelijke exception-writefout");
      }
      return originalExceptionCreate(data);
    };

    await expect(backend.changeSingleTaskOccurrence(
      base44,
      user,
      body,
      context("repair-alternative-during-bootstrap"),
    )).rejects.toThrow("tijdelijke exception-writefout");

    const bootstrap = await backend.bootstrapRange(base44, user, {
      period_start: "2099-08-24",
      period_end: "2099-08-24",
    }, context("bootstrap-repairs-and-reloads-alternative"));
    const active = entities.PlanningTaskOccurrence.records.filter(item => (
      item.lifecycle_status === "active"
      && item.object_task_definition_id === created.definition.id
      && item.service_date === "2099-08-24"
    ));

    expect(bootstrap.repaired_single_task_occurrence_ids).toContain(sourceOccurrence.id);
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({
      window_start_time: "09:00",
      window_end_time: "15:00",
      metadata: expect.objectContaining({ planning_alternative: true }),
    });
    expect(active[0].object_task_schedule_series_id)
      .toBe(entities.ObjectTaskScheduleException.records[0].alternative_series_id);
    expect(await entities.PlanningTaskOccurrence.get(sourceOccurrence.id)).toMatchObject({
      lifecycle_status: "superseded",
      superseded_by_task_occurrence_id: active[0].id,
    });
  });

  it("weigert een losse taakwijziging als er tussen preflight en lease een dienst bijkomt", async () => {
    const { base44, entities } = setup([]);
    const created = await createWeeklyObjectTask({
      base44,
      entities,
      key: "single-occurrence-impact-race",
    });
    await backend.bootstrapRange(base44, user, {
      period_start: "2099-08-24",
      period_end: "2099-08-24",
    }, context("bootstrap-single-occurrence-impact-race"));
    const sourceOccurrence = entities.PlanningTaskOccurrence.records.find(item => (
      item.lifecycle_status === "active"
      && item.object_task_definition_id === created.definition.id
      && item.service_date === "2099-08-24"
    ));
    const originalCoordinatorUpdate = entities.PlanningMutationCoordinator.updateMany
      .bind(entities.PlanningMutationCoordinator);
    let injectLinkedShift = true;
    entities.PlanningMutationCoordinator.updateMany = async (query, update) => {
      const result = await originalCoordinatorUpdate(query, update);
      if (injectLinkedShift && update.$set?.lease?.status === "pending") {
        injectLinkedShift = false;
        entities.PlanningShift.records.push({
          id: "shift-added-during-single-task-preflight",
          source_key: "manual:single-task-race",
          source_type: "task",
          service_date: "2099-08-24",
          start_time: "06:30",
          end_time: "18:00",
          task_occurrence_ids: [sourceOccurrence.id],
          task_segment_count: 1,
          required_count: 1,
          status: "draft",
          revision: 1,
        });
        entities.PlanningShiftTaskSegment.records.push({
          id: "segment-added-during-single-task-preflight",
          shift_id: "shift-added-during-single-task-preflight",
          task_occurrence_id: sourceOccurrence.id,
          object_task_definition_id: created.definition.id,
          start_date: "2099-08-24",
          end_date: "2099-08-24",
          start_time: "06:30",
          end_time: "18:00",
          duration_minutes: 690,
          status: "draft",
          revision: 1,
        });
      }
      return result;
    };

    await expect(backend.changeSingleTaskOccurrence(base44, user, {
      occurrence_id: sourceOccurrence.id,
      source_revision_id: sourceOccurrence.object_task_schedule_revision_id,
      start_time: "08:00",
      end_time: "16:00",
      expected_occurrence_revision: sourceOccurrence.revision,
      confirm_remove_outside_shifts: false,
    }, context("single-occurrence-impact-race"))).rejects.toMatchObject({
      status: 409,
      details: {
        code: "TASK_OCCURRENCE_COMPOSITION_CHANGED",
        task_occurrence_id: sourceOccurrence.id,
      },
    });
    expect(entities.ObjectTaskScheduleException.records).toHaveLength(0);
    expect(entities.PlanningAuditEvent.records.filter(item => (
      item.action === "change_single_task_occurrence"
    ))).toHaveLength(0);
  });

  it("blokkeert een andere sleutel zolang een losse taakwijziging herstel nodig heeft", async () => {
    const { base44, entities } = setup([]);
    const created = await createWeeklyObjectTask({
      base44,
      entities,
      key: "foreign-single-occurrence-marker",
    });
    await backend.bootstrapRange(base44, user, {
      period_start: "2099-08-24",
      period_end: "2099-08-24",
    }, context("bootstrap-foreign-single-occurrence-marker"));
    const sourceOccurrence = entities.PlanningTaskOccurrence.records.find(item => (
      item.lifecycle_status === "active"
      && item.object_task_definition_id === created.definition.id
      && item.service_date === "2099-08-24"
    ));
    sourceOccurrence.metadata = {
      ...(sourceOccurrence.metadata || {}),
      single_task_occurrence_mutation: {
        phase: "state_written_audit_pending",
        idempotency_key: "older-single-task-key",
        request_hash: "older-request-hash",
        actor_user_id: user.id,
      },
    };
    sourceOccurrence.revision += 1;

    await expect(backend.changeSingleTaskOccurrence(base44, user, {
      occurrence_id: sourceOccurrence.id,
      source_revision_id: sourceOccurrence.object_task_schedule_revision_id,
      start_time: "08:00",
      end_time: "16:00",
      expected_occurrence_revision: sourceOccurrence.revision,
      confirm_remove_outside_shifts: false,
    }, context("new-key-cannot-overtake-pending-single-task"))).rejects.toMatchObject({
      status: 409,
      details: {
        code: "TASK_OCCURRENCE_RECOVERY_PENDING",
        task_occurrence_id: sourceOccurrence.id,
        pending_idempotency_key: "older-single-task-key",
      },
    });
  });

  it("replayt occurrences met de werkelijk afgeronde marker in plaats van de oude auditsnapshot", async () => {
    const { base44, entities } = setup([]);
    const created = await createWeeklyObjectTask({
      base44,
      entities,
      key: "fresh-single-occurrence-replay",
    });
    await backend.bootstrapRange(base44, user, {
      period_start: "2099-08-24",
      period_end: "2099-08-24",
    }, context("bootstrap-fresh-single-occurrence-replay"));
    const sourceOccurrence = entities.PlanningTaskOccurrence.records.find(item => (
      item.lifecycle_status === "active"
      && item.object_task_definition_id === created.definition.id
      && item.service_date === "2099-08-24"
    ));
    const body = {
      occurrence_id: sourceOccurrence.id,
      source_revision_id: sourceOccurrence.object_task_schedule_revision_id,
      start_time: "08:00",
      end_time: "16:00",
      expected_occurrence_revision: sourceOccurrence.revision,
      confirm_remove_outside_shifts: false,
    };
    const mutation = context("fresh-single-occurrence-replay");
    const changed = await backend.changeSingleTaskOccurrence(base44, user, body, mutation);
    for (const occurrence of entities.PlanningTaskOccurrence.records.filter(item => (
      changed.task_occurrences.some(result => String(result.id) === String(item.id))
    ))) {
      occurrence.metadata.single_task_occurrence_mutation.phase = "state_written_audit_pending";
      occurrence.metadata.single_task_occurrence_mutation.audit_event_id = null;
    }

    const replay = await backend.changeSingleTaskOccurrence(base44, user, body, mutation);

    expect(replay.idempotent).toBe(true);
    expect(replay.task_occurrences).toHaveLength(2);
    expect(replay.task_occurrences.every(item => (
      item.metadata.single_task_occurrence_mutation.phase === "completed"
      && item.metadata.single_task_occurrence_mutation.audit_event_id === changed.audit_event_id
    ))).toBe(true);
  });

  it("serialiseert dezelfde idempotency key ook voor twee volledig verschillende taakuitvoeringen", async () => {
    const { base44, entities } = setup([]);
    const firstTask = await createWeeklyObjectTask({
      base44,
      entities,
      key: "global-single-key-first-task",
    });
    const secondTask = await createWeeklyObjectTask({
      base44,
      entities,
      key: "global-single-key-second-task",
      startTime: "19:00",
      endTime: "23:00",
    });
    await backend.bootstrapRange(base44, user, {
      period_start: "2099-08-24",
      period_end: "2099-08-24",
    }, context("bootstrap-global-single-key"));
    const occurrenceFor = definitionId => entities.PlanningTaskOccurrence.records.find(item => (
      item.lifecycle_status === "active"
      && item.object_task_definition_id === definitionId
      && item.service_date === "2099-08-24"
    ));
    const firstOccurrence = occurrenceFor(firstTask.definition.id);
    const secondOccurrence = occurrenceFor(secondTask.definition.id);
    const sharedContext = context("same-key-for-two-single-task-edits");

    const outcomes = await Promise.allSettled([
      backend.changeSingleTaskOccurrence(base44, user, {
        occurrence_id: firstOccurrence.id,
        source_revision_id: firstOccurrence.object_task_schedule_revision_id,
        start_time: "08:00",
        end_time: "16:00",
        expected_occurrence_revision: firstOccurrence.revision,
        confirm_remove_outside_shifts: false,
      }, sharedContext),
      backend.changeSingleTaskOccurrence(base44, user, {
        occurrence_id: secondOccurrence.id,
        source_revision_id: secondOccurrence.object_task_schedule_revision_id,
        start_time: "20:00",
        end_time: "22:00",
        expected_occurrence_revision: secondOccurrence.revision,
        confirm_remove_outside_shifts: false,
      }, sharedContext),
    ]);

    expect(outcomes.filter(item => item.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(item => item.status === "rejected")).toEqual([
      expect.objectContaining({ reason: expect.objectContaining({ status: 409 }) }),
    ]);
    expect(entities.PlanningAuditEvent.records.filter(item => (
      item.action === "change_single_task_occurrence"
      && item.idempotency_key === sharedContext.idempotencyKey
    ))).toHaveLength(1);
    expect(entities.ObjectTaskScheduleException.records).toHaveLength(1);
  });
});

describe("planning coverage-entiteiten", () => {
  it("staat alle duurzame taak- en partitieauditacties toe", () => {
    const schema = JSON.parse(fs.readFileSync(
      path.join(root, "base44/entities/PlanningAuditEvent.jsonc"),
      "utf8",
    ));

    expect(schema.properties.action.enum).toEqual(expect.arrayContaining([
      "change_single_task_occurrence",
      "resize_task_shift_preserving_coverage",
      "vacate_task_shift_partition",
      "assign_and_merge_task_shift_partition",
      "copy_task_occurrence",
    ]));
  });

  it("staan alleen service-role writes toe en geven admins uitsluitend leesrechten", () => {
    for (const file of [
      "PlanningAssignment.jsonc",
      "PlanningAuditEvent.jsonc",
      "PlanningPublication.jsonc",
      "PlanningShift.jsonc",
      "PlanningTaskOccurrence.jsonc",
      "PlanningShiftTaskSegment.jsonc",
      "PlanningMutationCoordinator.jsonc",
      "ObjectTaskScheduleSeries.jsonc",
      "ObjectTaskScheduleRevision.jsonc",
      "ObjectTaskScheduleException.jsonc",
      "PlanningTaskSourceChange.jsonc",
    ]) {
      const schema = JSON.parse(fs.readFileSync(path.join(root, "base44/entities", file), "utf8"));
      expect(schema.rls).toEqual({
        create: false,
        read: { user_condition: { role: "admin" } },
        update: false,
        delete: false,
      });
    }
  });

  it("kiest bij gelijke created_date deterministisch het laagste coordinator-id", () => {
    const records = [
      { id: "coordinator-z", created_date: "2026-08-11T10:00:00.000Z" },
      { id: "coordinator-a", created_date: "2026-08-11T10:00:00.000Z" },
      { id: "coordinator-later", created_date: "2026-08-11T10:01:00.000Z" },
    ];

    expect(records.sort(backend.coordinatorOrder).map(item => item.id)).toEqual([
      "coordinator-a",
      "coordinator-z",
      "coordinator-later",
    ]);
  });

  it("telt segmenten onder geannuleerde of onafgeronde compose-parents niet als dekking", () => {
    const demand = occurrence("occurrence-reception", "object-1", "08:00", "16:00", 480);
    const segment = {
      id: "segment-1",
      shift_id: "shift-1",
      task_occurrence_id: demand.id,
      start_date: "2026-08-17",
      end_date: "2026-08-17",
      start_time: "08:00",
      end_time: "16:00",
      status: "draft",
    };

    expect(backend.occurrenceCoverage(demand, [segment], [{
      id: "shift-1",
      status: "cancelled",
      metadata: { compose_and_assign: { phase: "compensated" } },
    }])).toMatchObject({ coverage_status: "open", allocated_minutes: 0 });
    expect(backend.occurrenceCoverage(demand, [segment], [{
      id: "shift-1",
      status: "draft",
      metadata: { compose_and_assign: { phase: "assignment_pending" } },
    }])).toMatchObject({ coverage_status: "open", allocated_minutes: 0 });
    expect(backend.occurrenceCoverage(demand, [segment], [{
      id: "shift-1",
      status: "draft",
      metadata: { compose_and_assign: { phase: "completed" } },
    }])).toMatchObject({ coverage_status: "full", allocated_minutes: 480 });
  });
});

describe("planningApi dienstsamenstelling", () => {
  it("maakt een taakdienst en medewerkerstoewijzing als één geaudite opdracht", async () => {
    const demand = occurrence("occurrence-reception", "object-1", "08:00", "16:00", 480);
    const { base44, entities } = setup([demand]);
    entities.Personnel.records.push({ id: "personnel-1", name: "Sam Beveiliger", status: "active" });
    let assignmentValidationCalls = 0;
    let assignmentValidationSawProvisionalWrite = false;
    let assignmentValidationPayload = null;
    base44.asServiceRole.functions.invoke = async (_functionName, payload) => {
      assignmentValidationCalls += 1;
      assignmentValidationPayload = payload;
      assignmentValidationSawProvisionalWrite = entities.PlanningAssignment.records.some(item => (
        item.personnel_id === "personnel-1"
        && item.personnel_contract_id == null
        && item.revision === 1
      ));
      return {};
    };
    const calls = instrumentBackendCalls(base44, entities);

    const result = await backend.composeAndAssign(base44, user, {
      personnel_id: "personnel-1",
      assignment_source: "object_matrix_drag",
      segments: [{ task_occurrence_id: demand.id, start_time: "08:00", end_time: "16:00" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    }, context("compose-and-assign-success"));

    expect(result.shift).toMatchObject({ source_type: "task", required_count: 1, status: "draft" });
    expect(result.assignment).toMatchObject({
      shift_id: result.shift.id,
      slot_index: 0,
      personnel_id: "personnel-1",
      personnel_name_snapshot: "Sam Beveiliger",
      status: "draft",
    });
    expect(result.assignments).toEqual([expect.objectContaining({ id: result.assignment.id })]);
    expect(entities.PlanningShift.records).toHaveLength(1);
    expect(entities.PlanningShiftTaskSegment.records.filter(item => item.status !== "removed")).toHaveLength(1);
    expect(entities.PlanningAssignment.records.filter(item => item.status !== "removed")).toHaveLength(1);
    expect(assignmentValidationCalls).toBe(1);
    expect(assignmentValidationSawProvisionalWrite).toBe(true);
    expect(assignmentValidationPayload).toMatchObject({
      planning_interactive_fast_path: true,
      require_schedule_validation: false,
      run_schedule_validation: false,
      final_validation: false,
    });
    expect(calls.count("PlanningAssignment.create")).toBe(1);
    expect(calls.count("PlanningAssignment.updateMany")).toBe(1);
    expect(calls.count("PlanningMutationCoordinator.get")).toBe(0);
    expect(calls.count("PlanningMutationCoordinator.updateMany")).toBe(16);
    expect(calls.total()).toBe(65);
    expect(entities.PlanningAuditEvent.records).toEqual([
      expect.objectContaining({
        action: "compose_and_assign",
        shift_id: result.shift.id,
        assignment_id: result.assignment.id,
        undoable: false,
      }),
    ]);
  });

  it("legt beveiligingspas- en 11-uurs-rustwaarschuwingen vast bij de finale servertoewijzing", async () => {
    const demand = occurrence("occurrence-final-authority", "object-1", "08:00", "16:00", 480);
    const { base44, entities } = setup([demand]);
    const personnelId = "personnel-final-authority";
    entities.Personnel.records.push({ id: personnelId, name: "Finale Beveiliger", status: "active" });
    const object = entities.SurveillanceObject.records.find(item => item.id === "object-1");
    object.default_required_security_pass_types = ["green"];
    entities.PersonnelSecurityPass.records.push({
      id: "security-pass-final-authority",
      personnel_id: personnelId,
      company_id: "company-1",
      pass_type: "green",
      status: "expired",
      valid_until: "2026-08-15",
    });
    entities.PlanningShift.records.push({
      id: "shift-before-final-authority",
      source_key: "manual-before-final-authority",
      source_type: "manual",
      service_date: "2026-08-16",
      start_time: "21:00",
      end_time: "23:00",
      status: "published",
      revision: 1,
      published_revision: 1,
      required_count: 1,
    });
    entities.PlanningAssignment.records.push({
      id: "assignment-before-final-authority",
      shift_id: "shift-before-final-authority",
      slot_index: 0,
      personnel_id: personnelId,
      status: "published",
      revision: 1,
      published_revision: 1,
    });

    const result = await backend.composeAndAssign(base44, user, {
      personnel_id: personnelId,
      segments: [{ task_occurrence_id: demand.id, start_time: "08:00", end_time: "16:00" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    }, context("compose-final-server-authority"));

    expect(result.assignment.warning_codes).toEqual(expect.arrayContaining([
      "security_pass_expired",
      "insufficient_rest",
    ]));
    expect(result.assignment.has_critical_warnings).toBe(true);
    expect(result.assignment.warning_snapshot).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "security_pass_expired", severity: "critical" }),
      expect.objectContaining({ code: "insufficient_rest", severity: "warning" }),
    ]));
  });

  it("herberekent contractweekuren finaal met het geroute contract en de actuele assignment-write", async () => {
    const demand = {
      ...occurrence("occurrence-final-contract-week", "object-1", "08:00", "16:00", 480),
      service_date: "2026-08-21",
      end_date: "2026-08-21",
    };
    const { base44, entities } = setup([demand]);
    const personnelId = "personnel-final-contract-week";
    entities.Personnel.records.push({ id: personnelId, name: "Weekbeveiliger", status: "active" });
    ["2026-08-17", "2026-08-18", "2026-08-19"].forEach((serviceDate, index) => {
      const shiftId = `shift-contract-week-${index + 1}`;
      entities.PlanningShift.records.push({
        id: shiftId,
        source_key: `manual:${shiftId}`,
        source_type: "manual",
        service_name_snapshot: "Bestaande weekdienst",
        service_date: serviceDate,
        start_time: "08:00",
        end_time: "16:00",
        required_count: 1,
        status: "published",
        revision: 1,
        published_revision: 1,
      });
      entities.PlanningAssignment.records.push({
        id: `assignment-contract-week-${index + 1}`,
        shift_id: shiftId,
        slot_index: 0,
        personnel_id: personnelId,
        status: "published",
        revision: 1,
        published_revision: 1,
      });
    });
    const originalAssignmentCreate = entities.PlanningAssignment.create.bind(entities.PlanningAssignment);
    entities.PlanningAssignment.create = async data => {
      const created = await originalAssignmentCreate(data);
      entities.PlanningShift.records.push({
        id: "shift-contract-week-concurrent",
        source_key: "manual:shift-contract-week-concurrent",
        source_type: "manual",
        service_name_snapshot: "Gelijktijdig toegevoegde weekdienst",
        service_date: "2026-08-20",
        start_time: "08:00",
        end_time: "16:00",
        required_count: 1,
        status: "draft",
        revision: 1,
        published_revision: 0,
      });
      entities.PlanningAssignment.records.push({
        id: "assignment-contract-week-concurrent",
        shift_id: "shift-contract-week-concurrent",
        slot_index: 0,
        personnel_id: personnelId,
        status: "draft",
        revision: 1,
        published_revision: 0,
      });
      return created;
    };
    base44.asServiceRole.functions.invoke = async () => ({
      contract_id: "contract-final-week",
      selected_contract: {
        id: "contract-final-week",
        contract_hours_per_week: 36,
        max_hours_per_week: null,
      },
    });
    const result = await backend.composeAndAssign(base44, user, {
      personnel_id: personnelId,
      warning_snapshot: [{
        code: "contract_hours_exceeded",
        severity: "warning",
        message: "Oude lokale weekurenwaarschuwing",
        source: "planner",
      }],
      segments: [{ task_occurrence_id: demand.id, start_time: "08:00", end_time: "16:00" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    }, context("compose-final-contract-week"));

    const weekWarnings = result.assignment.warning_snapshot.filter(item => (
      item.code === "contract_hours_exceeded"
    ));
    expect(result.assignment.personnel_contract_id).toBe("contract-final-week");
    expect(weekWarnings).toEqual([expect.objectContaining({
      severity: "warning",
      source: "planning_contract_hours",
      details: expect.objectContaining({
        contract_id: "contract-final-week",
        week_start: "2026-08-17",
        week_end: "2026-08-23",
        scheduled_minutes: 40 * 60,
        limit_minutes: 36 * 60,
      }),
    })]);
    expect(weekWarnings[0].message).not.toContain("Oude lokale");
  });

  it("staat exact twaalf uur automatisch toe, maar weigert twaalf uur en vijf minuten zonder neveneffecten", async () => {
    const overnightDemand = {
      ...occurrence("occurrence-reception-twelve-hours", "object-1", "18:00", "06:00", 720),
      end_date: "2026-08-18",
    };
    const { base44, entities } = setup([overnightDemand]);
    entities.Personnel.records.push({ id: "personnel-twelve-hours", name: "Nacht Beveiliger", status: "active" });
    const body = {
      personnel_id: "personnel-twelve-hours",
      segments: [{
        task_occurrence_id: overnightDemand.id,
        start_date: "2026-08-17",
        end_date: "2026-08-18",
        start_time: "18:00",
        end_time: "06:00",
      }],
      expected_occurrence_revisions: { [overnightDemand.id]: 1 },
    };
    const mutationContext = context("compose-and-assign-twelve-hours");

    const first = await backend.composeAndAssign(base44, user, body, mutationContext);
    const replay = await backend.composeAndAssign(base44, user, body, mutationContext);

    expect(first.shift).toMatchObject({
      service_date: "2026-08-17",
      end_date: "2026-08-18",
      start_time: "18:00",
      end_time: "06:00",
      duration_minutes: 720,
    });
    expect(replay.shift.id).toBe(first.shift.id);
    expect(entities.PlanningShift.records).toHaveLength(1);
    expect(entities.PlanningShiftTaskSegment.records.filter(item => item.status !== "removed")).toHaveLength(1);
    expect(entities.PlanningAssignment.records.filter(item => item.status !== "removed")).toHaveLength(1);
    expect(entities.PlanningAuditEvent.records).toHaveLength(1);

    const tooLongDemand = occurrence(
      "occurrence-reception-twelve-hours-five-minutes",
      "object-1",
      "07:00",
      "19:05",
      725,
    );
    const rejected = setup([tooLongDemand]);
    rejected.entities.Personnel.records.push({ id: "personnel-too-long", name: "Te lange dienst", status: "active" });

    await expect(backend.composeAndAssign(rejected.base44, user, {
      personnel_id: "personnel-too-long",
      segments: [{ task_occurrence_id: tooLongDemand.id, start_time: "07:00", end_time: "19:05" }],
      expected_occurrence_revisions: { [tooLongDemand.id]: 1 },
    }, context("compose-and-assign-too-long"))).rejects.toMatchObject({
      status: 409,
      details: {
        duration_minutes: 725,
        maximum_duration_minutes: 720,
      },
    });
    expect(rejected.entities.PlanningShift.records).toHaveLength(0);
    expect(rejected.entities.PlanningShiftTaskSegment.records).toHaveLength(0);
    expect(rejected.entities.PlanningAssignment.records).toHaveLength(0);
    expect(rejected.entities.PlanningAuditEvent.records).toHaveLength(0);
    expect(rejected.entities.PlanningMutationCoordinator.records).toHaveLength(0);
    const rejectedOccurrence = await rejected.entities.PlanningTaskOccurrence.get(tooLongDemand.id);
    expect(rejectedOccurrence.revision).toBe(1);
    expect(rejectedOccurrence).not.toHaveProperty("metadata");
  });

  it("controleert beide kalenderdagen van een nachtdienst parallel en bewaart de datumvolgorde", async () => {
    const overnightDemand = {
      ...occurrence("occurrence-parallel-cao-night", "object-1", "18:00", "06:00", 720),
      end_date: "2026-08-18",
    };
    const { base44, entities } = setup([overnightDemand]);
    entities.Personnel.records.push({
      id: "personnel-parallel-cao-night",
      name: "Nacht Beveiliger",
      status: "active",
    });
    let enteredCount = 0;
    let resolveBothEntered;
    let releaseValidation;
    const bothEntered = new Promise(resolve => { resolveBothEntered = resolve; });
    const validationReleased = new Promise(resolve => { releaseValidation = resolve; });
    base44.asServiceRole.functions.invoke = async (_functionName, payload) => {
      enteredCount += 1;
      if (enteredCount === 2) resolveBothEntered();
      await validationReleased;
      return {
        data: {
          contract_id: "contract-night",
          warnings: [`Controle ${payload.service_date}`],
        },
      };
    };

    const pending = backend.composeAndAssign(base44, user, {
      personnel_id: "personnel-parallel-cao-night",
      segments: [{
        task_occurrence_id: overnightDemand.id,
        start_date: "2026-08-17",
        end_date: "2026-08-18",
        start_time: "18:00",
        end_time: "06:00",
      }],
      expected_occurrence_revisions: { [overnightDemand.id]: 1 },
    }, context("compose-parallel-cao-night"));
    const bothEnteredBeforeRelease = await Promise.race([
      bothEntered.then(() => true),
      new Promise(resolve => setTimeout(() => resolve(false), 250)),
    ]);
    releaseValidation();
    const result = await pending;

    expect(bothEnteredBeforeRelease).toBe(true);
    expect(enteredCount).toBe(2);
    expect(result.assignment.contract_routing_snapshot.decisions.map(item => item.service_date)).toEqual([
      "2026-08-17",
      "2026-08-18",
    ]);
    expect(result.assignment.warning_snapshot
      .filter(item => item.code.startsWith("contract_cao_warning_"))
      .map(item => item.message)).toEqual([
        "Controle 2026-08-17",
        "Controle 2026-08-18",
      ]);
  });

  it("vermijdt coordinator-writes voor ruime lease-renewals tijdens een gewone toewijzing", async () => {
    const { base44, entities } = setup([]);
    entities.PlanningShift.records.push({
      id: "shift-assign-lease-callcount",
      source_key: "manual:shift-assign-lease-callcount",
      source_type: "manual",
      source_id: null,
      service_name_snapshot: "Beveiligingsdienst",
      company_id: "company-1",
      service_date: "2026-08-17",
      end_date: null,
      start_time: "08:00",
      end_time: "16:00",
      duration_minutes: 480,
      required_count: 1,
      status: "draft",
      revision: 1,
      published_revision: 0,
      metadata: {},
    });
    entities.Personnel.records.push({
      id: "personnel-assign-lease-callcount",
      name: "Directe Beveiliger",
      status: "active",
    });
    let assignmentValidationSawProvisionalWrite = false;
    base44.asServiceRole.functions.invoke = async () => {
      assignmentValidationSawProvisionalWrite = entities.PlanningAssignment.records.some(item => (
        item.personnel_id === "personnel-assign-lease-callcount"
        && item.personnel_contract_id == null
        && item.revision === 1
      ));
      return {};
    };
    const calls = instrumentBackendCalls(base44, entities);

    await backend.assignPersonnel(base44, user, {
      shift_id: "shift-assign-lease-callcount",
      personnel_id: "personnel-assign-lease-callcount",
      slot_index: 0,
      expected_shift_revision: 1,
    }, context("assign-lease-callcount"));

    expect(entities.PlanningMutationCoordinator.records).toHaveLength(5);
    expect(calls.count("PlanningMutationCoordinator.updateMany")).toBe(10);
    expect(calls.count("PlanningMutationCoordinator.get")).toBe(0);
    expect(calls.count("PlanningAssignment.create")).toBe(1);
    expect(calls.count("PlanningAssignment.updateMany")).toBe(1);
    expect(calls.count("functions.invoke:resolveCaoPlanningAssignmentDecision")).toBe(1);
    expect(calls.total()).toBe(42);
    expect(assignmentValidationSawProvisionalWrite).toBe(true);
    expect(entities.PlanningMutationCoordinator.records.every(item => item.lease === null)).toBe(true);
  });

  it("behoudt voor handmatig gevormde open diensten de bestaande grens van 24 uur", async () => {
    const fullDayDemand = {
      ...occurrence("occurrence-reception-full-day", "object-1", "00:00", "00:00", 1440),
      end_date: "2026-08-18",
    };
    const { base44 } = setup([fullDayDemand]);

    const result = await backend.composeShift(base44, user, {
      segments: [{
        task_occurrence_id: fullDayDemand.id,
        start_date: "2026-08-17",
        end_date: "2026-08-18",
        start_time: "00:00",
        end_time: "00:00",
      }],
      expected_occurrence_revisions: { [fullDayDemand.id]: 1 },
    }, context("compose-open-full-day"));

    expect(result.shift).toMatchObject({ duration_minutes: 1440, start_time: "00:00", end_time: "00:00" });
  });

  it("stelt een taakdienst samen en wijzigt die zonder globale segment- of dienstlijsten", async () => {
    const demand = occurrence("occurrence-targeted-composition", "object-1", "06:00", "20:00", 840);
    const { base44, entities } = setup([demand]);
    entities.Personnel.records.push({ id: "personnel-targeted", name: "Gerichte Beveiliger", status: "active" });
    entities.PlanningShift.records.push({
      id: "shift-unrelated",
      source_key: "manual:unrelated",
      source_type: "manual",
      service_date: "2026-08-17",
      start_time: "00:00",
      end_time: "01:00",
      status: "draft",
      revision: 1,
    });
    entities.PlanningShiftTaskSegment.records.push({
      id: "segment-unrelated",
      shift_id: "shift-unrelated",
      task_occurrence_id: "occurrence-unrelated",
      start_date: "2026-08-17",
      end_date: "2026-08-17",
      start_time: "00:00",
      end_time: "01:00",
      status: "draft",
      revision: 1,
    });
    const segmentFilter = entities.PlanningShiftTaskSegment.filter.bind(entities.PlanningShiftTaskSegment);
    const shiftFilter = entities.PlanningShift.filter.bind(entities.PlanningShift);
    const segmentQueries = [];
    const shiftQueries = [];
    entities.PlanningShiftTaskSegment.filter = async (query, ...args) => {
      segmentQueries.push(structuredClone(query));
      return segmentFilter(query, ...args);
    };
    entities.PlanningShift.filter = async (query, ...args) => {
      shiftQueries.push(structuredClone(query));
      return shiftFilter(query, ...args);
    };
    entities.PlanningShiftTaskSegment.list = async () => {
      throw new Error("globale segmentlijst mag niet nodig zijn");
    };
    entities.PlanningShift.list = async () => {
      throw new Error("globale dienstlijst mag niet nodig zijn");
    };

    const composed = await backend.composeAndAssign(base44, user, {
      personnel_id: "personnel-targeted",
      segments: [{ task_occurrence_id: demand.id, start_time: "06:00", end_time: "14:00" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    }, context("targeted-compose-and-assign"));
    const occurrenceBeforeResize = await entities.PlanningTaskOccurrence.get(demand.id);
    const resized = await backend.composeShift(base44, user, {
      action: "update_shift_composition",
      shift_id: composed.shift.id,
      expected_shift_revision: composed.shift.revision,
      expected_occurrence_revisions: { [demand.id]: occurrenceBeforeResize.revision },
      segments: [{ task_occurrence_id: demand.id, start_time: "06:00", end_time: "12:00" }],
    }, context("targeted-resize"));

    expect(resized.shift).toMatchObject({ start_time: "06:00", end_time: "12:00" });
    expect(entities.PlanningShiftTaskSegment.records.find(item => item.id === "segment-unrelated"))
      .toMatchObject({ status: "draft" });
    expect(segmentQueries).toContainEqual({ task_occurrence_id: { $in: [demand.id] } });
    expect(shiftQueries.some(query => query.id?.$in?.includes(composed.shift.id))).toBe(true);
  });

  it("begrensst overlapcontrole tot relevante dagen in plaats van de volledige medewerkerhistorie", async () => {
    const demand = occurrence("occurrence-date-scoped-eligibility", "object-1", "08:00", "16:00", 480);
    const { base44, entities } = setup([demand]);
    entities.Personnel.records.push({
      id: "personnel-date-scoped-eligibility",
      name: "Historie Beveiliger",
      status: "active",
    });
    for (let index = 0; index < 100; index += 1) {
      const shiftId = `historical-shift-${index}`;
      entities.PlanningShift.records.push({
        id: shiftId,
        service_date: `2025-${String((index % 12) + 1).padStart(2, "0")}-01`,
        start_time: "08:00",
        end_time: "16:00",
        status: "published",
        revision: 1,
      });
      entities.PlanningAssignment.records.push({
        id: `historical-assignment-${index}`,
        shift_id: shiftId,
        personnel_id: "personnel-date-scoped-eligibility",
        slot_index: 0,
        status: "published",
        revision: 1,
      });
    }
    const originalAssignmentFilter = entities.PlanningAssignment.filter.bind(entities.PlanningAssignment);
    const originalShiftFilter = entities.PlanningShift.filter.bind(entities.PlanningShift);
    const personnelQueries = [];
    const shiftQueries = [];
    entities.PlanningAssignment.filter = async (query, ...args) => {
      if (query.personnel_id) personnelQueries.push(structuredClone(query));
      return originalAssignmentFilter(query, ...args);
    };
    entities.PlanningShift.filter = async (query, ...args) => {
      shiftQueries.push(structuredClone(query));
      return originalShiftFilter(query, ...args);
    };

    await backend.composeAndAssign(base44, user, {
      personnel_id: "personnel-date-scoped-eligibility",
      segments: [{ task_occurrence_id: demand.id, start_time: "08:00", end_time: "16:00" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    }, context("date-scoped-eligibility"));

    expect(personnelQueries.every(query => Array.isArray(query.shift_id?.$in))).toBe(true);
    expect(personnelQueries.flatMap(query => query.shift_id.$in)).not.toEqual(expect.arrayContaining([
      "historical-shift-0",
      "historical-shift-99",
    ]));
    expect(shiftQueries).toContainEqual({
      service_date: { $in: [
        "2026-08-16",
        "2026-08-17",
        "2026-08-18",
        "2026-08-19",
        "2026-08-20",
        "2026-08-21",
        "2026-08-22",
        "2026-08-23",
      ] },
    });
  });

  it("plant en auditeert een taak als het uitvoerende bedrijf nog niet is gekoppeld", async () => {
    const demand = occurrence("occurrence-reception-unresolved-company", "object-1", "08:00", "16:00", 480);
    const { base44, entities } = setup([demand]);
    entities.Personnel.records.push({ id: "personnel-1", name: "Sam Beveiliger", status: "active" });
    entities.SurveillanceObject.records[0].default_operating_company_id = null;
    entities.SurveillanceObject.records[0].contract_assignment_policy = "strict_contract_match";
    const payload = {
      personnel_id: "personnel-1",
      assignment_source: "object_matrix_drag",
      segments: [{ task_occurrence_id: demand.id, start_time: "08:00", end_time: "16:00" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    };
    const mutationContext = context("compose-and-assign-unresolved-company");

    const result = await backend.composeAndAssign(base44, user, payload, mutationContext);

    expect(result.shift).toMatchObject({
      company_id: null,
      contract_assignment_policy: "allow_manual_review",
      status: "draft",
    });
    expect(result.shift.service_context_snapshot.composition_warnings).toContainEqual(expect.objectContaining({
      code: "operating_company_unresolved",
      severity: "warning",
      details: expect.objectContaining({ object_ids: ["object-1"] }),
    }));
    expect(result.segments).toEqual([
      expect.objectContaining({ company_id: null, task_occurrence_id: demand.id }),
    ]);
    expect(result.assignment).toMatchObject({ personnel_id: "personnel-1", status: "draft" });
    expect(entities.PlanningAuditEvent.records).toEqual([
      expect.objectContaining({ action: "compose_and_assign", shift_id: result.shift.id }),
    ]);
    expect(backend.occurrenceCoverage(
      demand,
      entities.PlanningShiftTaskSegment.records,
      entities.PlanningShift.records,
    )).toMatchObject({ coverage_status: "full", remaining_minutes: 0 });
    expect((await entities.PlanningTaskOccurrence.get(demand.id)).metadata?.planning_composition_reservation).toBeUndefined();

    const replay = await backend.composeAndAssign(base44, user, payload, mutationContext);
    expect(replay.idempotent).toBe(true);
    expect(entities.PlanningShift.records).toHaveLength(1);
    expect(entities.PlanningShiftTaskSegment.records.filter(item => item.status !== "removed")).toHaveLength(1);
    expect(entities.PlanningAssignment.records.filter(item => item.status !== "removed")).toHaveLength(1);
    expect(entities.PlanningAuditEvent.records).toHaveLength(1);
  });

  it("maakt een open conceptdienst zonder bedrijfskoppeling", async () => {
    const demand = occurrence("occurrence-round-unresolved-company", "object-1", "22:00", "22:25", 25);
    const { base44, entities } = setup([demand]);
    entities.SurveillanceObject.records[0].default_operating_company_id = null;

    const result = await backend.composeShift(base44, user, {
      required_count: 1,
      segments: [{ task_occurrence_id: demand.id, start_time: "22:00", end_time: "22:25" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    }, context("compose-open-unresolved-company"));

    expect(result.shift).toMatchObject({
      company_id: null,
      contract_assignment_policy: "allow_manual_review",
      required_count: 1,
      status: "draft",
    });
    expect(result.composition_warnings).toContainEqual(expect.objectContaining({
      code: "operating_company_unresolved",
    }));
    expect(result.assignments).toEqual([]);
    expect(entities.PlanningAuditEvent.records).toEqual([
      expect.objectContaining({ action: "compose_shift", shift_id: result.shift.id }),
    ]);
  });

  it("neemt een bekend bedrijf niet over als een ander object nog unresolved is", async () => {
    const reception = {
      ...occurrence("occurrence-reception-partial-company", "object-1", "08:00", "12:00", 240),
      company_id: "company-1",
    };
    const round = {
      ...occurrence("occurrence-round-partial-company", "object-2", "12:00", "13:00", 60),
      company_id: null,
    };
    const { base44, entities } = setup([reception, round]);
    entities.SurveillanceObject.records[1].default_operating_company_id = null;

    const result = await backend.composeShift(base44, user, {
      segments: [
        { task_occurrence_id: reception.id, start_time: "08:00", end_time: "12:00" },
        { task_occurrence_id: round.id, start_time: "12:00", end_time: "13:00" },
      ],
      expected_occurrence_revisions: { [reception.id]: 1, [round.id]: 1 },
    }, context("compose-partial-company-context"));

    expect(result.shift).toMatchObject({
      company_id: null,
      object_ids: ["object-1", "object-2"],
      contract_assignment_policy: "allow_manual_review",
    });
    expect(result.composition_warnings).toContainEqual(expect.objectContaining({
      code: "operating_company_unresolved",
      details: expect.objectContaining({
        object_ids: ["object-2"],
        configured_company_ids: ["company-1"],
      }),
    }));
  });

  it("laat bij een vooraf ontbrekende medewerker geen lege dienst of reservering achter", async () => {
    const demand = occurrence("occurrence-reception", "object-1", "08:00", "16:00", 480);
    const { base44, entities } = setup([demand]);

    await expect(backend.composeAndAssign(base44, user, {
      personnel_id: "personnel-missing",
      segments: [{ task_occurrence_id: demand.id, start_time: "08:00", end_time: "16:00" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    }, context("compose-and-assign-missing-personnel"))).rejects.toMatchObject({ status: 404 });

    expect(entities.PlanningShift.records).toEqual([]);
    expect(entities.PlanningShiftTaskSegment.records).toEqual([]);
    expect(entities.PlanningAssignment.records).toEqual([]);
    expect(entities.PlanningAuditEvent.records).toEqual([]);
    const unchangedOccurrence = await entities.PlanningTaskOccurrence.get(demand.id);
    expect(unchangedOccurrence.revision).toBe(1);
    expect(unchangedOccurrence.metadata?.planning_composition_reservation).toBeUndefined();
  });

  it("kan na een bedrijfsconflict direct opnieuw proberen zonder occurrence-revisiondrift", async () => {
    const morning = occurrence("occurrence-reception-company-retry", "object-1", "08:00", "12:00", 240);
    const afternoon = occurrence("occurrence-round-company-retry", "object-2", "12:00", "16:00", 240);
    const { base44, entities } = setup([morning, afternoon]);
    entities.Personnel.records.push({ id: "personnel-1", name: "Sam Beveiliger", status: "active" });
    entities.SurveillanceObject.records[1].default_operating_company_id = "company-2";
    const payload = {
      personnel_id: "personnel-1",
      segments: [
        { task_occurrence_id: morning.id, start_time: "08:00", end_time: "12:00" },
        { task_occurrence_id: afternoon.id, start_time: "12:00", end_time: "16:00" },
      ],
      expected_occurrence_revisions: { [morning.id]: 1, [afternoon.id]: 1 },
    };
    const retryContext = context("compose-retry-after-company-conflict");

    await expect(backend.composeAndAssign(base44, user, payload, retryContext))
      .rejects.toMatchObject({
        status: 409,
        message: "Taken van verschillende uitvoerende bedrijven kunnen niet in één dienst",
        details: { company_ids: ["company-1", "company-2"] },
      });
    expect(entities.PlanningMutationCoordinator.records.length).toBeGreaterThanOrEqual(2);
    expect(entities.PlanningShift.records).toEqual([]);
    expect(entities.PlanningShiftTaskSegment.records).toEqual([]);
    expect(entities.PlanningAssignment.records).toEqual([]);
    expect(entities.PlanningAuditEvent.records).toEqual([]);
    for (const demand of [morning, afternoon]) {
      const unchangedOccurrence = await entities.PlanningTaskOccurrence.get(demand.id);
      expect(unchangedOccurrence.revision).toBe(1);
      expect(unchangedOccurrence.metadata?.planning_composition_reservation).toBeUndefined();
    }

    entities.SurveillanceObject.records[1].default_operating_company_id = "company-1";
    const recovered = await backend.composeAndAssign(base44, user, payload, retryContext);
    expect(recovered.shift.status).toBe("draft");
    expect(recovered.shift.company_id).toBe("company-1");
    expect(recovered.assignment.personnel_id).toBe("personnel-1");
  });

  it("compenseert een assignment-writefout en herstelt dezelfde sleutel direct op dezelfde dienst", async () => {
    const demand = occurrence("occurrence-reception", "object-1", "08:00", "16:00", 480);
    const { base44, entities } = setup([demand]);
    entities.Personnel.records.push({ id: "personnel-1", name: "Sam Beveiliger", status: "active" });
    const originalAssignmentCreate = entities.PlanningAssignment.create.bind(entities.PlanningAssignment);
    const originalSegmentUpdateMany = entities.PlanningShiftTaskSegment.updateMany.bind(entities.PlanningShiftTaskSegment);
    let failAssignmentOnce = true;
    let transientCleanupConflicts = 2;
    entities.PlanningAssignment.create = async data => {
      if (failAssignmentOnce) {
        failAssignmentOnce = false;
        throw new Error("tijdelijke assignment-writefout");
      }
      return originalAssignmentCreate(data);
    };
    entities.PlanningShiftTaskSegment.updateMany = async (query, update) => {
      if (update.$set?.status === "removed" && transientCleanupConflicts > 0) {
        transientCleanupConflicts -= 1;
        return { success: true, updated: 0 };
      }
      return originalSegmentUpdateMany(query, update);
    };
    const payload = {
      personnel_id: "personnel-1",
      segments: [{ task_occurrence_id: demand.id, start_time: "08:00", end_time: "16:00" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    };
    const retryContext = context("compose-and-assign-assignment-recovery");

    await expect(backend.composeAndAssign(base44, user, payload, retryContext))
      .rejects.toThrow("tijdelijke assignment-writefout");

    expect(entities.PlanningShift.records).toEqual([
      expect.objectContaining({ status: "cancelled", metadata: expect.objectContaining({
        compose_and_assign: expect.objectContaining({ phase: "compensated" }),
      }) }),
    ]);
    expect(entities.PlanningShiftTaskSegment.records.filter(item => item.status !== "removed")).toEqual([]);
    expect(transientCleanupConflicts).toBe(0);
    expect(entities.PlanningAssignment.records.filter(item => item.status !== "removed")).toEqual([]);
    const compensatedOccurrence = await entities.PlanningTaskOccurrence.get(demand.id);
    expect(compensatedOccurrence.metadata?.planning_composition_reservation).toBeUndefined();
    expect(compensatedOccurrence.metadata?.last_compose_and_assign_recovery_status).toBe("compensated");
    expect(entities.PlanningMutationCoordinator.records[0].lease).toBeNull();

    const recovered = await backend.composeAndAssign(base44, user, payload, retryContext);

    expect(recovered.shift).toMatchObject({ id: entities.PlanningShift.records[0].id, status: "draft" });
    expect(recovered.assignment).toMatchObject({ personnel_id: "personnel-1", status: "draft" });
    expect(entities.PlanningShift.records).toHaveLength(1);
    expect(entities.PlanningShiftTaskSegment.records.filter(item => item.status !== "removed")).toHaveLength(1);
    expect(entities.PlanningAssignment.records.filter(item => item.status !== "removed")).toHaveLength(1);
    expect(entities.PlanningAuditEvent.records).toHaveLength(1);
    const finalizedOccurrence = await entities.PlanningTaskOccurrence.get(demand.id);
    expect(finalizedOccurrence.metadata?.last_compose_and_assign_recovery_status).toBeUndefined();
  });

  it("laat een half opgeschoonde compensatie niet meetellen en herstelt dezelfde opdracht direct", async () => {
    const demand = occurrence("occurrence-reception", "object-1", "08:00", "16:00", 480);
    const { base44, entities } = setup([demand]);
    entities.Personnel.records.push({ id: "personnel-1", name: "Sam Beveiliger", status: "active" });
    const originalAssignmentCreate = entities.PlanningAssignment.create.bind(entities.PlanningAssignment);
    const originalSegmentUpdateMany = entities.PlanningShiftTaskSegment.updateMany.bind(entities.PlanningShiftTaskSegment);
    let failAssignmentOnce = true;
    let failSegmentCleanupAttempts = 8;
    let cleanupObservedCancelledParent = false;
    entities.PlanningAssignment.create = async data => {
      if (failAssignmentOnce) {
        failAssignmentOnce = false;
        throw new Error("tijdelijke assignment-writefout");
      }
      return originalAssignmentCreate(data);
    };
    entities.PlanningShiftTaskSegment.updateMany = async (query, update) => {
      if (update.$set?.status === "removed" && failSegmentCleanupAttempts > 0) {
        cleanupObservedCancelledParent = entities.PlanningShift.records[0]?.status === "cancelled";
        failSegmentCleanupAttempts -= 1;
        return { success: true, updated: 0 };
      }
      return originalSegmentUpdateMany(query, update);
    };
    const payload = {
      personnel_id: "personnel-1",
      segments: [{ task_occurrence_id: demand.id, start_time: "08:00", end_time: "16:00" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    };
    const retryContext = context("compose-and-assign-partial-cleanup");

    await expect(backend.composeAndAssign(base44, user, payload, retryContext))
      .rejects.toThrow("tijdelijke assignment-writefout");

    expect(entities.PlanningShift.records[0]).toMatchObject({
      status: "cancelled",
      metadata: { compose_and_assign: { phase: "compensated" } },
    });
    expect(cleanupObservedCancelledParent).toBe(true);
    expect(entities.PlanningShiftTaskSegment.records.filter(item => item.status !== "removed"))
      .toHaveLength(1);
    expect(backend.occurrenceCoverage(
      demand,
      entities.PlanningShiftTaskSegment.records,
      entities.PlanningShift.records,
    )).toMatchObject({ coverage_status: "open", allocated_minutes: 0 });

    const recovered = await backend.composeAndAssign(base44, user, payload, retryContext);
    expect(recovered.shift.status).toBe("draft");
    expect(recovered.assignment.status).toBe("draft");
    expect(backend.occurrenceCoverage(
      demand,
      entities.PlanningShiftTaskSegment.records,
      entities.PlanningShift.records,
    )).toMatchObject({ coverage_status: "full", allocated_minutes: 480 });
    expect(entities.PlanningShiftTaskSegment.records.filter(item => item.status !== "removed"))
      .toHaveLength(1);
  });

  it("snoeit verlopen idempotencyclaims uit de bijbehorende registershard", async () => {
    const demand = occurrence("occurrence-reception", "object-1", "08:00", "16:00", 480);
    const { base44, entities } = setup([demand]);
    entities.Personnel.records.push({ id: "personnel-1", name: "Sam Beveiliger", status: "active" });
    const mutationKey = "compose-and-assign-prunes-expired-claims";
    const registryKey = await idempotencyRegistryKey(mutationKey);
    entities.PlanningMutationCoordinator.records.push({
      id: "coordinator-registry",
      coordinator_key: registryKey,
      resource_type: "idempotency_registry",
      resource_id: `compose_and_assign:${registryKey.split(":").at(-1)}`,
      lease: null,
      revision: 1,
      created_date: "2026-08-11T08:00:00.000Z",
      metadata: {
        claims: Object.fromEntries(Array.from({ length: 100 }, (_, index) => [
          `expired-${index}`,
          {
            request_hash: `old-${index}`,
            status: "retryable",
            ...(index === 0 ? {} : { expires_at: "2026-08-10T08:00:00.000Z" }),
          },
        ])),
      },
    });

    await backend.composeAndAssign(base44, user, {
      personnel_id: "personnel-1",
      segments: [{ task_occurrence_id: demand.id, start_time: "08:00", end_time: "16:00" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    }, context(mutationKey));

    const registry = entities.PlanningMutationCoordinator.records.find(
      item => item.resource_type === "idempotency_registry",
    );
    expect(registry.metadata.claims).toEqual({});
  });

  it("respecteert tijdens de rollout een actieve legacy-v2-fence en schrijft geen businessrecords", async () => {
    const demand = occurrence("occurrence-legacy-v2-pending", "object-1", "08:00", "12:00", 240);
    const { base44, entities } = setup([demand]);
    entities.Personnel.records.push({ id: "personnel-legacy-v2-pending", name: "Legacy Beveiliger", status: "active" });
    const mutationKey = "compose-legacy-v2-pending";
    const claimId = await idempotencyClaimId(mutationKey);
    const registryKey = await idempotencyRegistryKey(mutationKey);
    entities.PlanningMutationCoordinator.records.push({
      id: "coordinator-legacy-v2-pending",
      coordinator_key: "idempotency_registry:v2",
      resource_type: "idempotency_registry",
      resource_id: "compose_and_assign",
      lease: null,
      revision: 1,
      created_date: "2026-08-11T08:00:00.000Z",
      metadata: {
        claims: {
          [claimId]: {
            idempotency_key: mutationKey,
            actor_user_id: user.id,
            request_hash: "legacy-disjoint-payload-hash",
            status: "pending",
            expires_at: "2099-08-17T12:00:00.000Z",
          },
        },
      },
    });

    const legacyBefore = structuredClone(entities.PlanningMutationCoordinator.records[0]);
    await expect(backend.composeAndAssign(base44, user, {
      personnel_id: "personnel-legacy-v2-pending",
      segments: [{ task_occurrence_id: demand.id, start_time: "08:00", end_time: "12:00" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    }, context(mutationKey))).rejects.toMatchObject({ status: 409 });

    expect(entities.PlanningMutationCoordinator.records.find(
      item => item.coordinator_key === "idempotency_registry:v2",
    )).toEqual(legacyBefore);
    expect(entities.PlanningMutationCoordinator.records.some(
      item => item.coordinator_key === registryKey,
    )).toBe(false);
    expect(entities.PlanningShift.records).toEqual([]);
    expect(entities.PlanningAssignment.records).toEqual([]);
  });

  it("blokkeert een actieve v3-claim zonder businessrecords aan te maken", async () => {
    const demand = occurrence("occurrence-active-v3-claim", "object-1", "08:00", "12:00", 240);
    const { base44, entities } = setup([demand]);
    entities.Personnel.records.push({ id: "personnel-active-v3-claim", name: "V3 Beveiliger", status: "active" });
    const mutationKey = "compose-active-v3-claim";
    const claimId = await idempotencyClaimId(mutationKey);
    const registryKey = await idempotencyRegistryKey(mutationKey);
    entities.PlanningMutationCoordinator.records.push({
      id: "coordinator-active-v3-claim",
      coordinator_key: registryKey,
      resource_type: "idempotency_registry",
      resource_id: `compose_and_assign:${registryKey.split(":").at(-1)}`,
      lease: null,
      revision: 1,
      created_date: "2026-08-11T08:00:00.000Z",
      metadata: {
        claims: {
          [claimId]: {
            idempotency_key: mutationKey,
            actor_user_id: user.id,
            request_hash: "active-current-writer",
            status: "pending",
            claim_protocol: "v3_sharded",
            expires_at: "2099-08-17T12:00:00.000Z",
          },
        },
      },
    });

    await expect(backend.composeAndAssign(base44, user, {
      personnel_id: "personnel-active-v3-claim",
      segments: [{ task_occurrence_id: demand.id, start_time: "08:00", end_time: "12:00" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    }, context(mutationKey))).rejects.toMatchObject({ status: 409 });
    expect(entities.PlanningShift.records).toEqual([]);
    expect(entities.PlanningAssignment.records).toEqual([]);
  });

  it("claimt tijdens rollout zowel de globale v2-fence als onafhankelijke v3-shards", async () => {
    const morning = occurrence("occurrence-registry-shard-morning", "object-1", "08:00", "12:00", 240);
    const afternoon = occurrence("occurrence-registry-shard-afternoon", "object-1", "12:00", "16:00", 240);
    const { base44, entities } = setup([morning, afternoon]);
    entities.Personnel.records.push(
      { id: "personnel-registry-shard-morning", name: "Ochtend Beveiliger", status: "active" },
      { id: "personnel-registry-shard-afternoon", name: "Middag Beveiliger", status: "active" },
    );
    const firstKey = "compose-registry-shard-first";
    let secondKey = "compose-registry-shard-second";
    while (await idempotencyRegistryKey(secondKey) === await idempotencyRegistryKey(firstKey)) {
      secondKey += "-next";
    }

    await backend.composeAndAssign(base44, user, {
      personnel_id: "personnel-registry-shard-morning",
      segments: [{ task_occurrence_id: morning.id, start_time: "08:00", end_time: "12:00" }],
      expected_occurrence_revisions: { [morning.id]: 1 },
    }, context(firstKey));
    await backend.composeAndAssign(base44, user, {
      personnel_id: "personnel-registry-shard-afternoon",
      segments: [{ task_occurrence_id: afternoon.id, start_time: "12:00", end_time: "16:00" }],
      expected_occurrence_revisions: { [afternoon.id]: 1 },
    }, context(secondKey));

    expect(entities.PlanningMutationCoordinator.records
      .filter(item => item.coordinator_key.startsWith("idempotency_registry:v3:"))
      .map(item => item.coordinator_key)
      .sort()).toEqual([
        await idempotencyRegistryKey(firstKey),
        await idempotencyRegistryKey(secondKey),
      ].sort());
    expect(entities.PlanningMutationCoordinator.records.some(
      item => item.coordinator_key === "idempotency_registry:v2",
    )).toBe(true);
    expect(entities.PlanningMutationCoordinator.records.find(
      item => item.coordinator_key === "idempotency_registry:v2",
    )?.metadata?.claims).toEqual({});
  });

  it("geeft een eerder verkregen resourcelease vrij wanneer een latere resource tijdelijk bezet is", async () => {
    const { base44, entities } = setup([]);
    const descriptors = [
      { coordinatorKey: "lease-acquire-cleanup:01", resourceType: "shift_composition", resourceId: "shift-free" },
      { coordinatorKey: "lease-acquire-cleanup:02", resourceType: "personnel_day", resourceId: "day-busy" },
    ];
    entities.PlanningMutationCoordinator.records.push(
      {
        id: "coordinator-acquire-free",
        coordinator_key: descriptors[0].coordinatorKey,
        resource_type: descriptors[0].resourceType,
        resource_id: descriptors[0].resourceId,
        lease: null,
        revision: 1,
        created_date: "2026-08-17T08:00:00.000Z",
        metadata: {},
      },
      {
        id: "coordinator-acquire-busy",
        coordinator_key: descriptors[1].coordinatorKey,
        resource_type: descriptors[1].resourceType,
        resource_id: descriptors[1].resourceId,
        lease: {
          token: "foreign-active-lease",
          status: "pending",
          expires_at: "2099-08-17T12:00:00.000Z",
        },
        revision: 1,
        created_date: "2026-08-17T08:00:00.000Z",
        metadata: {},
      },
    );

    await expect(backend.acquirePlanningResourceLeases(
      base44,
      user,
      context("lease-acquire-successful-cleanup"),
      "request-hash-successful-cleanup",
      descriptors,
    )).rejects.toMatchObject({
      status: 409,
      details: {
        code: "PLANNING_RESOURCE_BUSY",
        transient: true,
        resource_type: "personnel_day",
        resource_id: "day-busy",
      },
    });

    expect(entities.PlanningMutationCoordinator.records.find(
      item => item.id === "coordinator-acquire-free",
    )?.lease).toBeNull();
    expect(entities.PlanningMutationCoordinator.records.find(
      item => item.id === "coordinator-acquire-busy",
    )?.lease?.token).toBe("foreign-active-lease");
    expect(entities.PlanningShift.records).toEqual([]);
    expect(entities.PlanningAssignment.records).toEqual([]);
    expect(entities.PlanningAuditEvent.records).toEqual([]);
  });

  it("meldt een mislukte partial-acquire-cleanup apart en nooit als retry-veilige busy-fout", async () => {
    const { base44, entities } = setup([]);
    const descriptors = [
      { coordinatorKey: "lease-acquire-exhausted:01", resourceType: "shift_composition", resourceId: "shift-free" },
      { coordinatorKey: "lease-acquire-exhausted:02", resourceType: "personnel_day", resourceId: "day-busy" },
    ];
    entities.PlanningMutationCoordinator.records.push(
      {
        id: "coordinator-acquire-release-exhausted",
        coordinator_key: descriptors[0].coordinatorKey,
        resource_type: descriptors[0].resourceType,
        resource_id: descriptors[0].resourceId,
        lease: null,
        revision: 1,
        created_date: "2026-08-17T08:00:00.000Z",
        metadata: {},
      },
      {
        id: "coordinator-acquire-still-busy",
        coordinator_key: descriptors[1].coordinatorKey,
        resource_type: descriptors[1].resourceType,
        resource_id: descriptors[1].resourceId,
        lease: {
          token: "foreign-active-lease-secret",
          status: "pending",
          expires_at: "2099-08-17T12:00:00.000Z",
        },
        revision: 1,
        created_date: "2026-08-17T08:00:00.000Z",
        metadata: {},
      },
    );
    const originalCoordinatorUpdate = entities.PlanningMutationCoordinator.updateMany.bind(
      entities.PlanningMutationCoordinator,
    );
    let releaseAttempts = 0;
    entities.PlanningMutationCoordinator.updateMany = async (query, update) => {
      if (query.id === "coordinator-acquire-release-exhausted" && update.$set?.lease === null) {
        releaseAttempts += 1;
        const error = new Error("rate limit exceeded while releasing must-not-leak");
        error.status = 429;
        error.details = { retry_after_ms: 1, internal_token: "must-not-leak" };
        throw error;
      }
      return originalCoordinatorUpdate(query, update);
    };

    let exhaustedError;
    try {
      await backend.acquirePlanningResourceLeases(
        base44,
        user,
        context("lease-acquire-exhausted-cleanup"),
        "request-hash-exhausted-cleanup",
        descriptors,
      );
    } catch (error) {
      exhaustedError = error;
    }

    expect(exhaustedError).toMatchObject({
      status: 503,
      details: {
        lease_release_exhausted: true,
        lease_acquire_cleanup_exhausted: true,
        retry_safe: false,
        retry_after: expect.stringMatching(/Z$/),
        retry_after_ms: expect.any(Number),
        acquire_error: {
          status: 409,
          code: "PLANNING_RESOURCE_BUSY",
          resource_type: "personnel_day",
          resource_id: "day-busy",
        },
        lease_release_errors: [expect.objectContaining({
          entity: "PlanningMutationCoordinator",
          id: "coordinator-acquire-release-exhausted",
          status: 429,
          rate_limited: true,
          attempts: 6,
          retry_after_ms: 1,
        })],
      },
    });
    expect(exhaustedError.details).not.toHaveProperty("code");
    expect(exhaustedError.details).not.toHaveProperty("transient");
    expect(JSON.stringify(exhaustedError.details)).not.toContain("foreign-active-lease-secret");
    expect(JSON.stringify(exhaustedError.details)).not.toContain("must-not-leak");
    expect(releaseAttempts).toBe(6);
    expect(entities.PlanningMutationCoordinator.records.find(
      item => item.id === "coordinator-acquire-release-exhausted",
    )?.lease).toMatchObject({ status: "pending" });
    expect(entities.PlanningShift.records).toEqual([]);
    expect(entities.PlanningAssignment.records).toEqual([]);
    expect(entities.PlanningAuditEvent.records).toEqual([]);
  });

  it("geeft eerder verkregen occurrence-reserveringen vrij als een latere reservation-CAS faalt", async () => {
    const firstDemand = occurrence("occurrence-reception", "object-1", "08:00", "12:00", 240);
    const secondDemand = occurrence("occurrence-rounds", "object-2", "12:00", "16:00", 240);
    const { base44, entities } = setup([firstDemand, secondDemand]);
    entities.Personnel.records.push({ id: "personnel-1", name: "Sam Beveiliger", status: "active" });
    const originalOccurrenceUpdateMany = entities.PlanningTaskOccurrence.updateMany.bind(entities.PlanningTaskOccurrence);
    let failSecondReservationOnce = true;
    entities.PlanningTaskOccurrence.updateMany = async (query, update) => {
      if (
        failSecondReservationOnce
        && query.id === secondDemand.id
        && update.$set?.metadata?.planning_composition_reservation
      ) {
        failSecondReservationOnce = false;
        return { success: true, updated: 0 };
      }
      return originalOccurrenceUpdateMany(query, update);
    };
    const payload = {
      personnel_id: "personnel-1",
      service_name: "Ochtend en middag",
      segments: [
        { task_occurrence_id: firstDemand.id, start_time: "08:00", end_time: "12:00" },
        { task_occurrence_id: secondDemand.id, start_time: "12:00", end_time: "16:00" },
      ],
      expected_occurrence_revisions: { [firstDemand.id]: 1, [secondDemand.id]: 1 },
    };
    const retryContext = context("compose-and-assign-reservation-recovery");

    await expect(backend.composeAndAssign(base44, user, payload, retryContext))
      .rejects.toMatchObject({ status: 409 });

    expect(entities.PlanningShift.records).toEqual([]);
    expect((await entities.PlanningTaskOccurrence.get(firstDemand.id)).metadata?.planning_composition_reservation)
      .toBeUndefined();
    expect((await entities.PlanningTaskOccurrence.get(secondDemand.id)).metadata?.planning_composition_reservation)
      .toBeUndefined();
    expect(entities.PlanningMutationCoordinator.records[0].lease).toBeNull();

    const recovered = await backend.composeAndAssign(base44, user, payload, retryContext);
    expect(recovered.segments).toHaveLength(2);
    expect(recovered.assignment.personnel_id).toBe("personnel-1");
  });

  it("herstelt dezelfde mutatiesleutel na een late auditfout zonder dubbele actieve records", async () => {
    const demand = occurrence("occurrence-reception", "object-1", "08:00", "16:00", 480);
    const { base44, entities } = setup([demand]);
    entities.Personnel.records.push({ id: "personnel-1", name: "Sam Beveiliger", status: "active" });
    const originalAuditCreate = entities.PlanningAuditEvent.create.bind(entities.PlanningAuditEvent);
    let failAuditOnce = true;
    entities.PlanningAuditEvent.create = async data => {
      if (data.action === "compose_and_assign" && failAuditOnce) {
        failAuditOnce = false;
        throw new Error("tijdelijke auditstoring");
      }
      return originalAuditCreate(data);
    };
    const payload = {
      personnel_id: "personnel-1",
      segments: [{ task_occurrence_id: demand.id, start_time: "08:00", end_time: "16:00" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    };
    const retryContext = context("compose-and-assign-recovery");

    const originalConsoleInfo = console.info;
    let errorTelemetry = null;
    console.info = (label, serialized) => {
      if (label !== "[planningApi:mutation_latency]") return;
      const telemetry = JSON.parse(serialized);
      if (telemetry.action !== "compose_and_assign" || telemetry.outcome !== "error") return;
      errorTelemetry = {
        telemetry,
        shift_compensated: entities.PlanningShift.records[0]?.metadata?.compose_and_assign?.phase === "compensated",
        active_segment_count: entities.PlanningShiftTaskSegment.records.filter(item => item.status !== "removed").length,
        active_assignment_count: entities.PlanningAssignment.records.filter(item => item.status !== "removed").length,
        all_leases_released: entities.PlanningMutationCoordinator.records.every(item => item.lease == null),
      };
    };
    try {
      await expect(backend.composeAndAssign(base44, user, payload, retryContext))
        .rejects.toThrow("tijdelijke auditstoring");
    } finally {
      console.info = originalConsoleInfo;
    }
    expect(errorTelemetry).toMatchObject({
      telemetry: {
        outcome: "error",
        phases_ms: expect.objectContaining({ recovery: expect.any(Number), release: expect.any(Number) }),
      },
      shift_compensated: true,
      active_segment_count: 0,
      active_assignment_count: 0,
      all_leases_released: true,
    });
    expect(entities.PlanningShift.records[0]).toMatchObject({
      status: "cancelled",
      metadata: { compose_and_assign: { phase: "compensated" } },
    });
    expect(entities.PlanningShiftTaskSegment.records.filter(item => item.status !== "removed")).toEqual([]);
    expect(entities.PlanningAssignment.records.filter(item => item.status !== "removed")).toEqual([]);

    const recovered = await backend.composeAndAssign(base44, user, payload, retryContext);

    expect(recovered.assignment.personnel_id).toBe("personnel-1");
    expect(entities.PlanningShift.records).toHaveLength(1);
    expect(entities.PlanningShiftTaskSegment.records.filter(item => item.status !== "removed")).toHaveLength(1);
    expect(entities.PlanningAssignment.records.filter(item => item.status !== "removed")).toHaveLength(1);
    expect(entities.PlanningAuditEvent.records).toEqual([
      expect.objectContaining({ action: "compose_and_assign", idempotency_key: retryContext.idempotencyKey }),
    ]);

    const replay = await backend.composeAndAssign(base44, user, payload, retryContext);
    expect(replay).toMatchObject({ idempotent: true, assignment: { id: recovered.assignment.id } });
    expect(entities.PlanningShift.records).toHaveLength(1);
    expect(entities.PlanningAuditEvent.records).toHaveLength(1);
  });

  it("weigert hergebruik van dezelfde mutatiesleutel met een andere medewerker", async () => {
    const demand = occurrence("occurrence-reception", "object-1", "08:00", "16:00", 480);
    const { base44, entities } = setup([demand]);
    entities.Personnel.records.push(
      { id: "personnel-1", name: "Sam Beveiliger", status: "active" },
      { id: "personnel-2", name: "Alex Beveiliger", status: "active" },
    );
    const mutationContext = context("compose-and-assign-fingerprint");
    const payload = {
      personnel_id: "personnel-1",
      segments: [{ task_occurrence_id: demand.id, start_time: "08:00", end_time: "16:00" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    };
    await backend.composeAndAssign(base44, user, payload, mutationContext);

    await expect(backend.composeAndAssign(base44, user, {
      ...payload,
      personnel_id: "personnel-2",
    }, mutationContext)).rejects.toMatchObject({ status: 409 });
    expect(entities.PlanningAssignment.records.filter(item => item.status !== "removed"))
      .toEqual([expect.objectContaining({ personnel_id: "personnel-1" })]);
  });

  it("laat een gelijktijdige tweede poging met dezelfde mutatiesleutel niet naast de eerste doorlopen", async () => {
    const demand = occurrence("occurrence-reception", "object-1", "08:00", "16:00", 480);
    const { base44, entities } = setup([demand]);
    entities.Personnel.records.push({ id: "personnel-1", name: "Sam Beveiliger", status: "active" });
    const originalShiftCreate = entities.PlanningShift.create.bind(entities.PlanningShift);
    let markFirstAtCreate;
    let releaseFirstCreate;
    const firstAtCreate = new Promise(resolve => { markFirstAtCreate = resolve; });
    const createReleased = new Promise(resolve => { releaseFirstCreate = resolve; });
    let blockFirstCreate = true;
    entities.PlanningShift.create = async data => {
      if (blockFirstCreate) {
        blockFirstCreate = false;
        markFirstAtCreate();
        await createReleased;
      }
      return originalShiftCreate(data);
    };
    const payload = {
      personnel_id: "personnel-1",
      segments: [{ task_occurrence_id: demand.id, start_time: "08:00", end_time: "16:00" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    };
    const mutationContext = context("compose-and-assign-in-flight");

    const firstAttempt = backend.composeAndAssign(base44, user, payload, mutationContext);
    await firstAtCreate;
    await expect(backend.composeAndAssign(base44, user, payload, mutationContext))
      .rejects.toMatchObject({ status: 409 });
    releaseFirstCreate();
    await firstAttempt;

    expect(entities.PlanningShift.records).toHaveLength(1);
    expect(entities.PlanningAssignment.records.filter(item => item.status !== "removed")).toHaveLength(1);
  });

  it("laat verschillende medewerkers en taakuitvoeringen parallel doorlopen", async () => {
    const firstDemand = occurrence("occurrence-reception", "object-1", "08:00", "12:00", 240);
    const secondDemand = occurrence("occurrence-rounds", "object-2", "12:00", "16:00", 240);
    const { base44, entities } = setup([firstDemand, secondDemand]);
    entities.Personnel.records.push(
      { id: "personnel-1", name: "Sam Beveiliger", status: "active" },
      { id: "personnel-2", name: "Alex Beveiliger", status: "active" },
    );
    const originalShiftCreate = entities.PlanningShift.create.bind(entities.PlanningShift);
    let markFirstAtCreate;
    let releaseFirstCreate;
    const firstAtCreate = new Promise(resolve => { markFirstAtCreate = resolve; });
    const createReleased = new Promise(resolve => { releaseFirstCreate = resolve; });
    let blockFirstCreate = true;
    entities.PlanningShift.create = async data => {
      if (blockFirstCreate) {
        blockFirstCreate = false;
        markFirstAtCreate();
        await createReleased;
      }
      return originalShiftCreate(data);
    };

    const firstAttempt = backend.composeAndAssign(base44, user, {
      personnel_id: "personnel-1",
      segments: [{ task_occurrence_id: firstDemand.id, start_time: "08:00", end_time: "12:00" }],
      expected_occurrence_revisions: { [firstDemand.id]: 1 },
    }, context("compose-parallel-a"));
    await firstAtCreate;
    const secondResult = await backend.composeAndAssign(base44, user, {
      personnel_id: "personnel-2",
      segments: [{ task_occurrence_id: secondDemand.id, start_time: "12:00", end_time: "16:00" }],
      expected_occurrence_revisions: { [secondDemand.id]: 1 },
    }, context("compose-parallel-b"));
    expect(secondResult.assignment.personnel_id).toBe("personnel-2");
    releaseFirstCreate();
    await firstAttempt;

    expect(entities.PlanningShift.records).toHaveLength(2);
    expect(entities.PlanningAuditEvent.records).toHaveLength(2);
  });

  it("blokkeert gelijktijdige mutaties voor dezelfde medewerker en kalenderdag", async () => {
    const firstDemand = occurrence("occurrence-reception", "object-1", "08:00", "12:00", 240);
    const secondDemand = occurrence("occurrence-rounds", "object-2", "12:00", "16:00", 240);
    const { base44, entities } = setup([firstDemand, secondDemand]);
    entities.Personnel.records.push({ id: "personnel-1", name: "Sam Beveiliger", status: "active" });
    const originalShiftCreate = entities.PlanningShift.create.bind(entities.PlanningShift);
    let markFirstAtCreate;
    let releaseFirstCreate;
    const firstAtCreate = new Promise(resolve => { markFirstAtCreate = resolve; });
    const createReleased = new Promise(resolve => { releaseFirstCreate = resolve; });
    let blockFirstCreate = true;
    entities.PlanningShift.create = async data => {
      if (blockFirstCreate) {
        blockFirstCreate = false;
        markFirstAtCreate();
        await createReleased;
      }
      return originalShiftCreate(data);
    };

    const firstAttempt = backend.composeAndAssign(base44, user, {
      personnel_id: "personnel-1",
      segments: [{ task_occurrence_id: firstDemand.id, start_time: "08:00", end_time: "12:00" }],
      expected_occurrence_revisions: { [firstDemand.id]: 1 },
    }, context("compose-same-person-day-a"));
    await firstAtCreate;
    await expect(backend.composeAndAssign(base44, user, {
      personnel_id: "personnel-1",
      segments: [{ task_occurrence_id: secondDemand.id, start_time: "12:00", end_time: "16:00" }],
      expected_occurrence_revisions: { [secondDemand.id]: 1 },
    }, context("compose-same-person-day-b"))).rejects.toMatchObject({ status: 409 });
    releaseFirstCreate();
    await firstAttempt;

    expect(entities.PlanningShift.records).toHaveLength(1);
    expect((await entities.PlanningTaskOccurrence.get(secondDemand.id)).metadata?.planning_composition_reservation)
      .toBeUndefined();
  });

  it("serialiseert een late dienst op D met een vroege dienst op D+1 en hercontroleert de rusttijd", async () => {
    const lateDemand = occurrence("occurrence-late-adjacent-day", "object-1", "21:00", "23:00", 120);
    const earlyDemand = {
      ...occurrence("occurrence-early-adjacent-day", "object-2", "06:00", "10:00", 240),
      service_date: "2026-08-18",
      end_date: "2026-08-18",
    };
    const { base44, entities } = setup([lateDemand, earlyDemand]);
    const personnelId = "personnel-adjacent-rest";
    entities.Personnel.records.push({ id: personnelId, name: "Rustvenster Beveiliger", status: "active" });
    const originalShiftCreate = entities.PlanningShift.create.bind(entities.PlanningShift);
    let markFirstAtCreate;
    let releaseFirstCreate;
    const firstAtCreate = new Promise(resolve => { markFirstAtCreate = resolve; });
    const createReleased = new Promise(resolve => { releaseFirstCreate = resolve; });
    let blockFirstCreate = true;
    entities.PlanningShift.create = async data => {
      if (blockFirstCreate) {
        blockFirstCreate = false;
        markFirstAtCreate();
        await createReleased;
      }
      return originalShiftCreate(data);
    };

    const firstAttempt = backend.composeAndAssign(base44, user, {
      personnel_id: personnelId,
      segments: [{ task_occurrence_id: lateDemand.id, start_time: "21:00", end_time: "23:00" }],
      expected_occurrence_revisions: { [lateDemand.id]: 1 },
    }, context("compose-adjacent-rest-late"));
    await firstAtCreate;
    try {
      await expect(backend.composeAndAssign(base44, user, {
        personnel_id: personnelId,
        segments: [{ task_occurrence_id: earlyDemand.id, start_time: "06:00", end_time: "10:00" }],
        expected_occurrence_revisions: { [earlyDemand.id]: 1 },
      }, context("compose-adjacent-rest-early-blocked"))).rejects.toMatchObject({ status: 409 });
    } finally {
      releaseFirstCreate();
    }
    await firstAttempt;

    const retried = await backend.composeAndAssign(base44, user, {
      personnel_id: personnelId,
      segments: [{ task_occurrence_id: earlyDemand.id, start_time: "06:00", end_time: "10:00" }],
      expected_occurrence_revisions: { [earlyDemand.id]: 1 },
    }, context("compose-adjacent-rest-early-retry"));

    expect(retried.assignment.warning_codes).toContain("insufficient_rest");
    expect(entities.PlanningShift.records).toHaveLength(2);
    expect(entities.PlanningAuditEvent.records).toHaveLength(2);
  });

  it("serialiseert niet-aangrenzende diensten binnen dezelfde ISO-week en herberekent daarna de weekgrens", async () => {
    const mondayDemand = occurrence("occurrence-week-lease-monday", "object-1", "08:00", "16:00", 480);
    const fridayDemand = {
      ...occurrence("occurrence-week-lease-friday", "object-2", "08:00", "16:00", 480),
      service_date: "2026-08-21",
      end_date: "2026-08-21",
    };
    const { base44, entities } = setup([mondayDemand, fridayDemand]);
    const personnelId = "personnel-week-lease";
    entities.Personnel.records.push({ id: personnelId, name: "Weekgrens Beveiliger", status: "active" });
    base44.asServiceRole.functions.invoke = async () => ({
      contract_id: "contract-week-lease",
      selected_contract: {
        id: "contract-week-lease",
        contract_hours_per_week: 12,
        max_hours_per_week: null,
      },
    });
    const originalShiftCreate = entities.PlanningShift.create.bind(entities.PlanningShift);
    let markFirstAtCreate;
    let releaseFirstCreate;
    const firstAtCreate = new Promise(resolve => { markFirstAtCreate = resolve; });
    const createReleased = new Promise(resolve => { releaseFirstCreate = resolve; });
    let blockFirstCreate = true;
    entities.PlanningShift.create = async data => {
      if (blockFirstCreate) {
        blockFirstCreate = false;
        markFirstAtCreate();
        await createReleased;
      }
      return originalShiftCreate(data);
    };

    const completionOrder = [];
    const firstAttempt = backend.composeAndAssign(base44, user, {
      personnel_id: personnelId,
      segments: [{ task_occurrence_id: mondayDemand.id, start_time: "08:00", end_time: "16:00" }],
      expected_occurrence_revisions: { [mondayDemand.id]: 1 },
    }, context("compose-week-lease-monday"));
    await firstAtCreate;
    try {
      await expect(backend.composeAndAssign(base44, user, {
        personnel_id: personnelId,
        segments: [{ task_occurrence_id: fridayDemand.id, start_time: "08:00", end_time: "16:00" }],
        expected_occurrence_revisions: { [fridayDemand.id]: 1 },
      }, context("compose-week-lease-friday-blocked"))).rejects.toMatchObject({
        status: 409,
        details: {
          code: "PLANNING_RESOURCE_BUSY",
          transient: true,
          resource_type: "personnel_day",
          resource_id: `week:${personnelId}:2026-08-17`,
          reservation_expires_at: expect.any(String),
        },
      });
    } finally {
      releaseFirstCreate();
    }
    await firstAttempt;
    completionOrder.push("maandag");

    const retried = await backend.composeAndAssign(base44, user, {
      personnel_id: personnelId,
      segments: [{ task_occurrence_id: fridayDemand.id, start_time: "08:00", end_time: "16:00" }],
      expected_occurrence_revisions: { [fridayDemand.id]: 1 },
    }, context("compose-week-lease-friday-retry"));
    completionOrder.push("vrijdag");

    expect(completionOrder).toEqual(["maandag", "vrijdag"]);
    expect(retried.assignment.warning_snapshot).toContainEqual(expect.objectContaining({
      code: "contract_hours_exceeded",
      source: "planning_contract_hours",
      details: expect.objectContaining({
        week_start: "2026-08-17",
        week_end: "2026-08-23",
        scheduled_minutes: 16 * 60,
        limit_minutes: 12 * 60,
      }),
    }));
    expect(entities.PlanningShift.records).toHaveLength(2);
    expect(entities.PlanningAuditEvent.records).toHaveLength(2);
  });

  it("laat dezelfde medewerker in verschillende ISO-weken parallel doorlopen", async () => {
    const firstWeekDemand = occurrence("occurrence-parallel-week-one", "object-1", "08:00", "12:00", 240);
    const secondWeekDemand = {
      ...occurrence("occurrence-parallel-week-two", "object-2", "08:00", "12:00", 240),
      service_date: "2026-08-24",
      end_date: "2026-08-24",
    };
    const { base44, entities } = setup([firstWeekDemand, secondWeekDemand]);
    const personnelId = "personnel-parallel-weeks";
    entities.Personnel.records.push({ id: personnelId, name: "Parallelle Week Beveiliger", status: "active" });
    const originalShiftCreate = entities.PlanningShift.create.bind(entities.PlanningShift);
    let markFirstAtCreate;
    let releaseFirstCreate;
    const firstAtCreate = new Promise(resolve => { markFirstAtCreate = resolve; });
    const createReleased = new Promise(resolve => { releaseFirstCreate = resolve; });
    let blockFirstCreate = true;
    entities.PlanningShift.create = async data => {
      if (blockFirstCreate) {
        blockFirstCreate = false;
        markFirstAtCreate();
        await createReleased;
      }
      return originalShiftCreate(data);
    };

    const firstAttempt = backend.composeAndAssign(base44, user, {
      personnel_id: personnelId,
      segments: [{ task_occurrence_id: firstWeekDemand.id, start_time: "08:00", end_time: "12:00" }],
      expected_occurrence_revisions: { [firstWeekDemand.id]: 1 },
    }, context("compose-parallel-week-one"));
    await firstAtCreate;
    let secondResult;
    try {
      secondResult = await backend.composeAndAssign(base44, user, {
        personnel_id: personnelId,
        segments: [{ task_occurrence_id: secondWeekDemand.id, start_time: "08:00", end_time: "12:00" }],
        expected_occurrence_revisions: { [secondWeekDemand.id]: 1 },
      }, context("compose-parallel-week-two"));
    } finally {
      releaseFirstCreate();
    }
    await firstAttempt;

    expect(secondResult.assignment.personnel_id).toBe(personnelId);
    expect(entities.PlanningMutationCoordinator.records
      .filter(item => item.resource_type === "personnel_day" && item.resource_id.startsWith("week:"))
      .map(item => item.resource_id)
      .sort()).toEqual([
        `week:${personnelId}:2026-08-17`,
        `week:${personnelId}:2026-08-24`,
      ]);
    expect(entities.PlanningShift.records).toHaveLength(2);
    expect(entities.PlanningAuditEvent.records).toHaveLength(2);
  });

  it("serialiseert dezelfde sleutel ook bij disjuncte occurrences en verschillende payloads", async () => {
    const firstDemand = occurrence("occurrence-reception", "object-1", "08:00", "12:00", 240);
    const secondDemand = occurrence("occurrence-rounds", "object-2", "12:00", "16:00", 240);
    const { base44, entities } = setup([firstDemand, secondDemand]);
    entities.Personnel.records.push(
      { id: "personnel-1", name: "Sam Beveiliger", status: "active" },
      { id: "personnel-2", name: "Alex Beveiliger", status: "active" },
    );
    const originalShiftCreate = entities.PlanningShift.create.bind(entities.PlanningShift);
    let markFirstAtCreate;
    let releaseFirstCreate;
    const firstAtCreate = new Promise(resolve => { markFirstAtCreate = resolve; });
    const createReleased = new Promise(resolve => { releaseFirstCreate = resolve; });
    let blockFirstCreate = true;
    entities.PlanningShift.create = async data => {
      if (blockFirstCreate) {
        blockFirstCreate = false;
        markFirstAtCreate();
        await createReleased;
      }
      return originalShiftCreate(data);
    };
    const sharedContext = context("compose-and-assign-disjoint");
    const firstPayload = {
      personnel_id: "personnel-1",
      segments: [{ task_occurrence_id: firstDemand.id, start_time: "08:00", end_time: "12:00" }],
      expected_occurrence_revisions: { [firstDemand.id]: 1 },
    };
    const secondPayload = {
      personnel_id: "personnel-2",
      segments: [{ task_occurrence_id: secondDemand.id, start_time: "12:00", end_time: "16:00" }],
      expected_occurrence_revisions: { [secondDemand.id]: 1 },
    };

    const firstAttempt = backend.composeAndAssign(base44, user, firstPayload, sharedContext);
    await firstAtCreate;
    await expect(backend.composeAndAssign(base44, user, secondPayload, sharedContext))
      .rejects.toMatchObject({ status: 409 });
    releaseFirstCreate();
    await firstAttempt;

    await expect(backend.composeAndAssign(base44, user, secondPayload, sharedContext))
      .rejects.toMatchObject({ status: 409 });
    expect(entities.PlanningShift.records).toHaveLength(1);
    expect(entities.PlanningAuditEvent.records).toHaveLength(1);
    expect((await entities.PlanningTaskOccurrence.get(secondDemand.id)).metadata?.planning_composition_reservation)
      .toBeUndefined();
  });

  it("legt een overlap vast die pas tijdens de assignment-write ontstaat", async () => {
    const demand = occurrence("occurrence-reception", "object-1", "08:00", "16:00", 480);
    const { base44, entities } = setup([demand]);
    entities.Personnel.records.push({ id: "personnel-1", name: "Sam Beveiliger", status: "active" });
    const originalAssignmentCreate = entities.PlanningAssignment.create.bind(entities.PlanningAssignment);
    entities.PlanningAssignment.create = async data => {
      const created = await originalAssignmentCreate(data);
      entities.PlanningShift.records.push({
        id: "shift-concurrent",
        source_key: "manual-concurrent",
        source_type: "manual",
        service_name_snapshot: "Gelijktijdige dienst",
        service_date: "2026-08-17",
        start_time: "10:00",
        end_time: "12:00",
        required_count: 1,
        status: "draft",
        revision: 1,
        published_revision: 0,
      });
      entities.PlanningAssignment.records.push({
        id: "assignment-concurrent",
        shift_id: "shift-concurrent",
        slot_index: 0,
        personnel_id: "personnel-1",
        personnel_name_snapshot: "Sam Beveiliger",
        status: "draft",
        warning_codes: [],
        warning_snapshot: [],
        has_critical_warnings: false,
        revision: 1,
        published_revision: 0,
      });
      return created;
    };
    const calls = instrumentBackendCalls(base44, entities);

    const result = await backend.composeAndAssign(base44, user, {
      personnel_id: "personnel-1",
      segments: [{ task_occurrence_id: demand.id, start_time: "08:00", end_time: "16:00" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    }, context("compose-and-assign-final-validation"));

    expect(result.assignment.has_critical_warnings).toBe(true);
    expect(result.assignment.warning_codes).toContain("shift_overlap");
    expect(result.assignment.metadata?.final_assignment_validation_at).toBeTruthy();
    expect(calls.count("PlanningAssignment.create")).toBe(1);
    expect(calls.count("PlanningAssignment.updateMany")).toBe(1);
    expect(calls.count("functions.invoke:resolveCaoPlanningAssignmentDecision")).toBe(1);
  });

  it("herlaadt de medewerker na de assignment-write voor de definitieve geschiktheidscontrole", async () => {
    const demand = occurrence("occurrence-reception", "object-1", "08:00", "16:00", 480);
    const { base44, entities } = setup([demand]);
    entities.Personnel.records.push({ id: "personnel-1", name: "Sam Beveiliger", status: "active" });
    const originalAssignmentCreate = entities.PlanningAssignment.create.bind(entities.PlanningAssignment);
    entities.PlanningAssignment.create = async data => {
      const created = await originalAssignmentCreate(data);
      entities.Personnel.records[0].status = "inactive";
      return created;
    };
    const calls = instrumentBackendCalls(base44, entities);

    const result = await backend.composeAndAssign(base44, user, {
      personnel_id: "personnel-1",
      segments: [{ task_occurrence_id: demand.id, start_time: "08:00", end_time: "16:00" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    }, context("compose-and-assign-final-personnel-reload"));

    expect(result.assignment.has_critical_warnings).toBe(true);
    expect(result.assignment.warning_codes).toContain("personnel_not_active");
    expect(result.assignment.metadata?.final_assignment_validation_at).toBeTruthy();
    expect(calls.count("PlanningAssignment.create")).toBe(1);
    expect(calls.count("PlanningAssignment.updateMany")).toBe(1);
    expect(calls.count("functions.invoke:resolveCaoPlanningAssignmentDecision")).toBe(1);
  });

  it("laat bij twee gelijktijdige composities met dezelfde occurrence-revision exact één request slagen", async () => {
    const demand = occurrence("occurrence-reception", "object-1", "08:00", "16:00", 480);
    const { base44, entities } = setup([demand]);
    const compose = idempotencyKey => backend.composeShift(base44, user, {
      segments: [{ task_occurrence_id: demand.id, start_time: "08:00", end_time: "16:00" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    }, context(idempotencyKey));

    const results = await Promise.allSettled([
      compose("compose-concurrent-a"),
      compose("compose-concurrent-b"),
    ]);
    const fulfilled = results.filter(result => result.status === "fulfilled");
    const rejected = results.filter(result => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ status: 409 });
    expect(entities.PlanningShift.records).toHaveLength(1);
    expect(entities.PlanningShiftTaskSegment.records.filter(item => item.status !== "removed")).toHaveLength(1);
    expect(backend.occurrenceCoverage(demand, entities.PlanningShiftTaskSegment.records)).toMatchObject({
      coverage_status: "full",
      allocated_minutes: 480,
      remaining_minutes: 0,
    });
  });

  it("verdeelt één taak veilig over twee aansluitende diensten", async () => {
    const demand = occurrence("occurrence-reception", "object-1", "08:00", "16:00", 480);
    const { base44, entities } = setup([demand]);

    await backend.composeShift(base44, user, {
      segments: [{ task_occurrence_id: demand.id, start_time: "08:00", end_time: "12:00" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    }, context("compose-morning"));
    const occurrenceAfterMorning = await entities.PlanningTaskOccurrence.get(demand.id);
    await backend.composeShift(base44, user, {
      segments: [{ task_occurrence_id: demand.id, start_time: "12:00", end_time: "16:00" }],
      expected_occurrence_revisions: { [demand.id]: occurrenceAfterMorning.revision },
    }, context("compose-evening"));

    expect(entities.PlanningShift.records).toHaveLength(2);
    expect(backend.occurrenceCoverage(demand, entities.PlanningShiftTaskSegment.records)).toMatchObject({
      coverage_status: "full",
      allocated_minutes: 480,
      remaining_minutes: 0,
    });
  });

  it("combineert taken van meerdere objecten tot één geordende dienst", async () => {
    const reception = occurrence("occurrence-reception", "object-1", "15:30", "18:15", 165);
    const rounds = occurrence("occurrence-rounds", "object-2", "18:15", "23:30", 315);
    const { base44, entities } = setup([reception, rounds]);

    const result = await backend.composeShift(base44, user, {
      service_name: "Receptie en avondronde",
      segments: [
        { task_occurrence_id: reception.id, start_time: "15:30", end_time: "18:15" },
        { task_occurrence_id: rounds.id, start_time: "18:15", end_time: "23:30" },
      ],
      expected_occurrence_revisions: { [reception.id]: 1, [rounds.id]: 1 },
    }, context("compose-combined"));

    expect(result.shift).toMatchObject({
      service_name_snapshot: "Receptie en avondronde",
      start_time: "15:30",
      end_time: "23:30",
      customer_id: "customer-1",
      object_id: null,
      object_ids: ["object-1", "object-2"],
      task_segment_count: 2,
    });
    expect(result.segments.map(item => item.sequence_index)).toEqual([0, 1]);
    expect(result.composition_warnings).toContainEqual(expect.objectContaining({ code: "object_transition_review_1" }));
    expect(entities.PlanningAuditEvent.records[0].action).toBe("compose_shift");
  });

  it("combineert aansluitende nachttaken over twee kalenderdagen", async () => {
    const nightReception = {
      ...occurrence("occurrence-night-reception", "object-1", "22:00", "00:30", 150),
      service_date: "2026-08-17",
      end_date: "2026-08-18",
    };
    const earlyRound = {
      ...occurrence("occurrence-early-round", "object-2", "00:30", "02:00", 90),
      service_date: "2026-08-18",
      end_date: "2026-08-18",
    };
    const { base44, entities } = setup([nightReception, earlyRound]);
    entities.Personnel.records.push({ id: "personnel-night", name: "Nacht Beveiliger", status: "active" });

    const result = await backend.composeAndAssign(base44, user, {
      personnel_id: "personnel-night",
      service_name: "Nachtreceptie en vroege ronde",
      segments: [
        {
          task_occurrence_id: nightReception.id,
          start_date: "2026-08-17",
          end_date: "2026-08-18",
          start_time: "22:00",
          end_time: "00:30",
        },
        {
          task_occurrence_id: earlyRound.id,
          start_date: "2026-08-18",
          end_date: "2026-08-18",
          start_time: "00:30",
          end_time: "02:00",
        },
      ],
      expected_occurrence_revisions: { [nightReception.id]: 1, [earlyRound.id]: 1 },
    }, context("compose-cross-calendar-night"));

    expect(result.shift).toMatchObject({
      service_date: "2026-08-17",
      end_date: "2026-08-18",
      start_time: "22:00",
      end_time: "02:00",
      duration_minutes: 240,
    });
    expect(result.segments).toHaveLength(2);
    expect(entities.PlanningMutationCoordinator.records
      .filter(item => item.resource_type === "personnel_day")
      .map(item => item.resource_id)
      .sort()).toEqual([
        "personnel-night:2026-08-16",
        "personnel-night:2026-08-17",
        "personnel-night:2026-08-18",
        "personnel-night:2026-08-19",
        "week:personnel-night:2026-08-17",
      ]);
  });

  it("weigert een samengestelde dienst met een envelope langer dan 24 uur", async () => {
    const first = occurrence("occurrence-first-day", "object-1", "08:00", "09:00", 60);
    const second = {
      ...occurrence("occurrence-next-day", "object-2", "09:00", "10:00", 60),
      service_date: "2026-08-18",
      end_date: "2026-08-18",
    };
    const { base44 } = setup([first, second]);

    await expect(backend.composeShift(base44, user, {
      segments: [
        { task_occurrence_id: first.id, start_time: "08:00", end_time: "09:00" },
        {
          task_occurrence_id: second.id,
          start_date: "2026-08-18",
          end_date: "2026-08-18",
          start_time: "09:00",
          end_time: "10:00",
        },
      ],
      expected_occurrence_revisions: { [first.id]: 1, [second.id]: 1 },
    }, context("compose-too-long-envelope"))).rejects.toMatchObject({ status: 409 });
  });

  it("verwijdert een ongepubliceerde conceptdienst en geeft de taakdekking gecontroleerd vrij", async () => {
    const demand = occurrence("occurrence-reception", "object-1", "08:00", "16:00", 480);
    const { base44, entities } = setup([demand]);
    const composition = await backend.composeShift(base44, user, {
      segments: [{ task_occurrence_id: demand.id, start_time: "08:00", end_time: "16:00" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    }, context("compose-before-cancel"));
    const occurrenceBeforeCancel = await entities.PlanningTaskOccurrence.get(demand.id);

    const result = await backend.cancelTaskShift(base44, user, {
      shift_id: composition.shift.id,
      expected_shift_revision: composition.shift.revision,
      expected_occurrence_revisions: { [demand.id]: occurrenceBeforeCancel.revision },
    }, context("cancel-task-shift"));

    expect(result.shift.status).toBe("cancelled");
    expect(entities.PlanningShiftTaskSegment.records).toContainEqual(expect.objectContaining({ status: "removed" }));
    expect(backend.occurrenceCoverage(demand, entities.PlanningShiftTaskSegment.records)).toMatchObject({
      coverage_status: "open",
      allocated_minutes: 0,
      remaining_minutes: 480,
    });
    expect(entities.PlanningAuditEvent.records.at(-1)).toMatchObject({ action: "cancel_task_shift" });
  });

  it("weigert overlap en overallocatie over verschillende diensten", async () => {
    const demand = occurrence("occurrence-reception", "object-1", "08:00", "16:00", 480);
    const { base44, entities } = setup([demand]);
    await backend.composeShift(base44, user, {
      segments: [{ task_occurrence_id: demand.id, start_time: "08:00", end_time: "13:00" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    }, context("compose-first"));
    const occurrenceAfterFirstComposition = await entities.PlanningTaskOccurrence.get(demand.id);

    await expect(backend.composeShift(base44, user, {
      segments: [{ task_occurrence_id: demand.id, start_time: "12:00", end_time: "16:00" }],
      expected_occurrence_revisions: { [demand.id]: occurrenceAfterFirstComposition.revision },
    }, context("compose-overlap"))).rejects.toMatchObject({ status: 409 });
  });

  it("verkleint 06:00-20:00 veilig, vult 12:00-20:00 aan en laat een overlappende resize niets wijzigen", async () => {
    const demand = occurrence("occurrence-reception-timeline", "object-1", "06:00", "20:00", 840);
    const { base44, entities } = setup([demand]);
    entities.Personnel.records.push(
      { id: "personnel-morning", name: "Ochtend Beveiliger", status: "active" },
      { id: "personnel-evening", name: "Avond Beveiliger", status: "active" },
    );

    const full = await backend.composeAndAssign(base44, user, {
      personnel_id: "personnel-morning",
      segments: [{ task_occurrence_id: demand.id, start_time: "06:00", end_time: "18:00" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    }, context("timeline-full"));
    const occurrenceBeforeResize = await entities.PlanningTaskOccurrence.get(demand.id);
    const resized = await backend.composeShift(base44, user, {
      action: "update_shift_composition",
      shift_id: full.shift.id,
      expected_shift_revision: full.shift.revision,
      expected_occurrence_revisions: { [demand.id]: occurrenceBeforeResize.revision },
      segments: [{ task_occurrence_id: demand.id, start_time: "06:00", end_time: "12:00" }],
    }, context("timeline-resize-morning"));

    expect(resized.shift).toMatchObject({ start_time: "06:00", end_time: "12:00", duration_minutes: 360 });
    expect(resized.assignments).toContainEqual(expect.objectContaining({ personnel_id: "personnel-morning", status: "draft" }));
    expect(entities.PlanningShiftTaskSegment.records.filter(item => item.status !== "removed")).toHaveLength(1);
    expect(backend.occurrenceCoverage(
      demand,
      entities.PlanningShiftTaskSegment.records,
      entities.PlanningShift.records,
    )).toMatchObject({ coverage_status: "partial", allocated_minutes: 360, remaining_minutes: 480 });

    const occurrenceBeforeEvening = await entities.PlanningTaskOccurrence.get(demand.id);
    const evening = await backend.composeAndAssign(base44, user, {
      personnel_id: "personnel-evening",
      segments: [{ task_occurrence_id: demand.id, start_time: "12:00", end_time: "20:00" }],
      expected_occurrence_revisions: { [demand.id]: occurrenceBeforeEvening.revision },
    }, context("timeline-fill-evening"));
    expect(backend.occurrenceCoverage(
      demand,
      entities.PlanningShiftTaskSegment.records,
      entities.PlanningShift.records,
    )).toMatchObject({ coverage_status: "full", allocated_minutes: 840, remaining_minutes: 0 });

    const occurrenceBeforeOverlap = await entities.PlanningTaskOccurrence.get(demand.id);
    const businessStateBeforeOverlap = structuredClone({
      shifts: entities.PlanningShift.records,
      segments: entities.PlanningShiftTaskSegment.records,
      occurrences: entities.PlanningTaskOccurrence.records,
      assignments: entities.PlanningAssignment.records,
    });
    await expect(backend.composeShift(base44, user, {
      action: "update_shift_composition",
      shift_id: resized.shift.id,
      expected_shift_revision: resized.shift.revision,
      expected_occurrence_revisions: { [demand.id]: occurrenceBeforeOverlap.revision },
      segments: [{ task_occurrence_id: demand.id, start_time: "06:00", end_time: "13:00" }],
    }, context("timeline-overlap-rejected"))).rejects.toMatchObject({ status: 409 });
    expect({
      shifts: entities.PlanningShift.records,
      segments: entities.PlanningShiftTaskSegment.records,
      occurrences: entities.PlanningTaskOccurrence.records,
      assignments: entities.PlanningAssignment.records,
    }).toEqual(businessStateBeforeOverlap);
    expect(evening.shift.start_time).toBe("12:00");
  });

  it("verplaatst één gedeelde taakgrens atomair en behoudt beide medewerkers zonder gat of overlap", async () => {
    const demand = occurrence("occurrence-reception-shared-boundary", "object-1", "10:00", "18:00", 480);
    const { base44, entities } = setup([demand]);
    const fixture = await createAdjacentAssignedTaskShifts({
      demand,
      base44,
      entities,
      prefix: "shared-boundary-success",
    });
    let validationCalls = 0;
    base44.asServiceRole.functions.invoke = async () => {
      validationCalls += 1;
      return {};
    };
    const shiftCount = entities.PlanningShift.records.length;
    const segmentCount = entities.PlanningShiftTaskSegment.records.length;
    const assignmentIds = entities.PlanningAssignment.records.map(item => item.id).sort();

    const result = await backend.resizeSharedTaskBoundary(
      base44,
      user,
      fixture.body,
      context("shared-boundary-success-resize"),
    );

    expect(result.shifts).toEqual([
      expect.objectContaining({
        id: fixture.early.shift.id,
        start_time: "10:00",
        end_time: "15:00",
        duration_minutes: 300,
        status: "draft",
      }),
      expect.objectContaining({
        id: fixture.late.shift.id,
        start_time: "15:00",
        end_time: "18:00",
        duration_minutes: 180,
        status: "draft",
      }),
    ]);
    expect(result.segments).toEqual([
      expect.objectContaining({
        id: fixture.early.segments[0].id,
        start_time: "10:00",
        end_time: "15:00",
        duration_minutes: 300,
      }),
      expect.objectContaining({
        id: fixture.late.segments[0].id,
        start_time: "15:00",
        end_time: "18:00",
        duration_minutes: 180,
      }),
    ]);
    expect(result.assignments.map(item => item.id).sort()).toEqual(assignmentIds);
    expect(result.assignments.map(item => item.personnel_id).sort()).toEqual([
      "shared-boundary-success-early-personnel",
      "shared-boundary-success-late-personnel",
    ]);
    expect(validationCalls).toBe(2);
    expect(entities.PlanningShift.records).toHaveLength(shiftCount);
    expect(entities.PlanningShiftTaskSegment.records).toHaveLength(segmentCount);
    expect(entities.PlanningAssignment.records.map(item => item.id).sort()).toEqual(assignmentIds);
    expect(backend.occurrenceCoverage(
      demand,
      entities.PlanningShiftTaskSegment.records,
      entities.PlanningShift.records,
    )).toMatchObject({ coverage_status: "full", allocated_minutes: 480, remaining_minutes: 0 });
    expect(entities.PlanningAuditEvent.records.filter(item => item.action === "resize_shared_task_boundary"))
      .toEqual([expect.objectContaining({
        resource_type: "PlanningTaskOccurrence",
        resource_id: demand.id,
        actor_user_id: user.id,
        idempotency_key: "shared-boundary-success-resize",
        metadata: expect.objectContaining({
          affected_shift_ids: [fixture.early.shift.id, fixture.late.shift.id],
          affected_segment_ids: [fixture.early.segments[0].id, fixture.late.segments[0].id],
        }),
      })]);
  });

  it("replayt dezelfde gedeelde grens zonder extra audit of revisiewijzigingen", async () => {
    const demand = occurrence("occurrence-reception-shared-replay", "object-1", "10:00", "18:00", 480);
    const { base44, entities } = setup([demand]);
    const fixture = await createAdjacentAssignedTaskShifts({
      demand,
      base44,
      entities,
      prefix: "shared-boundary-replay",
    });
    const mutation = context("shared-boundary-replay-resize");
    const first = await backend.resizeSharedTaskBoundary(base44, user, fixture.body, mutation);
    const stateAfterFirst = structuredClone({
      shifts: entities.PlanningShift.records,
      segments: entities.PlanningShiftTaskSegment.records,
      assignments: entities.PlanningAssignment.records,
      occurrences: entities.PlanningTaskOccurrence.records,
    });

    const replay = await backend.resizeSharedTaskBoundary(base44, user, fixture.body, mutation);

    expect(replay).toMatchObject({ ok: true, idempotent: true, audit_event_id: first.audit_event_id });
    expect({
      shifts: entities.PlanningShift.records,
      segments: entities.PlanningShiftTaskSegment.records,
      assignments: entities.PlanningAssignment.records,
      occurrences: entities.PlanningTaskOccurrence.records,
    }).toEqual(stateAfterFirst);
    expect(entities.PlanningAuditEvent.records.filter(item => item.action === "resize_shared_task_boundary"))
      .toHaveLength(1);
  });

  it("compacteert voltooide herstelmetadata zodat herhaald grensschuiven niet recursief groeit", async () => {
    const demand = occurrence("occurrence-reception-shared-compact", "object-1", "10:00", "18:00", 480);
    const { base44, entities } = setup([demand]);
    const fixture = await createAdjacentAssignedTaskShifts({
      demand,
      base44,
      entities,
      prefix: "shared-boundary-compact",
    });

    await backend.resizeSharedTaskBoundary(
      base44,
      user,
      fixture.body,
      context("shared-boundary-compact-first"),
    );
    const afterFirst = await entities.PlanningTaskOccurrence.get(demand.id);
    const firstState = afterFirst.metadata.shared_boundary_mutation;
    expect(firstState).toMatchObject({ phase: "completed", boundary_time: "15:00" });
    expect(firstState.before_state).toBeUndefined();
    expect(firstState.target_state).toBeUndefined();

    const leftShift = await entities.PlanningShift.get(fixture.early.shift.id);
    const rightShift = await entities.PlanningShift.get(fixture.late.shift.id);
    const leftSegment = await entities.PlanningShiftTaskSegment.get(fixture.early.segments[0].id);
    const rightSegment = await entities.PlanningShiftTaskSegment.get(fixture.late.segments[0].id);
    const assignments = entities.PlanningAssignment.records.filter(item => item.status !== "removed");
    await backend.resizeSharedTaskBoundary(base44, user, {
      ...fixture.body,
      boundary_time: "14:30",
      expected_shift_revisions: {
        [leftShift.id]: leftShift.revision,
        [rightShift.id]: rightShift.revision,
      },
      expected_segment_revisions: {
        [leftSegment.id]: leftSegment.revision,
        [rightSegment.id]: rightSegment.revision,
      },
      expected_assignment_revisions: Object.fromEntries(assignments.map(item => [item.id, item.revision])),
      expected_occurrence_revision: afterFirst.revision,
    }, context("shared-boundary-compact-second"));

    const afterSecond = await entities.PlanningTaskOccurrence.get(demand.id);
    const secondState = afterSecond.metadata.shared_boundary_mutation;
    expect(secondState).toMatchObject({ phase: "completed", boundary_time: "14:30" });
    expect(secondState.before_state).toBeUndefined();
    expect(secondState.target_state).toBeUndefined();
    expect(JSON.stringify(secondState).length).toBeLessThan(2_000);
    expect(JSON.stringify(secondState)).not.toContain("shared-boundary-compact-first");
  });

  it("herstelt na een late auditstoring met dezelfde key zonder dubbele writes", async () => {
    const demand = occurrence("occurrence-reception-shared-recovery", "object-1", "10:00", "18:00", 480);
    const { base44, entities } = setup([demand]);
    const fixture = await createAdjacentAssignedTaskShifts({
      demand,
      base44,
      entities,
      prefix: "shared-boundary-recovery",
    });
    const originalAuditCreate = entities.PlanningAuditEvent.create.bind(entities.PlanningAuditEvent);
    let failed = false;
    entities.PlanningAuditEvent.create = async data => {
      if (!failed && data.action === "resize_shared_task_boundary") {
        failed = true;
        throw new Error("tijdelijke gedeelde-grens-auditstoring");
      }
      return originalAuditCreate(data);
    };
    const mutation = context("shared-boundary-recovery-resize");

    await expect(backend.resizeSharedTaskBoundary(base44, user, fixture.body, mutation))
      .rejects.toThrow("tijdelijke gedeelde-grens-auditstoring");
    const stateBeforeRecovery = structuredClone({
      shifts: entities.PlanningShift.records,
      segments: entities.PlanningShiftTaskSegment.records,
      assignments: entities.PlanningAssignment.records,
    });
    expect(entities.PlanningAuditEvent.records.filter(item => item.action === "resize_shared_task_boundary"))
      .toHaveLength(0);

    const recovered = await backend.resizeSharedTaskBoundary(base44, user, fixture.body, mutation);

    expect(recovered).toMatchObject({ ok: true, boundary: { date: "2026-08-17", time: "15:00" } });
    expect({
      shifts: entities.PlanningShift.records,
      segments: entities.PlanningShiftTaskSegment.records,
      assignments: entities.PlanningAssignment.records,
    }).toEqual(stateBeforeRecovery);
    expect((await entities.PlanningTaskOccurrence.get(demand.id)).metadata?.shared_boundary_mutation)
      .toMatchObject({ phase: "completed", effective_view: "target", audit_event_id: expect.any(String) });
    expect(entities.PlanningAuditEvent.records.filter(item => item.action === "resize_shared_task_boundary"))
      .toHaveLength(1);
  });

  it("vervolgt met dezelfde key na een gedeeltelijke boundary-write zonder overlap of dubbele records", async () => {
    const demand = occurrence("occurrence-reception-shared-partial", "object-1", "10:00", "18:00", 480);
    const { base44, entities } = setup([demand]);
    const fixture = await createAdjacentAssignedTaskShifts({
      demand,
      base44,
      entities,
      prefix: "shared-boundary-partial",
    });
    const originalSegmentUpdate = entities.PlanningShiftTaskSegment.updateMany
      .bind(entities.PlanningShiftTaskSegment);
    let failOnce = true;
    entities.PlanningShiftTaskSegment.updateMany = async (query, update) => {
      if (
        failOnce
        && query.id === fixture.late.segments[0].id
        && update.$set?.start_time === "15:00"
      ) {
        failOnce = false;
        return { success: true, updated: 0 };
      }
      return originalSegmentUpdate(query, update);
    };
    const mutation = context("shared-boundary-partial-resize");

    await expect(backend.resizeSharedTaskBoundary(base44, user, fixture.body, mutation))
      .rejects.toMatchObject({ status: 409 });
    expect((await entities.PlanningTaskOccurrence.get(demand.id)).metadata?.planning_composition_reservation)
      .toMatchObject({
        action: "resize_shared_task_boundary",
        idempotency_key: mutation.idempotencyKey,
        status: "pending",
      });
    expect((await entities.PlanningShift.get(fixture.late.shift.id)).start_time).toBe("15:00");
    expect(backend.occurrenceCoverage(
      demand,
      entities.PlanningShiftTaskSegment.records,
      entities.PlanningShift.records,
    ).allocated_minutes).toBe(480);

    const recovered = await backend.resizeSharedTaskBoundary(base44, user, fixture.body, mutation);

    expect(recovered.shifts).toEqual([
      expect.objectContaining({ start_time: "10:00", end_time: "15:00" }),
      expect.objectContaining({ start_time: "15:00", end_time: "18:00" }),
    ]);
    expect(entities.PlanningShift.records).toHaveLength(2);
    expect(entities.PlanningShiftTaskSegment.records).toHaveLength(2);
    expect(entities.PlanningAssignment.records).toHaveLength(2);
    expect(entities.PlanningAuditEvent.records.filter(item => item.action === "resize_shared_task_boundary"))
      .toHaveLength(1);
  });

  it("herstelt met een nieuwe context na een fout tussen beide segmentwrites", async () => {
    const demand = occurrence("occurrence-reception-shared-mid-segment", "object-1", "10:00", "18:00", 480);
    const { base44, entities } = setup([demand]);
    const fixture = await createAdjacentAssignedTaskShifts({
      demand,
      base44,
      entities,
      prefix: "shared-boundary-mid-segment",
    });
    const originalUpdate = entities.PlanningShiftTaskSegment.updateMany
      .bind(entities.PlanningShiftTaskSegment);
    let boundaryWriteAttempts = 0;
    entities.PlanningShiftTaskSegment.updateMany = async (query, update) => {
      if (update.$set?.metadata?.shared_boundary_mutation?.idempotency_key === "shared-boundary-mid-segment-resize") {
        boundaryWriteAttempts += 1;
        if (boundaryWriteAttempts === 2) return { success: true, updated: 0 };
      }
      return originalUpdate(query, update);
    };

    await expect(backend.resizeSharedTaskBoundary(
      base44,
      user,
      fixture.body,
      context("shared-boundary-mid-segment-resize"),
    )).rejects.toMatchObject({ status: 409 });
    expect(boundaryWriteAttempts).toBe(2);
    expect(backend.occurrenceCoverage(
      demand,
      entities.PlanningShiftTaskSegment.records,
      entities.PlanningShift.records,
    )).toMatchObject({ coverage_status: "partial", allocated_minutes: 420, remaining_minutes: 60 });

    const repaired = await backend.repairSharedTaskBoundary(
      base44,
      user,
      { task_occurrence_id: demand.id },
      context("new-browser-boundary-repair"),
    );

    expect(repaired).toMatchObject({ ok: true, repaired: true, boundary: { time: "15:00" } });
    expect(backend.occurrenceCoverage(
      demand,
      entities.PlanningShiftTaskSegment.records,
      entities.PlanningShift.records,
    )).toMatchObject({ coverage_status: "full", allocated_minutes: 480, remaining_minutes: 0 });
    expect((await entities.PlanningTaskOccurrence.get(demand.id)).metadata?.shared_boundary_mutation)
      .toMatchObject({ phase: "completed", effective_view: "target" });
    expect(entities.PlanningAuditEvent.records.filter(item => item.action === "resize_shared_task_boundary"))
      .toEqual([expect.objectContaining({ idempotency_key: "shared-boundary-mid-segment-resize" })]);
  });

  it("herstelt een onafgeronde grens automatisch bij bootstrap vanuit een nieuwe sessie", async () => {
    const demand = occurrence("occurrence-reception-shared-bootstrap-repair", "object-1", "10:00", "18:00", 480);
    const { base44, entities } = setup([demand]);
    const fixture = await createAdjacentAssignedTaskShifts({
      demand,
      base44,
      entities,
      prefix: "shared-boundary-bootstrap-repair",
    });
    const originalUpdate = entities.PlanningShiftTaskSegment.updateMany
      .bind(entities.PlanningShiftTaskSegment);
    let boundaryWriteAttempts = 0;
    entities.PlanningShiftTaskSegment.updateMany = async (query, update) => {
      if (update.$set?.metadata?.shared_boundary_mutation?.idempotency_key === "shared-boundary-bootstrap-resize") {
        boundaryWriteAttempts += 1;
        if (boundaryWriteAttempts === 2) return { success: true, updated: 0 };
      }
      return originalUpdate(query, update);
    };

    await expect(backend.resizeSharedTaskBoundary(
      base44,
      user,
      fixture.body,
      context("shared-boundary-bootstrap-resize"),
    )).rejects.toMatchObject({ status: 409 });

    const bootstrapped = await backend.bootstrapRange(base44, user, {
      period_start: demand.service_date,
      period_end: demand.service_date,
    }, context("fresh-session-bootstrap-repair"));

    expect(bootstrapped.repaired_shared_boundary_occurrence_ids).toEqual([demand.id]);
    expect(bootstrapped.pending_shared_boundary_repairs).toEqual([]);
    expect(backend.occurrenceCoverage(
      demand,
      entities.PlanningShiftTaskSegment.records,
      entities.PlanningShift.records,
    )).toMatchObject({ coverage_status: "full", allocated_minutes: 480, remaining_minutes: 0 });
    expect((await entities.PlanningTaskOccurrence.get(demand.id)).metadata?.shared_boundary_mutation)
      .toMatchObject({ phase: "completed", effective_view: "target" });
  });

  it("weigert herstel als hetzelfde assignmentslot intussen aan een andere medewerker hoort", async () => {
    const demand = occurrence("occurrence-reception-shared-assignment-fence", "object-1", "10:00", "18:00", 480);
    const { base44, entities } = setup([demand]);
    const fixture = await createAdjacentAssignedTaskShifts({
      demand,
      base44,
      entities,
      prefix: "shared-boundary-assignment-fence",
    });
    const originalUpdate = entities.PlanningShiftTaskSegment.updateMany
      .bind(entities.PlanningShiftTaskSegment);
    let boundaryWriteAttempts = 0;
    entities.PlanningShiftTaskSegment.updateMany = async (query, update) => {
      if (update.$set?.metadata?.shared_boundary_mutation?.idempotency_key === "shared-boundary-assignment-fence-resize") {
        boundaryWriteAttempts += 1;
        if (boundaryWriteAttempts === 2) return { success: true, updated: 0 };
      }
      return originalUpdate(query, update);
    };
    await expect(backend.resizeSharedTaskBoundary(
      base44,
      user,
      fixture.body,
      context("shared-boundary-assignment-fence-resize"),
    )).rejects.toMatchObject({ status: 409 });
    const reusedSlot = entities.PlanningAssignment.records.find(item => item.id === fixture.late.assignment.id);
    reusedSlot.personnel_id = "replacement-personnel";
    reusedSlot.revision += 1;

    await expect(backend.repairSharedTaskBoundary(
      base44,
      user,
      { task_occurrence_id: demand.id },
      context("fresh-session-assignment-fence-repair"),
    )).rejects.toMatchObject({
      status: 409,
      details: { code: "BOUNDARY_RECOVERY_ASSIGNMENTS_CHANGED" },
    });
  });

  it("weigert herstel als de duurzame doelprojectie niet meer bij de opgeslagen hash past", async () => {
    const demand = occurrence("occurrence-reception-shared-hash-fence", "object-1", "10:00", "18:00", 480);
    const { base44, entities } = setup([demand]);
    const fixture = await createAdjacentAssignedTaskShifts({
      demand,
      base44,
      entities,
      prefix: "shared-boundary-hash-fence",
    });
    const originalUpdate = entities.PlanningShiftTaskSegment.updateMany
      .bind(entities.PlanningShiftTaskSegment);
    let boundaryWriteAttempts = 0;
    entities.PlanningShiftTaskSegment.updateMany = async (query, update) => {
      if (update.$set?.metadata?.shared_boundary_mutation?.idempotency_key === "shared-boundary-hash-fence-resize") {
        boundaryWriteAttempts += 1;
        if (boundaryWriteAttempts === 2) return { success: true, updated: 0 };
      }
      return originalUpdate(query, update);
    };
    await expect(backend.resizeSharedTaskBoundary(
      base44,
      user,
      fixture.body,
      context("shared-boundary-hash-fence-resize"),
    )).rejects.toMatchObject({ status: 409 });
    const storedOccurrence = entities.PlanningTaskOccurrence.records.find(item => item.id === demand.id);
    storedOccurrence.metadata.shared_boundary_mutation.target_state.segments[0].end_time = "16:00";

    await expect(backend.repairSharedTaskBoundary(
      base44,
      user,
      { task_occurrence_id: demand.id },
      context("fresh-session-hash-fence-repair"),
    )).rejects.toMatchObject({
      status: 409,
      details: { code: "BOUNDARY_RECOVERY_TARGET_HASH_MISMATCH" },
    });
  });

  it("herstelt een auditfout met een nieuwe browserkey en bewaart de oorspronkelijke auditidentiteit", async () => {
    const demand = occurrence("occurrence-reception-shared-new-key-audit", "object-1", "10:00", "18:00", 480);
    const { base44, entities } = setup([demand]);
    const fixture = await createAdjacentAssignedTaskShifts({
      demand,
      base44,
      entities,
      prefix: "shared-boundary-new-key-audit",
    });
    const originalAuditCreate = entities.PlanningAuditEvent.create.bind(entities.PlanningAuditEvent);
    let failOnce = true;
    entities.PlanningAuditEvent.create = async data => {
      if (failOnce && data.action === "resize_shared_task_boundary") {
        failOnce = false;
        throw new Error("audit tijdelijk niet beschikbaar");
      }
      return originalAuditCreate(data);
    };

    await expect(backend.resizeSharedTaskBoundary(
      base44,
      user,
      fixture.body,
      context("shared-boundary-new-key-audit-resize"),
    )).rejects.toThrow("audit tijdelijk niet beschikbaar");
    const repaired = await backend.repairSharedTaskBoundary(
      base44,
      user,
      { task_occurrence_id: demand.id },
      context("fresh-tab-audit-repair"),
    );

    expect(repaired).toMatchObject({ ok: true, repaired: true });
    expect(entities.PlanningAuditEvent.records.filter(item => item.action === "resize_shared_task_boundary"))
      .toEqual([expect.objectContaining({
        idempotency_key: "shared-boundary-new-key-audit-resize",
        metadata: expect.objectContaining({ recovered_by_user_id: user.id }),
      })]);
  });

  it("dedupliceert audit-herstel wanneer opslag slaagt maar het auditantwoord wegvalt", async () => {
    const demand = occurrence("occurrence-reception-shared-audit-transport", "object-1", "10:00", "18:00", 480);
    const { base44, entities } = setup([demand]);
    const fixture = await createAdjacentAssignedTaskShifts({
      demand,
      base44,
      entities,
      prefix: "shared-boundary-audit-transport",
    });
    const originalAuditCreate = entities.PlanningAuditEvent.create.bind(entities.PlanningAuditEvent);
    let failOnce = true;
    entities.PlanningAuditEvent.create = async data => {
      const created = await originalAuditCreate(data);
      if (failOnce && data.action === "resize_shared_task_boundary") {
        failOnce = false;
        throw new Error("auditantwoord verloren");
      }
      return created;
    };

    await expect(backend.resizeSharedTaskBoundary(
      base44,
      user,
      fixture.body,
      context("shared-boundary-audit-transport-resize"),
    )).rejects.toThrow("auditantwoord verloren");
    await backend.repairSharedTaskBoundary(
      base44,
      user,
      { task_occurrence_id: demand.id },
      context("fresh-process-audit-transport-repair"),
    );

    expect(entities.PlanningAuditEvent.records.filter(item => item.action === "resize_shared_task_boundary"))
      .toHaveLength(1);
    expect((await entities.PlanningTaskOccurrence.get(demand.id)).metadata?.shared_boundary_mutation)
      .toMatchObject({ phase: "completed", audit_event_id: expect.any(String) });
  });

  it("weigert een te korte, stale of geleasede gedeelde grens zonder businesswijzigingen", async () => {
    const demand = occurrence("occurrence-reception-shared-rejected", "object-1", "10:00", "18:00", 480);
    const { base44, entities } = setup([demand]);
    const fixture = await createAdjacentAssignedTaskShifts({
      demand,
      base44,
      entities,
      prefix: "shared-boundary-rejected",
    });
    const baseline = () => structuredClone({
      shifts: entities.PlanningShift.records,
      segments: entities.PlanningShiftTaskSegment.records,
      assignments: entities.PlanningAssignment.records,
      occurrences: entities.PlanningTaskOccurrence.records,
      audits: entities.PlanningAuditEvent.records,
    });

    const beforeTooShort = baseline();
    await expect(backend.resizeSharedTaskBoundary(base44, user, {
      ...fixture.body,
      boundary_time: "17:58",
    }, context("shared-boundary-too-short"))).rejects.toMatchObject({ status: 409 });
    expect(baseline()).toEqual(beforeTooShort);

    const beforeStale = baseline();
    await expect(backend.resizeSharedTaskBoundary(base44, user, {
      ...fixture.body,
      expected_shift_revisions: {
        ...fixture.body.expected_shift_revisions,
        [fixture.early.shift.id]: fixture.early.shift.revision + 1,
      },
    }, context("shared-boundary-stale"))).rejects.toMatchObject({ status: 409 });
    expect(baseline()).toEqual(beforeStale);

    const occurrenceCoordinator = entities.PlanningMutationCoordinator.records.find(item => (
      item.resource_type === "task_occurrence" && item.resource_id === demand.id
    ));
    occurrenceCoordinator.lease = {
      token: "foreign-shared-boundary-token",
      status: "pending",
      idempotency_key: "foreign-shared-boundary",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    };
    const beforeLease = baseline();
    await expect(backend.resizeSharedTaskBoundary(
      base44,
      user,
      fixture.body,
      context("shared-boundary-foreign-lease"),
    )).rejects.toMatchObject({ status: 409 });
    expect(baseline()).toEqual(beforeLease);
  });

  it("fencet bij full replacement zowel verwijderde als blijvende taakuitvoeringen", async () => {
    const reception = occurrence("occurrence-reception-union", "object-1", "08:00", "12:00", 240);
    const round = occurrence("occurrence-round-union", "object-2", "12:00", "13:00", 60);
    const { base44, entities } = setup([reception, round]);
    const composed = await backend.composeShift(base44, user, {
      segments: [
        { task_occurrence_id: reception.id, start_time: "08:00", end_time: "12:00" },
        { task_occurrence_id: round.id, start_time: "12:00", end_time: "13:00" },
      ],
      expected_occurrence_revisions: { [reception.id]: 1, [round.id]: 1 },
    }, context("union-compose"));
    const currentReception = await entities.PlanningTaskOccurrence.get(reception.id);
    const currentRound = await entities.PlanningTaskOccurrence.get(round.id);
    const updateBody = {
      action: "update_shift_composition",
      shift_id: composed.shift.id,
      expected_shift_revision: composed.shift.revision,
      segments: [{ task_occurrence_id: reception.id, start_time: "08:00", end_time: "12:00" }],
    };

    await expect(backend.composeShift(base44, user, {
      ...updateBody,
      expected_occurrence_revisions: { [reception.id]: currentReception.revision },
    }, context("union-missing-removed-revision"))).rejects.toMatchObject({ status: 400 });

    const roundCoordinator = entities.PlanningMutationCoordinator.records.find(item => (
      item.resource_type === "task_occurrence" && item.resource_id === round.id
    ));
    roundCoordinator.lease = {
      token: "foreign-union-lease",
      status: "pending",
      idempotency_key: "foreign-union-action",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    };
    const beforeBlockedUpdate = structuredClone({
      shifts: entities.PlanningShift.records,
      segments: entities.PlanningShiftTaskSegment.records,
      occurrences: entities.PlanningTaskOccurrence.records,
    });
    await expect(backend.composeShift(base44, user, {
      ...updateBody,
      expected_occurrence_revisions: {
        [reception.id]: currentReception.revision,
        [round.id]: currentRound.revision,
      },
    }, context("union-foreign-fence"))).rejects.toMatchObject({ status: 409 });
    expect({
      shifts: entities.PlanningShift.records,
      segments: entities.PlanningShiftTaskSegment.records,
      occurrences: entities.PlanningTaskOccurrence.records,
    }).toEqual(beforeBlockedUpdate);

    roundCoordinator.lease = null;
    const updated = await backend.composeShift(base44, user, {
      ...updateBody,
      expected_occurrence_revisions: {
        [reception.id]: currentReception.revision,
        [round.id]: currentRound.revision,
      },
    }, context("union-remove-round"));
    expect(updated.shift.task_occurrence_ids).toEqual([reception.id]);
    expect(updated.task_occurrences.map(item => item.id).sort()).toEqual([reception.id, round.id].sort());
    expect((await entities.PlanningTaskOccurrence.get(round.id)).revision).toBeGreaterThan(currentRound.revision);
    expect(entities.PlanningShiftTaskSegment.records.filter(item => (
      item.status !== "removed" && item.task_occurrence_id === round.id
    ))).toHaveLength(0);
    expect(entities.PlanningMutationCoordinator.records.find(item => item.id === roundCoordinator.id)
      ?.metadata?.last_released_idempotency_key).toBe("union-remove-round");
  });

  it("reserveert bij overnight resize de oude en nieuwe personeelsdagen en respecteert een foreign daglease", async () => {
    const demand = {
      ...occurrence("occurrence-reception-overnight-resize", "object-1", "22:00", "06:00", 480),
      end_date: "2026-08-18",
    };
    const { base44, entities } = setup([demand]);
    entities.Personnel.records.push({ id: "personnel-overnight-resize", name: "Nacht Beveiliger", status: "active" });
    const composed = await backend.composeAndAssign(base44, user, {
      personnel_id: "personnel-overnight-resize",
      segments: [{
        task_occurrence_id: demand.id,
        start_date: "2026-08-17",
        end_date: "2026-08-18",
        start_time: "22:00",
        end_time: "02:00",
      }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    }, context("overnight-resize-compose"));
    const day17 = entities.PlanningMutationCoordinator.records.find(item => (
      item.resource_type === "personnel_day" && item.resource_id === "personnel-overnight-resize:2026-08-17"
    ));
    const day18 = entities.PlanningMutationCoordinator.records.find(item => (
      item.resource_type === "personnel_day" && item.resource_id === "personnel-overnight-resize:2026-08-18"
    ));
    day17.lease = {
      token: "foreign-personnel-day",
      status: "pending",
      idempotency_key: "foreign-personnel-action",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    };
    const currentOccurrence = await entities.PlanningTaskOccurrence.get(demand.id);
    const update = {
      action: "update_shift_composition",
      shift_id: composed.shift.id,
      expected_shift_revision: composed.shift.revision,
      expected_occurrence_revisions: { [demand.id]: currentOccurrence.revision },
      segments: [{
        task_occurrence_id: demand.id,
        start_date: "2026-08-18",
        end_date: "2026-08-18",
        start_time: "00:00",
        end_time: "06:00",
      }],
    };
    await expect(backend.composeShift(base44, user, update, context("overnight-resize-blocked")))
      .rejects.toMatchObject({ status: 409 });

    day17.lease = null;
    const resized = await backend.composeShift(base44, user, update, context("overnight-resize-complete"));
    expect(resized.shift).toMatchObject({
      service_date: "2026-08-18",
      end_date: null,
      start_time: "00:00",
      end_time: "06:00",
    });
    expect(entities.PlanningMutationCoordinator.records.find(item => item.id === day17.id)
      ?.metadata?.last_released_idempotency_key).toBe("overnight-resize-complete");
    expect(entities.PlanningMutationCoordinator.records.find(item => item.id === day18.id)
      ?.metadata?.last_released_idempotency_key).toBe("overnight-resize-complete");
  });

  it("weigert een resize als de assignmentset tussen preflight en lock verandert", async () => {
    const demand = occurrence("occurrence-reception-assignment-race", "object-1", "06:00", "20:00", 840);
    const { base44, entities } = setup([demand]);
    entities.Personnel.records.push(
      { id: "personnel-assigned", name: "Bestaande Beveiliger", status: "active" },
      { id: "personnel-injected", name: "Gelijktijdige Beveiliger", status: "active" },
    );
    const composed = await backend.composeAndAssign(base44, user, {
      personnel_id: "personnel-assigned",
      required_count: 2,
      segments: [{ task_occurrence_id: demand.id, start_time: "06:00", end_time: "18:00" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    }, context("assignment-race-compose"));
    const originalCoordinatorUpdate = entities.PlanningMutationCoordinator.updateMany.bind(entities.PlanningMutationCoordinator);
    let injected = false;
    entities.PlanningMutationCoordinator.updateMany = async (query, patch) => {
      const result = await originalCoordinatorUpdate(query, patch);
      const coordinator = entities.PlanningMutationCoordinator.records.find(item => String(item.id) === String(query.id));
      if (
        !injected
        && coordinator?.resource_type === "shift_composition"
        && patch.$set?.lease?.idempotency_key === "assignment-race-resize"
      ) {
        injected = true;
        entities.PlanningAssignment.records.push({
          id: "assignment-concurrent",
          shift_id: composed.shift.id,
          slot_index: 1,
          personnel_id: "personnel-injected",
          personnel_name_snapshot: "Gelijktijdige Beveiliger",
          status: "draft",
          warning_codes: [],
          warning_snapshot: [],
          has_critical_warnings: false,
          revision: 1,
          published_revision: 0,
        });
      }
      return result;
    };
    const currentOccurrence = await entities.PlanningTaskOccurrence.get(demand.id);
    const beforeSegments = structuredClone(entities.PlanningShiftTaskSegment.records);
    const beforeShift = structuredClone(entities.PlanningShift.records);

    await expect(backend.composeShift(base44, user, {
      action: "update_shift_composition",
      shift_id: composed.shift.id,
      expected_shift_revision: composed.shift.revision,
      expected_occurrence_revisions: { [demand.id]: currentOccurrence.revision },
      segments: [{ task_occurrence_id: demand.id, start_time: "06:00", end_time: "12:00" }],
    }, context("assignment-race-resize"))).rejects.toMatchObject({ status: 409 });
    expect(injected).toBe(true);
    expect(entities.PlanningShift.records).toEqual(beforeShift);
    expect(entities.PlanningShiftTaskSegment.records).toEqual(beforeSegments);
  });

  it("herstelt een update_shift_composition met dezelfde sleutel zonder dubbel actief segment", async () => {
    const demand = occurrence("occurrence-reception-resize-retry", "object-1", "06:00", "20:00", 840);
    const { base44, entities } = setup([demand]);
    const composed = await backend.composeShift(base44, user, {
      segments: [{ task_occurrence_id: demand.id, start_time: "06:00", end_time: "20:00" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    }, context("resize-retry-compose"));
    const currentOccurrence = await entities.PlanningTaskOccurrence.get(demand.id);
    const body = {
      action: "update_shift_composition",
      shift_id: composed.shift.id,
      expected_shift_revision: composed.shift.revision,
      expected_occurrence_revisions: { [demand.id]: currentOccurrence.revision },
      segments: [{ task_occurrence_id: demand.id, start_time: "06:00", end_time: "12:00" }],
    };
    const originalAuditCreate = entities.PlanningAuditEvent.create.bind(entities.PlanningAuditEvent);
    let failed = false;
    entities.PlanningAuditEvent.create = async data => {
      if (!failed && data.action === "update_shift_composition") {
        failed = true;
        throw new Error("tijdelijke resize-auditstoring");
      }
      return originalAuditCreate(data);
    };

    await expect(backend.composeShift(base44, user, body, context("resize-retry")))
      .rejects.toThrow("tijdelijke resize-auditstoring");
    expect(backend.activeTaskSegments(
      entities.PlanningShiftTaskSegment.records,
      entities.PlanningShift.records,
    )).toEqual([]);

    const recovered = await backend.composeShift(base44, user, body, context("resize-retry"));
    expect(recovered.shift).toMatchObject({ status: "draft", start_time: "06:00", end_time: "12:00" });
    expect(entities.PlanningShiftTaskSegment.records.filter(item => item.status !== "removed")).toHaveLength(1);
    expect(entities.PlanningAuditEvent.records.filter(item => item.action === "update_shift_composition")).toHaveLength(1);
  });

  it("laat alleen de oorspronkelijke actor een pending update_shift_composition herstellen", async () => {
    const demand = occurrence("occurrence-reception-actor-recovery", "object-1", "06:00", "20:00", 840);
    const { base44, entities } = setup([demand]);
    const composed = await backend.composeShift(base44, user, {
      segments: [{ task_occurrence_id: demand.id, start_time: "06:00", end_time: "20:00" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    }, context("actor-recovery-compose"));
    const currentOccurrence = await entities.PlanningTaskOccurrence.get(demand.id);
    const body = {
      action: "update_shift_composition",
      shift_id: composed.shift.id,
      expected_shift_revision: composed.shift.revision,
      expected_occurrence_revisions: { [demand.id]: currentOccurrence.revision },
      segments: [{ task_occurrence_id: demand.id, start_time: "06:00", end_time: "12:00" }],
    };
    const originalAuditCreate = entities.PlanningAuditEvent.create.bind(entities.PlanningAuditEvent);
    let failed = false;
    entities.PlanningAuditEvent.create = async data => {
      if (!failed && data.action === "update_shift_composition") {
        failed = true;
        throw new Error("tijdelijke actor-recovery-auditstoring");
      }
      return originalAuditCreate(data);
    };

    await expect(backend.composeShift(base44, user, body, context("actor-recovery-resize")))
      .rejects.toThrow("tijdelijke actor-recovery-auditstoring");
    const pendingShift = await entities.PlanningShift.get(composed.shift.id);
    expect(pendingShift.metadata?.planning_composition).toMatchObject({
      phase: "pending",
      actor_user_id: user.id,
    });

    await expect(backend.composeShift(
      base44,
      { ...user, id: "admin-2", name: "Andere planner" },
      body,
      context("actor-recovery-resize"),
    )).rejects.toMatchObject({ status: 409 });
    expect(entities.PlanningAuditEvent.records.filter(item => item.action === "update_shift_composition"))
      .toHaveLength(0);

    const recovered = await backend.composeShift(base44, user, body, context("actor-recovery-resize"));
    expect(recovered.shift).toMatchObject({ status: "draft", start_time: "06:00", end_time: "12:00" });
    expect(entities.PlanningAuditEvent.records.filter(item => item.action === "update_shift_composition"))
      .toEqual([expect.objectContaining({ actor_user_id: user.id })]);
  });

  it("weigert required_count onder bestaande actieve slots te verlagen", async () => {
    const demand = occurrence("occurrence-reception-required-count", "object-1", "06:00", "20:00", 840);
    const { base44, entities } = setup([demand]);
    entities.Personnel.records.push(
      { id: "personnel-slot-zero", name: "Eerste beveiliger", status: "active" },
      { id: "personnel-slot-one", name: "Tweede beveiliger", status: "active" },
    );
    const composed = await backend.composeAndAssign(base44, user, {
      personnel_id: "personnel-slot-zero",
      required_count: 2,
      slot_index: 0,
      segments: [{ task_occurrence_id: demand.id, start_time: "06:00", end_time: "18:00" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    }, context("required-count-compose"));
    const assigned = await backend.assignPersonnel(base44, user, {
      shift_id: composed.shift.id,
      personnel_id: "personnel-slot-one",
      slot_index: 1,
      expected_shift_revision: composed.shift.revision,
    }, context("required-count-second-assignment"));
    const currentOccurrence = await entities.PlanningTaskOccurrence.get(demand.id);
    const businessStateBefore = structuredClone({
      shifts: entities.PlanningShift.records,
      segments: entities.PlanningShiftTaskSegment.records,
      assignments: entities.PlanningAssignment.records,
      occurrences: entities.PlanningTaskOccurrence.records,
    });

    await expect(backend.composeShift(base44, user, {
      action: "update_shift_composition",
      shift_id: composed.shift.id,
      expected_shift_revision: assigned.shift.revision,
      expected_occurrence_revisions: { [demand.id]: currentOccurrence.revision },
      required_count: 1,
      segments: [{ task_occurrence_id: demand.id, start_time: "06:00", end_time: "12:00" }],
    }, context("required-count-invalid-resize"))).rejects.toMatchObject({ status: 409 });
    expect({
      shifts: entities.PlanningShift.records,
      segments: entities.PlanningShiftTaskSegment.records,
      assignments: entities.PlanningAssignment.records,
      occurrences: entities.PlanningTaskOccurrence.records,
    }).toEqual(businessStateBefore);
    expect(entities.PlanningAssignment.records.filter(item => item.status !== "removed").map(item => item.slot_index).sort())
      .toEqual([0, 1]);
  });

  it("ruimt een gedeeltelijke occurrence-reservering op na een revision-race", async () => {
    const firstDemand = occurrence("occurrence-a-partial-reservation", "object-1", "08:00", "12:00", 240);
    const secondDemand = occurrence("occurrence-b-partial-reservation", "object-2", "12:00", "16:00", 240);
    const { base44, entities } = setup([firstDemand, secondDemand]);
    const composed = await backend.composeShift(base44, user, {
      segments: [
        { task_occurrence_id: firstDemand.id, start_time: "08:00", end_time: "12:00" },
        { task_occurrence_id: secondDemand.id, start_time: "12:00", end_time: "16:00" },
      ],
      expected_occurrence_revisions: { [firstDemand.id]: 1, [secondDemand.id]: 1 },
    }, context("partial-reservation-compose"));
    const firstBefore = await entities.PlanningTaskOccurrence.get(firstDemand.id);
    const secondBefore = await entities.PlanningTaskOccurrence.get(secondDemand.id);
    const staleBody = {
      action: "update_shift_composition",
      shift_id: composed.shift.id,
      expected_shift_revision: composed.shift.revision,
      expected_occurrence_revisions: {
        [firstDemand.id]: firstBefore.revision,
        [secondDemand.id]: secondBefore.revision,
      },
      segments: [
        { task_occurrence_id: firstDemand.id, start_time: "08:00", end_time: "11:00" },
        { task_occurrence_id: secondDemand.id, start_time: "12:00", end_time: "16:00" },
      ],
    };
    const originalOccurrenceUpdate = entities.PlanningTaskOccurrence.updateMany.bind(entities.PlanningTaskOccurrence);
    let injected = false;
    entities.PlanningTaskOccurrence.updateMany = async (query, update) => {
      const result = await originalOccurrenceUpdate(query, update);
      if (
        !injected
        && query.id === firstDemand.id
        && update.$set?.metadata?.planning_composition_reservation?.idempotency_key === "partial-reservation-resize"
      ) {
        injected = true;
        const concurrentOccurrence = entities.PlanningTaskOccurrence.records.find(item => item.id === secondDemand.id);
        concurrentOccurrence.revision += 1;
        concurrentOccurrence.metadata = {
          ...(concurrentOccurrence.metadata || {}),
          changed_by_concurrent_action: true,
        };
      }
      return result;
    };

    await expect(backend.composeShift(base44, user, staleBody, context("partial-reservation-resize")))
      .rejects.toMatchObject({ status: 409 });
    expect(injected).toBe(true);
    const firstAfterFailure = await entities.PlanningTaskOccurrence.get(firstDemand.id);
    const secondAfterFailure = await entities.PlanningTaskOccurrence.get(secondDemand.id);
    expect(firstAfterFailure.metadata?.planning_composition_reservation).toBeUndefined();
    expect(secondAfterFailure.metadata?.planning_composition_reservation).toBeUndefined();
    expect(firstAfterFailure.metadata).toMatchObject({
      last_composition_recovery_idempotency_key: "partial-reservation-resize",
      last_composition_recovery_actor_user_id: user.id,
      last_composition_recovery_status: "reservation_released",
    });

    await expect(backend.composeShift(base44, user, staleBody, context("partial-reservation-resize")))
      .rejects.toMatchObject({ status: 409 });
    const recovered = await backend.composeShift(base44, user, {
      ...staleBody,
      expected_occurrence_revisions: {
        [firstDemand.id]: firstAfterFailure.revision,
        [secondDemand.id]: secondAfterFailure.revision,
      },
    }, context("partial-reservation-reloaded-resize"));
    expect(recovered.shift).toMatchObject({ status: "draft", start_time: "08:00", end_time: "16:00" });
    expect((await entities.PlanningTaskOccurrence.get(firstDemand.id)).metadata?.planning_composition_reservation)
      .toBeUndefined();
    expect((await entities.PlanningTaskOccurrence.get(secondDemand.id)).metadata?.planning_composition_reservation)
      .toBeUndefined();
  });

  it("behoudt occurrence-fences na een late update-auditfout tot same-key recovery", async () => {
    const demand = occurrence("occurrence-late-audit-fence", "object-1", "06:00", "20:00", 840);
    const { base44, entities } = setup([demand]);
    const composed = await backend.composeShift(base44, user, {
      segments: [{ task_occurrence_id: demand.id, start_time: "06:00", end_time: "20:00" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    }, context("late-audit-fence-compose"));
    const currentOccurrence = await entities.PlanningTaskOccurrence.get(demand.id);
    const body = {
      action: "update_shift_composition",
      shift_id: composed.shift.id,
      expected_shift_revision: composed.shift.revision,
      expected_occurrence_revisions: { [demand.id]: currentOccurrence.revision },
      segments: [{ task_occurrence_id: demand.id, start_time: "06:00", end_time: "12:00" }],
    };
    const originalAuditCreate = entities.PlanningAuditEvent.create.bind(entities.PlanningAuditEvent);
    let failed = false;
    entities.PlanningAuditEvent.create = async data => {
      if (!failed && data.action === "update_shift_composition") {
        failed = true;
        throw new Error("tijdelijke late auditstoring");
      }
      return originalAuditCreate(data);
    };

    await expect(backend.composeShift(base44, user, body, context("late-audit-fence-resize")))
      .rejects.toThrow("tijdelijke late auditstoring");
    expect((await entities.PlanningTaskOccurrence.get(demand.id)).metadata?.planning_composition_reservation)
      .toMatchObject({
        idempotency_key: "late-audit-fence-resize",
        actor_user_id: user.id,
        status: "pending",
      });

    await expect(backend.composeShift(base44, user, {
      segments: [{ task_occurrence_id: demand.id, start_time: "12:00", end_time: "20:00" }],
      expected_occurrence_revisions: {
        [demand.id]: (await entities.PlanningTaskOccurrence.get(demand.id)).revision,
      },
    }, context("late-audit-fence-foreign-compose"))).rejects.toMatchObject({ status: 409 });
    expect(entities.PlanningShift.records).toHaveLength(1);

    const recovered = await backend.composeShift(base44, user, body, context("late-audit-fence-resize"));
    expect(recovered.shift).toMatchObject({ status: "draft", start_time: "06:00", end_time: "12:00" });
    expect((await entities.PlanningTaskOccurrence.get(demand.id)).metadata?.planning_composition_reservation)
      .toBeUndefined();
    expect(entities.PlanningShift.records).toHaveLength(1);
    expect(entities.PlanningAuditEvent.records.filter(item => item.action === "update_shift_composition"))
      .toHaveLength(1);
  });

  it("verkleint een bezette taakdienst, materialiseert een open dienst en replayt finalized revisies", async () => {
    const demand = occurrence("occurrence-partition-resize", "object-1", "06:30", "18:00", 690);
    const { base44, entities } = setup([demand]);
    entities.Personnel.records.push({ id: "personnel-partition-resize", name: "Dagbeveiliger", status: "active" });
    const composed = await backend.composeAndAssign(base44, user, {
      personnel_id: "personnel-partition-resize",
      segments: [{ task_occurrence_id: demand.id, start_time: "06:30", end_time: "18:00" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    }, context("partition-resize-compose"));
    const currentOccurrence = await entities.PlanningTaskOccurrence.get(demand.id);
    let validationCalls = 0;
    base44.asServiceRole.functions.invoke = async () => {
      validationCalls += 1;
      return {};
    };
    const calls = instrumentBackendCalls(base44, entities);
    const payload = {
      shift_id: composed.shift.id,
      segment_id: composed.segments[0].id,
      start_date: "2026-08-17",
      start_time: "06:30",
      end_date: "2026-08-17",
      end_time: "15:30",
      expected_shift_revision: composed.shift.revision,
      expected_segment_revision: composed.segments[0].revision,
      expected_occurrence_revision: currentOccurrence.revision,
      expected_assignment_revisions: { [composed.assignment.id]: composed.assignment.revision },
    };

    const result = await backend.resizeTaskShiftPreservingCoverage(
      base44,
      user,
      payload,
      context("partition-resize-end"),
    );

    expect(result.shift).toMatchObject({ start_time: "06:30", end_time: "15:30", status: "draft" });
    expect(result.shifts).toHaveLength(2);
    expect(result.segments).toEqual(expect.arrayContaining([
      expect.objectContaining({ start_time: "06:30", end_time: "15:30", status: "draft" }),
      expect.objectContaining({ start_time: "15:30", end_time: "18:00", status: "draft" }),
    ]));
    const companionShiftId = result.companion_shift_ids[0];
    expect(entities.PlanningAssignment.records.filter(
      item => item.shift_id === companionShiftId && item.status !== "removed",
    )).toEqual([]);
    expect(backend.occurrenceCoverage(
      demand,
      entities.PlanningShiftTaskSegment.records,
      entities.PlanningShift.records,
    )).toMatchObject({ coverage_status: "full", allocated_minutes: 690, remaining_minutes: 0 });
    expect(validationCalls).toBe(1);
    expect(calls.count("PlanningMutationCoordinator.get")).toBe(0);
    expect(calls.count("PlanningMutationCoordinator.updateMany")).toBe(14);
    expect(calls.total()).toBe(56);

    const shiftCount = entities.PlanningShift.records.length;
    const segmentCount = entities.PlanningShiftTaskSegment.records.length;
    const auditCount = entities.PlanningAuditEvent.records.length;
    const replay = await backend.resizeTaskShiftPreservingCoverage(
      base44,
      user,
      payload,
      context("partition-resize-end"),
    );
    expect(replay.idempotent).toBe(true);
    expect(replay.companion_shift_ids).toEqual(result.companion_shift_ids);
    expect(replay.shift).toEqual(await entities.PlanningShift.get(replay.shift.id));
    expect(replay.shifts).toEqual(await Promise.all(
      replay.shifts.map(item => entities.PlanningShift.get(item.id)),
    ));
    expect(replay.segment).toEqual(await entities.PlanningShiftTaskSegment.get(replay.segment.id));
    expect(replay.segments).toEqual(await Promise.all(
      replay.segments.map(item => entities.PlanningShiftTaskSegment.get(item.id)),
    ));
    expect(replay.assignments).toEqual(await Promise.all(
      replay.assignments.map(item => entities.PlanningAssignment.get(item.id)),
    ));
    expect(replay.task_occurrences).toEqual(await Promise.all(
      replay.task_occurrences.map(item => entities.PlanningTaskOccurrence.get(item.id)),
    ));
    expect(replay.shifts.every(item => (
      item.metadata?.task_partition_mutation?.phase === "completed"
      && item.metadata?.task_partition_mutation?.audit_event_id === replay.audit_event_id
    ))).toBe(true);
    expect(entities.PlanningShift.records).toHaveLength(shiftCount);
    expect(entities.PlanningShiftTaskSegment.records).toHaveLength(segmentCount);
    expect(entities.PlanningAuditEvent.records).toHaveLength(auditCount);
  });

  it("herleest een same-key replay onder de leases als een andere resize de preflight inhaalt", async () => {
    const demand = occurrence("occurrence-partition-late-replay", "object-1", "06:30", "18:00", 690);
    const { base44, entities } = setup([demand]);
    const personnelId = "personnel-partition-late-replay";
    entities.Personnel.records.push({ id: personnelId, name: "Replay beveiliger", status: "active" });
    const composed = await backend.composeAndAssign(base44, user, {
      personnel_id: personnelId,
      segments: [{ task_occurrence_id: demand.id, start_time: "06:30", end_time: "18:00" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    }, context("partition-late-replay-compose"));
    const currentOccurrence = await entities.PlanningTaskOccurrence.get(demand.id);
    const payload = {
      shift_id: composed.shift.id,
      segment_id: composed.segments[0].id,
      start_date: "2026-08-17",
      start_time: "06:30",
      end_date: "2026-08-17",
      end_time: "15:30",
      expected_shift_revision: composed.shift.revision,
      expected_segment_revision: composed.segments[0].revision,
      expected_occurrence_revision: currentOccurrence.revision,
      expected_assignment_revisions: { [composed.assignment.id]: composed.assignment.revision },
    };
    const resizeContext = context("partition-late-replay-resize");
    const originalCoordinatorFilter = entities.PlanningMutationCoordinator.filter.bind(
      entities.PlanningMutationCoordinator,
    );
    let releaseDelayedRequest;
    let markDelayedRequestAtLease;
    const delayedRequestAtLease = new Promise(resolve => { markDelayedRequestAtLease = resolve; });
    const delayedRequestReleased = new Promise(resolve => { releaseDelayedRequest = resolve; });
    let delayFirstCoordinatorRead = true;
    let resizeAuditCountAtPause = -1;
    entities.PlanningMutationCoordinator.filter = async (...args) => {
      if (delayFirstCoordinatorRead) {
        delayFirstCoordinatorRead = false;
        resizeAuditCountAtPause = entities.PlanningAuditEvent.records.filter(item => (
          item.action === "resize_task_shift_preserving_coverage"
          && item.idempotency_key === resizeContext.idempotencyKey
        )).length;
        markDelayedRequestAtLease();
        await delayedRequestReleased;
      }
      return originalCoordinatorFilter(...args);
    };

    const delayedRequest = backend.resizeTaskShiftPreservingCoverage(
      base44,
      user,
      payload,
      resizeContext,
    );
    await delayedRequestAtLease;
    expect(resizeAuditCountAtPause).toBe(0);

    let winningResult;
    try {
      winningResult = await backend.resizeTaskShiftPreservingCoverage(
        base44,
        user,
        payload,
        resizeContext,
      );
      expect(entities.PlanningAuditEvent.records.filter(item => (
        item.action === "resize_task_shift_preserving_coverage"
        && item.idempotency_key === resizeContext.idempotencyKey
      ))).toHaveLength(1);
    } finally {
      releaseDelayedRequest();
    }
    const replayedResult = await delayedRequest;
    const resizeAudits = entities.PlanningAuditEvent.records.filter(item => (
      item.action === "resize_task_shift_preserving_coverage"
      && item.idempotency_key === resizeContext.idempotencyKey
    ));
    expect(replayedResult).toMatchObject({
      idempotent: true,
      audit_event_id: winningResult.audit_event_id,
      companion_shift_ids: winningResult.companion_shift_ids,
    });
    expect(resizeAudits).toHaveLength(1);
    const finalizedParticipantShifts = entities.PlanningShift.records.filter(item => (
      item.metadata?.task_partition_mutation?.idempotency_key === resizeContext.idempotencyKey
    ));
    expect(finalizedParticipantShifts).toHaveLength(2);
    expect(finalizedParticipantShifts.every(item => (
      item.metadata.task_partition_mutation.phase === "completed"
      && item.metadata.task_partition_mutation.audit_event_id === winningResult.audit_event_id
    ))).toBe(true);
  });

  it("herstelt een echte 429 tijdens resize met exact dezelfde sleutel zonder dubbele companion", async () => {
    const demand = occurrence("occurrence-partition-rate-limit", "object-1", "06:30", "18:00", 690);
    const { base44, entities } = setup([demand]);
    const personnelId = "personnel-partition-rate-limit";
    entities.Personnel.records.push({ id: personnelId, name: "Rate-limit beveiliger", status: "active" });
    const composed = await backend.composeAndAssign(base44, user, {
      personnel_id: personnelId,
      segments: [{ task_occurrence_id: demand.id, start_time: "06:30", end_time: "18:00" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    }, context("partition-rate-limit-compose"));
    const currentOccurrence = await entities.PlanningTaskOccurrence.get(demand.id);
    const payload = {
      shift_id: composed.shift.id,
      segment_id: composed.segments[0].id,
      start_date: "2026-08-17",
      start_time: "06:30",
      end_date: "2026-08-17",
      end_time: "15:30",
      expected_shift_revision: composed.shift.revision,
      expected_segment_revision: composed.segments[0].revision,
      expected_occurrence_revision: currentOccurrence.revision,
      expected_assignment_revisions: { [composed.assignment.id]: composed.assignment.revision },
    };
    const originalShiftUpdate = entities.PlanningShift.updateMany.bind(entities.PlanningShift);
    let rejectOnce = true;
    entities.PlanningShift.updateMany = async (query, update) => {
      if (
        rejectOnce
        && query.id === composed.shift.id
        && update.$set?.metadata?.task_partition_mutation?.action
          === "resize_task_shift_preserving_coverage"
      ) {
        rejectOnce = false;
        const error = new Error("rate limit exceeded");
        error.status = 429;
        throw error;
      }
      return originalShiftUpdate(query, update);
    };
    const originalCoordinatorUpdate = entities.PlanningMutationCoordinator.updateMany.bind(
      entities.PlanningMutationCoordinator,
    );
    const releaseAttemptsByCoordinator = new Map();
    entities.PlanningMutationCoordinator.updateMany = async (query, update) => {
      if (update.$set?.lease === null) {
        const attempts = Number(releaseAttemptsByCoordinator.get(query.id) || 0) + 1;
        releaseAttemptsByCoordinator.set(query.id, attempts);
        if (attempts <= 2) {
          const error = new Error("rate limit exceeded during lease release");
          error.status = 429;
          error.details = { retry_after_ms: 1 };
          throw error;
        }
      }
      return originalCoordinatorUpdate(query, update);
    };
    const resizeContext = context("partition-rate-limit-resize");
    const retryDelays = [];
    const originalSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = (callback, delay, ...args) => {
      retryDelays.push(Number(delay));
      callback(...args);
      return 0;
    };

    try {
      await expect(backend.resizeTaskShiftPreservingCoverage(
        base44,
        user,
        payload,
        resizeContext,
      )).rejects.toMatchObject({ status: 429, message: "rate limit exceeded" });
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
    expect(entities.PlanningShift.records).toHaveLength(2);
    expect(entities.PlanningShiftTaskSegment.records).toHaveLength(2);
    expect(entities.PlanningAuditEvent.records.filter(item => (
      item.action === "resize_task_shift_preserving_coverage"
    ))).toHaveLength(0);
    expect(entities.PlanningMutationCoordinator.records.every(item => item.lease == null)).toBe(true);
    expect(releaseAttemptsByCoordinator.size).toBe(7);
    expect([...releaseAttemptsByCoordinator.values()]).toEqual([3, 3, 3, 3, 3, 3, 3]);
    expect(retryDelays).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);

    const recovered = await backend.resizeTaskShiftPreservingCoverage(
      base44,
      user,
      payload,
      resizeContext,
    );
    expect(recovered.shift).toMatchObject({ start_time: "06:30", end_time: "15:30" });
    expect(recovered.shifts).toEqual(expect.arrayContaining([
      expect.objectContaining({ start_time: "06:30", end_time: "15:30", status: "draft" }),
      expect.objectContaining({ start_time: "15:30", end_time: "18:00", status: "draft" }),
    ]));
    expect(entities.PlanningShift.records).toHaveLength(2);
    expect(entities.PlanningShiftTaskSegment.records).toHaveLength(2);
    expect(entities.PlanningAuditEvent.records.filter(item => (
      item.action === "resize_task_shift_preserving_coverage"
      && item.idempotency_key === resizeContext.idempotencyKey
    ))).toHaveLength(1);
    expect(backend.occurrenceCoverage(
      demand,
      entities.PlanningShiftTaskSegment.records,
      entities.PlanningShift.records,
    )).toMatchObject({ coverage_status: "full", allocated_minutes: 690, remaining_minutes: 0 });
  });

  it("blijft fail-closed met cleanupdetails als een 429-window alle releasepogingen uitput", async () => {
    const demand = occurrence("occurrence-partition-release-exhausted", "object-1", "06:30", "18:00", 690);
    const { base44, entities } = setup([demand]);
    const personnelId = "personnel-partition-release-exhausted";
    entities.Personnel.records.push({ id: personnelId, name: "Cleanup beveiliger", status: "active" });
    const composed = await backend.composeAndAssign(base44, user, {
      personnel_id: personnelId,
      segments: [{ task_occurrence_id: demand.id, start_time: "06:30", end_time: "18:00" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    }, context("partition-release-exhausted-compose"));
    const currentOccurrence = await entities.PlanningTaskOccurrence.get(demand.id);
    const payload = {
      shift_id: composed.shift.id,
      segment_id: composed.segments[0].id,
      start_date: "2026-08-17",
      start_time: "06:30",
      end_date: "2026-08-17",
      end_time: "15:30",
      expected_shift_revision: composed.shift.revision,
      expected_segment_revision: composed.segments[0].revision,
      expected_occurrence_revision: currentOccurrence.revision,
      expected_assignment_revisions: { [composed.assignment.id]: composed.assignment.revision },
    };
    const originalShiftUpdate = entities.PlanningShift.updateMany.bind(entities.PlanningShift);
    let rejectBusinessWrite = true;
    entities.PlanningShift.updateMany = async (query, update) => {
      if (
        rejectBusinessWrite
        && query.id === composed.shift.id
        && update.$set?.metadata?.task_partition_mutation?.action
          === "resize_task_shift_preserving_coverage"
      ) {
        rejectBusinessWrite = false;
        const error = new Error("rate limit exceeded during business write");
        error.status = 429;
        throw error;
      }
      return originalShiftUpdate(query, update);
    };
    const releaseAttemptsByCoordinator = new Map();
    const originalCoordinatorUpdate = entities.PlanningMutationCoordinator.updateMany.bind(
      entities.PlanningMutationCoordinator,
    );
    entities.PlanningMutationCoordinator.updateMany = async (query, update) => {
      if (update.$set?.lease !== null) {
        return originalCoordinatorUpdate(query, update);
      }
      const attempts = Number(releaseAttemptsByCoordinator.get(query.id) || 0) + 1;
      releaseAttemptsByCoordinator.set(query.id, attempts);
      const error = new Error("rate limit exceeded during lease release");
      error.status = 429;
      error.details = { retry_after_ms: 1 };
      throw error;
    };

    let exhaustedError;
    try {
      await backend.resizeTaskShiftPreservingCoverage(
        base44,
        user,
        payload,
        context("partition-release-exhausted-resize"),
      );
    } catch (error) {
      exhaustedError = error;
    }
    expect(exhaustedError).toMatchObject({
      status: 429,
      message: "rate limit exceeded during business write",
      details: {
        lease_release_exhausted: true,
        retry_after: expect.stringMatching(/Z$/),
        retry_after_ms: expect.any(Number),
        lease_release_errors: expect.arrayContaining([
          expect.objectContaining({
            entity: "PlanningMutationCoordinator",
            status: 429,
            rate_limited: true,
            attempts: 6,
            retry_after_ms: 1,
          }),
        ]),
      },
    });
    expect(exhaustedError.details.retry_after_ms).toBeGreaterThan(100_000);
    expect(Date.parse(exhaustedError.details.retry_after)).toBeGreaterThan(Date.now() + 100_000);
    expect(releaseAttemptsByCoordinator.size).toBe(7);
    expect([...releaseAttemptsByCoordinator.values()]).toEqual([6, 6, 6, 6, 6, 6, 6]);
    expect(entities.PlanningMutationCoordinator.records.filter(item => item.lease != null)).toHaveLength(7);
    expect(entities.PlanningAuditEvent.records.filter(item => (
      item.action === "resize_task_shift_preserving_coverage"
    ))).toHaveLength(0);
  });

  it.each([
    {
      label: "begintijd",
      demand: occurrence("occurrence-partition-start", "object-1", "06:00", "18:00", 720),
      target: { start_date: "2026-08-17", start_time: "09:00", end_date: "2026-08-17", end_time: "18:00" },
      expectedCompanion: { start_date: "2026-08-17", start_time: "06:00", end_date: "2026-08-17", end_time: "09:00" },
    },
    {
      label: "nachtdienst",
      demand: {
        ...occurrence("occurrence-partition-night", "object-1", "22:00", "06:00", 480),
        end_date: "2026-08-18",
      },
      target: { start_date: "2026-08-18", start_time: "00:00", end_date: "2026-08-18", end_time: "06:00" },
      expectedCompanion: { start_date: "2026-08-17", start_time: "22:00", end_date: "2026-08-18", end_time: "00:00" },
    },
  ])("behoudt dekking bij resize van $label", async ({ demand, target, expectedCompanion }) => {
    const { base44, entities } = setup([demand]);
    const composed = await backend.composeShift(base44, user, {
      segments: [{
        task_occurrence_id: demand.id,
        start_date: demand.service_date,
        start_time: demand.window_start_time,
        end_date: demand.end_date,
        end_time: demand.window_end_time,
      }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    }, context(`partition-${demand.id}-compose`));
    const currentOccurrence = await entities.PlanningTaskOccurrence.get(demand.id);
    const result = await backend.resizeTaskShiftPreservingCoverage(base44, user, {
      shift_id: composed.shift.id,
      segment_id: composed.segments[0].id,
      ...target,
      expected_shift_revision: composed.shift.revision,
      expected_segment_revision: composed.segments[0].revision,
      expected_occurrence_revision: currentOccurrence.revision,
      expected_assignment_revisions: {},
    }, context(`partition-${demand.id}-resize`));

    expect(result.segments).toContainEqual(expect.objectContaining(expectedCompanion));
    expect(backend.occurrenceCoverage(
      demand,
      entities.PlanningShiftTaskSegment.records,
      entities.PlanningShift.records,
    )).toMatchObject({ coverage_status: "full", allocated_minutes: demand.required_minutes });
  });

  it("herstelt na een late resize-auditfout zonder dubbele companionrecords", async () => {
    const demand = occurrence("occurrence-partition-recovery", "object-1", "10:00", "18:00", 480);
    const { base44, entities } = setup([demand]);
    const composed = await backend.composeShift(base44, user, {
      segments: [{ task_occurrence_id: demand.id, start_time: "10:00", end_time: "18:00" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    }, context("partition-recovery-compose"));
    const currentOccurrence = await entities.PlanningTaskOccurrence.get(demand.id);
    const payload = {
      shift_id: composed.shift.id,
      segment_id: composed.segments[0].id,
      start_time: "10:00",
      end_time: "14:00",
      expected_shift_revision: composed.shift.revision,
      expected_segment_revision: composed.segments[0].revision,
      expected_occurrence_revision: currentOccurrence.revision,
      expected_assignment_revisions: {},
    };
    const originalAuditCreate = entities.PlanningAuditEvent.create.bind(entities.PlanningAuditEvent);
    let failOnce = true;
    entities.PlanningAuditEvent.create = async data => {
      if (failOnce && data.action === "resize_task_shift_preserving_coverage") {
        failOnce = false;
        throw new Error("tijdelijke partition-auditfout");
      }
      return originalAuditCreate(data);
    };

    await expect(backend.resizeTaskShiftPreservingCoverage(
      base44,
      user,
      payload,
      context("partition-recovery-resize"),
    )).rejects.toThrow("tijdelijke partition-auditfout");
    expect(entities.PlanningShift.records).toHaveLength(2);
    expect(entities.PlanningShiftTaskSegment.records).toHaveLength(2);

    const recovered = await backend.resizeTaskShiftPreservingCoverage(
      base44,
      user,
      payload,
      context("partition-recovery-resize"),
    );
    expect(recovered.shifts).toHaveLength(2);
    expect(entities.PlanningShift.records).toHaveLength(2);
    expect(entities.PlanningShiftTaskSegment.records).toHaveLength(2);
    expect(entities.PlanningAuditEvent.records.filter(
      item => item.action === "resize_task_shift_preserving_coverage",
    )).toHaveLength(1);
  });

  it("finaliseert een geaudite resize na final-markercrash automatisch bij bootstrap", async () => {
    const demand = occurrence("occurrence-partition-bootstrap-recovery", "object-1", "10:00", "18:00", 480);
    const { base44, entities } = setup([demand]);
    const composed = await backend.composeShift(base44, user, {
      segments: [{ task_occurrence_id: demand.id, start_time: "10:00", end_time: "18:00" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    }, context("partition-bootstrap-recovery-compose"));
    const payload = {
      shift_id: composed.shift.id,
      segment_id: composed.segments[0].id,
      start_time: "10:00",
      end_time: "14:00",
      expected_shift_revision: composed.shift.revision,
      expected_segment_revision: composed.segments[0].revision,
      expected_occurrence_revision: (await entities.PlanningTaskOccurrence.get(demand.id)).revision,
      expected_assignment_revisions: {},
    };
    const originalShiftUpdateMany = entities.PlanningShift.updateMany.bind(entities.PlanningShift);
    let failFinalMarkerOnce = true;
    entities.PlanningShift.updateMany = async (query, update) => {
      if (
        failFinalMarkerOnce
        && update?.$set?.metadata?.task_partition_mutation?.phase === "completed"
      ) {
        failFinalMarkerOnce = false;
        throw new Error("simulated partition final-marker failure");
      }
      return originalShiftUpdateMany(query, update);
    };

    await expect(backend.resizeTaskShiftPreservingCoverage(
      base44,
      user,
      payload,
      context("partition-bootstrap-recovery-resize"),
    )).rejects.toThrow("simulated partition final-marker failure");
    const audit = entities.PlanningAuditEvent.records.find(item => (
      item.action === "resize_task_shift_preserving_coverage"
      && item.idempotency_key === "partition-bootstrap-recovery-resize"
    ));
    expect(audit).toBeTruthy();
    expect(entities.PlanningShift.records.some(item => (
      item.metadata?.task_partition_mutation?.phase !== "completed"
    ))).toBe(true);

    const bootstrap = await backend.bootstrapRange(base44, user, {
      period_start: "2026-08-17",
      period_end: "2026-08-17",
    }, context("partition-bootstrap-recovery-open"));

    expect(bootstrap.task_partition_recovery).toEqual([
      expect.objectContaining({
        action: "resize_task_shift_preserving_coverage",
        status: "completed",
        audit_event_id: audit.id,
      }),
    ]);
    const participants = entities.PlanningShift.records.filter(item => (
      item.metadata?.task_partition_mutation?.idempotency_key === "partition-bootstrap-recovery-resize"
    ));
    expect(participants).toHaveLength(2);
    expect(participants.every(item => (
      item.metadata.task_partition_mutation.phase === "completed"
      && item.metadata.task_partition_mutation.audit_event_id === audit.id
    ))).toBe(true);
    expect(entities.PlanningAuditEvent.records.filter(item => (
      item.action === "resize_task_shift_preserving_coverage"
    ))).toHaveLength(1);
  });

  it("weigert een stale partition-resize zonder companionrecords of businesswrites", async () => {
    const demand = occurrence("occurrence-partition-stale", "object-1", "10:00", "18:00", 480);
    const { base44, entities } = setup([demand]);
    const composed = await backend.composeShift(base44, user, {
      segments: [{ task_occurrence_id: demand.id, start_time: "10:00", end_time: "18:00" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    }, context("partition-stale-compose"));
    const currentOccurrence = await entities.PlanningTaskOccurrence.get(demand.id);
    const before = structuredClone({
      shifts: entities.PlanningShift.records,
      segments: entities.PlanningShiftTaskSegment.records,
      occurrences: entities.PlanningTaskOccurrence.records,
    });

    await expect(backend.resizeTaskShiftPreservingCoverage(base44, user, {
      shift_id: composed.shift.id,
      segment_id: composed.segments[0].id,
      start_time: "10:00",
      end_time: "14:00",
      expected_shift_revision: composed.shift.revision + 1,
      expected_segment_revision: composed.segments[0].revision,
      expected_occurrence_revision: currentOccurrence.revision,
      expected_assignment_revisions: {},
    }, context("partition-stale-resize"))).rejects.toMatchObject({ status: 409 });
    expect({
      shifts: entities.PlanningShift.records,
      segments: entities.PlanningShiftTaskSegment.records,
      occurrences: entities.PlanningTaskOccurrence.records,
    }).toEqual(before);
  });

  it("behandelt een ontbrekende actieve assignmentrevision als stale bezettingsset", async () => {
    const fixture = await prepareAssignedTaskPartition({ key: "partition-resize-missing-assignment-fence" });
    const currentOccurrence = await fixture.entities.PlanningTaskOccurrence.get(fixture.demand.id);
    const before = structuredClone({
      shifts: fixture.entities.PlanningShift.records,
      segments: fixture.entities.PlanningShiftTaskSegment.records,
      assignments: fixture.entities.PlanningAssignment.records,
      occurrences: fixture.entities.PlanningTaskOccurrence.records,
    });

    await expect(backend.resizeTaskShiftPreservingCoverage(fixture.base44, user, {
      shift_id: fixture.adjacentShift.id,
      segment_id: fixture.adjacentSegment.id,
      start_time: "06:30",
      end_time: "14:30",
      expected_shift_revision: fixture.adjacentShift.revision,
      expected_segment_revision: fixture.adjacentSegment.revision,
      expected_occurrence_revision: currentOccurrence.revision,
      expected_assignment_revisions: {},
    }, context("partition-resize-missing-assignment-fence-action"))).rejects.toMatchObject({
      status: 409,
      details: { missing_assignment_ids: [fixture.adjacentAssignment.id] },
    });
    expect({
      shifts: fixture.entities.PlanningShift.records,
      segments: fixture.entities.PlanningShiftTaskSegment.records,
      assignments: fixture.entities.PlanningAssignment.records,
      occurrences: fixture.entities.PlanningTaskOccurrence.records,
    }).toEqual(before);
  });

  it("vacate coalescet naar één open dienst en replayt na verloren response finalized revisies", async () => {
    const demand = occurrence("occurrence-partition-vacate", "object-1", "06:30", "18:00", 690);
    const { base44, entities } = setup([demand]);
    entities.Personnel.records.push({ id: "personnel-partition-vacate", name: "Dagbeveiliger", status: "active" });
    const composed = await backend.composeAndAssign(base44, user, {
      personnel_id: "personnel-partition-vacate",
      segments: [{ task_occurrence_id: demand.id, start_time: "06:30", end_time: "18:00" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    }, context("partition-vacate-compose"));
    const beforeResizeOccurrence = await entities.PlanningTaskOccurrence.get(demand.id);
    const resized = await backend.resizeTaskShiftPreservingCoverage(base44, user, {
      shift_id: composed.shift.id,
      segment_id: composed.segments[0].id,
      start_time: "06:30",
      end_time: "15:30",
      expected_shift_revision: composed.shift.revision,
      expected_segment_revision: composed.segments[0].revision,
      expected_occurrence_revision: beforeResizeOccurrence.revision,
      expected_assignment_revisions: { [composed.assignment.id]: composed.assignment.revision },
    }, context("partition-vacate-resize"));
    const targetShift = resized.shift;
    const targetSegment = resized.segment;
    const targetAssignment = resized.assignments[0];
    const companionShift = resized.shifts.find(item => item.id !== targetShift.id);
    const companionSegment = resized.segments.find(item => item.shift_id === companionShift.id);
    const beforeVacateOccurrence = await entities.PlanningTaskOccurrence.get(demand.id);
    const vacatePayload = {
      shift_id: targetShift.id,
      segment_id: targetSegment.id,
      expected_shift_revision: targetShift.revision,
      expected_segment_revision: targetSegment.revision,
      expected_occurrence_revision: beforeVacateOccurrence.revision,
      expected_assignment_revisions: { [targetAssignment.id]: targetAssignment.revision },
      expected_neighbor_shift_revisions: { [companionShift.id]: companionShift.revision },
      expected_neighbor_segment_revisions: { [companionSegment.id]: companionSegment.revision },
    };
    const originalAuditCreate = entities.PlanningAuditEvent.create.bind(entities.PlanningAuditEvent);
    let failVacateAuditOnce = true;
    entities.PlanningAuditEvent.create = async data => {
      if (failVacateAuditOnce && data.action === "vacate_task_shift_partition") {
        failVacateAuditOnce = false;
        throw new Error("tijdelijke vacate-auditfout");
      }
      return originalAuditCreate(data);
    };

    await expect(backend.vacateTaskShiftPartition(
      base44,
      user,
      vacatePayload,
      context("partition-vacate-coalesce"),
    )).rejects.toThrow("tijdelijke vacate-auditfout");
    const shiftCountAfterFailure = entities.PlanningShift.records.length;
    const segmentCountAfterFailure = entities.PlanningShiftTaskSegment.records.length;
    const result = await backend.vacateTaskShiftPartition(
      base44,
      user,
      vacatePayload,
      context("partition-vacate-coalesce"),
    );

    expect(result.shift).toMatchObject({ start_time: "06:30", end_time: "18:00", status: "draft" });
    expect(result.removed_shift_ids).toEqual([companionShift.id]);
    expect(result.removed_segment_ids).toEqual([companionSegment.id]);
    expect(result.removed_assignment_ids).toEqual([targetAssignment.id]);
    expect((await entities.PlanningAssignment.get(targetAssignment.id)).status).toBe("removed");
    expect((await entities.PlanningShift.get(companionShift.id)).status).toBe("cancelled");
    expect(entities.PlanningAssignment.records.filter(
      item => item.shift_id === result.shift.id && item.status !== "removed",
    )).toEqual([]);
    expect(backend.occurrenceCoverage(
      demand,
      entities.PlanningShiftTaskSegment.records,
      entities.PlanningShift.records,
    )).toMatchObject({ coverage_status: "full", allocated_minutes: 690 });
    const auditCount = entities.PlanningAuditEvent.records.length;
    const replay = await backend.vacateTaskShiftPartition(
      base44,
      user,
      vacatePayload,
      context("partition-vacate-coalesce"),
    );
    expect(replay.idempotent).toBe(true);
    expect(replay.survivor_shift_id).toBe(result.survivor_shift_id);
    expect(replay.removed_shift_ids).toEqual(result.removed_shift_ids);
    expect(replay.removed_segment_ids).toEqual(result.removed_segment_ids);
    expect(replay.removed_assignment_ids).toEqual(result.removed_assignment_ids);
    expect(replay.shift).toEqual(await entities.PlanningShift.get(replay.shift.id));
    expect(replay.shifts).toEqual(await Promise.all(
      replay.shifts.map(item => entities.PlanningShift.get(item.id)),
    ));
    expect(replay.segment).toEqual(await entities.PlanningShiftTaskSegment.get(replay.segment.id));
    expect(replay.segments).toEqual(await Promise.all(
      replay.segments.map(item => entities.PlanningShiftTaskSegment.get(item.id)),
    ));
    expect(replay.assignments).toEqual(await Promise.all(
      replay.assignments.map(item => entities.PlanningAssignment.get(item.id)),
    ));
    expect(replay.task_occurrences).toEqual(await Promise.all(
      replay.task_occurrences.map(item => entities.PlanningTaskOccurrence.get(item.id)),
    ));
    expect(replay.shifts.every(item => (
      item.metadata?.task_partition_mutation?.phase === "completed"
      && item.metadata?.task_partition_mutation?.audit_event_id === replay.audit_event_id
    ))).toBe(true);
    expect(entities.PlanningShift.records).toHaveLength(shiftCountAfterFailure);
    expect(entities.PlanningShiftTaskSegment.records).toHaveLength(segmentCountAfterFailure);
    expect(entities.PlanningAuditEvent.records).toHaveLength(auditCount);

    const reassigned = await backend.assignPersonnel(base44, user, {
      shift_id: replay.shift.id,
      personnel_id: "personnel-partition-vacate",
      slot_index: 0,
      expected_shift_revision: replay.shift.revision,
    }, context("partition-vacate-reassign"));
    expect(reassigned.assignment).toMatchObject({
      id: targetAssignment.id,
      status: "draft",
      personnel_id: "personnel-partition-vacate",
    });
    const auditCountAfterReassign = entities.PlanningAuditEvent.records.length;
    const lateReplay = await backend.vacateTaskShiftPartition(
      base44,
      user,
      vacatePayload,
      context("partition-vacate-coalesce"),
    );
    expect(lateReplay.assignments).toEqual([reassigned.assignment]);
    expect(lateReplay.removed_assignment_ids).toEqual([]);
    expect(entities.PlanningAuditEvent.records).toHaveLength(auditCountAfterReassign);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const assignmentKey = ["planning-assignments", "2026-08-17", "2026-08-17"];
    queryClient.setQueryData(assignmentKey, [reassigned.assignment]);
    applyPlanningMutationResultToCache(queryClient, {
      periodStart: "2026-08-17",
      periodEnd: "2026-08-17",
      result: lateReplay,
    });
    expect(queryClient.getQueryData(assignmentKey)).toEqual([reassigned.assignment]);
    expect((await entities.PlanningAssignment.get(targetAssignment.id)).status).toBe("draft");
  });

  it("vacate faalt gesloten bij een incompatibele aansluitende companion", async () => {
    const demand = occurrence("occurrence-partition-incompatible", "object-1", "10:00", "18:00", 480);
    const { base44, entities } = setup([demand]);
    const composed = await backend.composeShift(base44, user, {
      segments: [{ task_occurrence_id: demand.id, start_time: "10:00", end_time: "18:00" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    }, context("partition-incompatible-compose"));
    const beforeResizeOccurrence = await entities.PlanningTaskOccurrence.get(demand.id);
    const resized = await backend.resizeTaskShiftPreservingCoverage(base44, user, {
      shift_id: composed.shift.id,
      segment_id: composed.segments[0].id,
      start_time: "10:00",
      end_time: "14:00",
      expected_shift_revision: composed.shift.revision,
      expected_segment_revision: composed.segments[0].revision,
      expected_occurrence_revision: beforeResizeOccurrence.revision,
      expected_assignment_revisions: {},
    }, context("partition-incompatible-resize"));
    const companion = entities.PlanningShift.records.find(item => item.id === resized.companion_shift_ids[0]);
    companion.required_count = 2;
    const before = structuredClone({
      shifts: entities.PlanningShift.records,
      segments: entities.PlanningShiftTaskSegment.records,
      occurrences: entities.PlanningTaskOccurrence.records,
    });

    await expect(backend.vacateTaskShiftPartition(base44, user, {
      shift_id: resized.shift.id,
      segment_id: resized.segment.id,
      expected_shift_revision: resized.shift.revision,
      expected_segment_revision: resized.segment.revision,
      expected_occurrence_revision: (await entities.PlanningTaskOccurrence.get(demand.id)).revision,
      expected_assignment_revisions: {},
      expected_neighbor_shift_revisions: { [companion.id]: companion.revision },
      expected_neighbor_segment_revisions: {},
    }, context("partition-incompatible-vacate"))).rejects.toMatchObject({
      status: 409,
      details: { code: "TASK_PARTITION_ADJACENT_INCOMPATIBLE" },
    });
    expect({
      shifts: entities.PlanningShift.records,
      segments: entities.PlanningShiftTaskSegment.records,
      occurrences: entities.PlanningTaskOccurrence.records,
    }).toEqual(before);
  });

  it("finaliseert een geaudite vacate na final-markercrash automatisch bij bootstrap", async () => {
    const demand = occurrence("occurrence-partition-vacate-bootstrap", "object-1", "06:30", "18:00", 690);
    const { base44, entities } = setup([demand]);
    const personnelId = "personnel-partition-vacate-bootstrap";
    entities.Personnel.records.push({ id: personnelId, name: "Dagbeveiliger", status: "active" });
    const composed = await backend.composeAndAssign(base44, user, {
      personnel_id: personnelId,
      segments: [{ task_occurrence_id: demand.id, start_time: "06:30", end_time: "18:00" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    }, context("partition-vacate-bootstrap-compose"));
    const resized = await backend.resizeTaskShiftPreservingCoverage(base44, user, {
      shift_id: composed.shift.id,
      segment_id: composed.segments[0].id,
      start_time: "06:30",
      end_time: "15:30",
      expected_shift_revision: composed.shift.revision,
      expected_segment_revision: composed.segments[0].revision,
      expected_occurrence_revision: (await entities.PlanningTaskOccurrence.get(demand.id)).revision,
      expected_assignment_revisions: { [composed.assignment.id]: composed.assignment.revision },
    }, context("partition-vacate-bootstrap-resize"));
    const targetShift = resized.shift;
    const targetSegment = resized.segment;
    const targetAssignment = resized.assignments[0];
    const companionShift = resized.shifts.find(item => item.id !== targetShift.id);
    const companionSegment = resized.segments.find(item => item.shift_id === companionShift.id);
    const payload = {
      shift_id: targetShift.id,
      segment_id: targetSegment.id,
      expected_shift_revision: targetShift.revision,
      expected_segment_revision: targetSegment.revision,
      expected_occurrence_revision: (await entities.PlanningTaskOccurrence.get(demand.id)).revision,
      expected_assignment_revisions: { [targetAssignment.id]: targetAssignment.revision },
      expected_neighbor_shift_revisions: { [companionShift.id]: companionShift.revision },
      expected_neighbor_segment_revisions: { [companionSegment.id]: companionSegment.revision },
    };
    const originalShiftUpdateMany = entities.PlanningShift.updateMany.bind(entities.PlanningShift);
    let failFinalMarkerOnce = true;
    entities.PlanningShift.updateMany = async (query, update) => {
      if (
        failFinalMarkerOnce
        && update?.$set?.metadata?.task_partition_mutation?.action === "vacate_task_shift_partition"
        && update.$set.metadata.task_partition_mutation.phase === "completed"
      ) {
        failFinalMarkerOnce = false;
        throw new Error("simulated vacate final-marker failure");
      }
      return originalShiftUpdateMany(query, update);
    };

    await expect(backend.vacateTaskShiftPartition(
      base44,
      user,
      payload,
      context("partition-vacate-bootstrap-action"),
    )).rejects.toThrow("simulated vacate final-marker failure");
    const audit = entities.PlanningAuditEvent.records.find(item => (
      item.action === "vacate_task_shift_partition"
      && item.idempotency_key === "partition-vacate-bootstrap-action"
    ));
    expect(audit).toBeTruthy();

    const bootstrap = await backend.bootstrapRange(base44, user, {
      period_start: "2026-08-17",
      period_end: "2026-08-17",
    }, context("partition-vacate-bootstrap-open"));

    expect(bootstrap.task_partition_recovery).toEqual([
      expect.objectContaining({
        action: "vacate_task_shift_partition",
        status: "completed",
        audit_event_id: audit.id,
      }),
    ]);
    const participants = entities.PlanningShift.records.filter(item => (
      item.metadata?.task_partition_mutation?.idempotency_key === "partition-vacate-bootstrap-action"
    ));
    expect(participants).toHaveLength(2);
    expect(participants.every(item => (
      item.metadata.task_partition_mutation.phase === "completed"
      && item.metadata.task_partition_mutation.audit_event_id === audit.id
    ))).toBe(true);
    expect(entities.PlanningAuditEvent.records.filter(item => (
      item.action === "vacate_task_shift_partition"
    ))).toHaveLength(1);
  });

  it("voegt dezelfde medewerker atomair samen en replayt na verloren response finalized revisies", async () => {
    const fixture = await prepareAssignedTaskPartition({ key: "partition-assign-merge" });
    const {
      base44,
      entities,
      demand,
      targetShift,
      targetSegment,
      adjacentShift,
      adjacentAssignment,
      payload,
    } = fixture;
    let validationCalls = 0;
    base44.asServiceRole.functions.invoke = async () => {
      validationCalls += 1;
      return {};
    };
    const assignmentCountBefore = entities.PlanningAssignment.records.length;

    const result = await backend.assignAndMergeTaskShiftPartition(
      base44,
      user,
      payload,
      context("partition-assign-merge-action"),
    );

    expect(result.shift).toMatchObject({
      id: adjacentShift.id,
      start_time: "06:30",
      end_time: "18:00",
      status: "draft",
      required_count: 1,
    });
    expect(result.assignment).toMatchObject({
      id: adjacentAssignment.id,
      shift_id: adjacentShift.id,
      personnel_id: fixture.personnelId,
      slot_index: 0,
      status: "draft",
    });
    expect(result.shifts).toHaveLength(2);
    expect(result.segments).toEqual(expect.arrayContaining([
      expect.objectContaining({ shift_id: adjacentShift.id, start_time: "06:30", end_time: "18:00", status: "draft" }),
      expect.objectContaining({ id: targetSegment.id, status: "removed" }),
    ]));
    expect(result.removed_shift_ids).toEqual([targetShift.id]);
    expect(result.removed_segment_ids).toEqual([targetSegment.id]);
    expect(result.removed_assignment_ids).toEqual([]);
    expect((await entities.PlanningShift.get(targetShift.id)).status).toBe("cancelled");
    expect((await entities.PlanningShiftTaskSegment.get(targetSegment.id)).status).toBe("removed");
    expect(entities.PlanningAssignment.records).toHaveLength(assignmentCountBefore);
    expect(entities.PlanningAssignment.records.filter(item => item.status !== "removed"))
      .toEqual([expect.objectContaining({ id: adjacentAssignment.id, shift_id: adjacentShift.id })]);
    expect(backend.occurrenceCoverage(
      demand,
      entities.PlanningShiftTaskSegment.records,
      entities.PlanningShift.records,
    )).toMatchObject({ coverage_status: "full", allocated_minutes: 690, remaining_minutes: 0 });
    expect(validationCalls).toBe(1);

    const auditCount = entities.PlanningAuditEvent.records.length;
    const shiftSnapshot = structuredClone(entities.PlanningShift.records);
    const assignmentSnapshot = structuredClone(entities.PlanningAssignment.records);
    const replay = await backend.assignAndMergeTaskShiftPartition(
      base44,
      user,
      payload,
      context("partition-assign-merge-action"),
    );
    expect(replay.idempotent).toBe(true);
    expect(replay.survivor_shift_id).toBe(adjacentShift.id);
    expect(replay.shift).toEqual(await entities.PlanningShift.get(replay.shift.id));
    expect(replay.shifts).toEqual(await Promise.all(
      replay.shifts.map(item => entities.PlanningShift.get(item.id)),
    ));
    expect(replay.segment).toEqual(await entities.PlanningShiftTaskSegment.get(replay.segment.id));
    expect(replay.segments).toEqual(await Promise.all(
      replay.segments.map(item => entities.PlanningShiftTaskSegment.get(item.id)),
    ));
    expect(replay.assignment).toEqual(await entities.PlanningAssignment.get(replay.assignment.id));
    expect(replay.assignments).toEqual(await Promise.all(
      replay.assignments.map(item => entities.PlanningAssignment.get(item.id)),
    ));
    expect(replay.task_occurrences).toEqual(await Promise.all(
      replay.task_occurrences.map(item => entities.PlanningTaskOccurrence.get(item.id)),
    ));
    expect(replay.shifts.every(item => (
      item.metadata?.task_partition_mutation?.phase === "completed"
      && item.metadata?.task_partition_mutation?.audit_event_id === replay.audit_event_id
    ))).toBe(true);
    expect(entities.PlanningShift.records).toEqual(shiftSnapshot);
    expect(entities.PlanningAssignment.records).toEqual(assignmentSnapshot);
    expect(entities.PlanningAuditEvent.records).toHaveLength(auditCount);
    expect(validationCalls).toBe(1);

    const occurrenceBeforeLaterComposition = await entities.PlanningTaskOccurrence.get(demand.id);
    const recomposed = await backend.composeShift(base44, user, {
      shift_id: replay.shift.id,
      expected_shift_revision: replay.shift.revision,
      expected_occurrence_revisions: {
        [demand.id]: occurrenceBeforeLaterComposition.revision,
      },
      segments: [
        {
          task_occurrence_id: demand.id,
          start_date: "2026-08-17",
          start_time: "06:30",
          end_date: "2026-08-17",
          end_time: "12:00",
        },
        {
          task_occurrence_id: demand.id,
          start_date: "2026-08-17",
          start_time: "12:00",
          end_date: "2026-08-17",
          end_time: "18:00",
        },
      ],
    }, context("partition-assign-merge-later-composition"));
    expect(recomposed.segments).toHaveLength(2);
    const participantShiftIds = new Set(replay.shifts.map(item => String(item.id)));
    const currentParticipantSegments = entities.PlanningShiftTaskSegment.records.filter(item => (
      participantShiftIds.has(String(item.shift_id))
    ));
    const currentActiveSegmentIds = currentParticipantSegments
      .filter(item => item.status !== "removed")
      .map(item => String(item.id))
      .sort();
    expect(currentActiveSegmentIds).toHaveLength(2);
    const auditCountAfterComposition = entities.PlanningAuditEvent.records.length;
    const lateReplay = await backend.assignAndMergeTaskShiftPartition(
      base44,
      user,
      payload,
      context("partition-assign-merge-action"),
    );
    expect(new Set(lateReplay.segments.map(item => String(item.id))))
      .toEqual(new Set(currentParticipantSegments.map(item => String(item.id))));
    expect(entities.PlanningAuditEvent.records).toHaveLength(auditCountAfterComposition);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const segmentKey = ["planning-task-segments", "2026-08-17", "2026-08-17"];
    queryClient.setQueryData(segmentKey, structuredClone(currentParticipantSegments));
    applyPlanningMutationResultToCache(queryClient, {
      periodStart: "2026-08-17",
      periodEnd: "2026-08-17",
      result: lateReplay,
      replaceShiftSegments: true,
    });
    const cachedActiveSegmentIds = queryClient.getQueryData(segmentKey)
      .filter(item => item.status !== "removed")
      .map(item => String(item.id))
      .sort();
    expect(cachedActiveSegmentIds).toEqual(currentActiveSegmentIds);
  });

  it("herstelt assign-and-merge na een late auditfout zonder tweede validatie of dubbel record", async () => {
    const fixture = await prepareAssignedTaskPartition({ key: "partition-assign-merge-recovery" });
    const { base44, entities, targetShift, adjacentShift, adjacentAssignment, payload } = fixture;
    let validationCalls = 0;
    base44.asServiceRole.functions.invoke = async () => {
      validationCalls += 1;
      return {};
    };
    const originalAuditCreate = entities.PlanningAuditEvent.create.bind(entities.PlanningAuditEvent);
    let failOnce = true;
    entities.PlanningAuditEvent.create = async data => {
      if (failOnce && data.action === "assign_and_merge_task_shift_partition") {
        failOnce = false;
        throw new Error("tijdelijke assign-merge-auditfout");
      }
      return originalAuditCreate(data);
    };

    await expect(backend.assignAndMergeTaskShiftPartition(
      base44,
      user,
      payload,
      context("partition-assign-merge-recovery-action"),
    )).rejects.toThrow("tijdelijke assign-merge-auditfout");
    expect((await entities.PlanningShift.get(targetShift.id)).status).toBe("cancelled");
    expect((await entities.PlanningShift.get(adjacentShift.id))).toMatchObject({
      start_time: "06:30",
      end_time: "18:00",
      status: "draft",
    });
    expect(validationCalls).toBe(1);
    const recordCounts = {
      shifts: entities.PlanningShift.records.length,
      segments: entities.PlanningShiftTaskSegment.records.length,
      assignments: entities.PlanningAssignment.records.length,
    };

    const recovered = await backend.assignAndMergeTaskShiftPartition(
      base44,
      user,
      payload,
      context("partition-assign-merge-recovery-action"),
    );
    expect(recovered.assignment.id).toBe(adjacentAssignment.id);
    expect(recovered.survivor_shift_id).toBe(adjacentShift.id);
    expect({
      shifts: entities.PlanningShift.records.length,
      segments: entities.PlanningShiftTaskSegment.records.length,
      assignments: entities.PlanningAssignment.records.length,
    }).toEqual(recordCounts);
    expect(validationCalls).toBe(1);
    expect(entities.PlanningAuditEvent.records.filter(
      item => item.action === "assign_and_merge_task_shift_partition",
    )).toHaveLength(1);
  });

  it("finaliseert een geaudite assign-and-merge na final-markercrash automatisch bij bootstrap", async () => {
    const fixture = await prepareAssignedTaskPartition({ key: "partition-assign-merge-bootstrap" });
    const { base44, entities, payload } = fixture;
    const originalShiftUpdateMany = entities.PlanningShift.updateMany.bind(entities.PlanningShift);
    let failFinalMarkerOnce = true;
    entities.PlanningShift.updateMany = async (query, update) => {
      if (
        failFinalMarkerOnce
        && update?.$set?.metadata?.task_partition_mutation?.action === "assign_and_merge_task_shift_partition"
        && update.$set.metadata.task_partition_mutation.phase === "completed"
      ) {
        failFinalMarkerOnce = false;
        throw new Error("simulated assign-and-merge final-marker failure");
      }
      return originalShiftUpdateMany(query, update);
    };

    await expect(backend.assignAndMergeTaskShiftPartition(
      base44,
      user,
      payload,
      context("partition-assign-merge-bootstrap-action"),
    )).rejects.toThrow("simulated assign-and-merge final-marker failure");
    const audit = entities.PlanningAuditEvent.records.find(item => (
      item.action === "assign_and_merge_task_shift_partition"
      && item.idempotency_key === "partition-assign-merge-bootstrap-action"
    ));
    expect(audit).toBeTruthy();

    const bootstrap = await backend.bootstrapRange(base44, user, {
      period_start: "2026-08-17",
      period_end: "2026-08-17",
    }, context("partition-assign-merge-bootstrap-open"));

    expect(bootstrap.task_partition_recovery).toEqual([
      expect.objectContaining({
        action: "assign_and_merge_task_shift_partition",
        status: "completed",
        audit_event_id: audit.id,
      }),
    ]);
    const participants = entities.PlanningShift.records.filter(item => (
      item.metadata?.task_partition_mutation?.idempotency_key === "partition-assign-merge-bootstrap-action"
    ));
    expect(participants).toHaveLength(2);
    expect(participants.every(item => (
      item.metadata.task_partition_mutation.phase === "completed"
      && item.metadata.task_partition_mutation.audit_event_id === audit.id
    ))).toBe(true);
    expect(entities.PlanningAuditEvent.records.filter(item => (
      item.action === "assign_and_merge_task_shift_partition"
    ))).toHaveLength(1);
  });

  it("vervolgt assign-and-merge na een fout tussen het annuleren en verwijderen zonder dekkingsverlies", async () => {
    const fixture = await prepareAssignedTaskPartition({ key: "partition-assign-merge-partial" });
    const { base44, entities, demand, targetShift, targetSegment, adjacentShift, payload } = fixture;
    const originalSegmentUpdate = entities.PlanningShiftTaskSegment.updateMany.bind(
      entities.PlanningShiftTaskSegment,
    );
    let failRemovalOnce = true;
    entities.PlanningShiftTaskSegment.updateMany = async (query, update) => {
      if (
        failRemovalOnce
        && query.id === targetSegment.id
        && update.$set?.status === "removed"
      ) {
        failRemovalOnce = false;
        throw new Error("tijdelijke segmentwritefout");
      }
      return originalSegmentUpdate(query, update);
    };

    await expect(backend.assignAndMergeTaskShiftPartition(
      base44,
      user,
      payload,
      context("partition-assign-merge-partial-action"),
    )).rejects.toThrow("tijdelijke segmentwritefout");
    expect((await entities.PlanningShift.get(targetShift.id))).toMatchObject({
      status: "cancelled",
      metadata: { task_partition_mutation: { phase: "assign_merge_pending" } },
    });
    expect((await entities.PlanningShiftTaskSegment.get(targetSegment.id)).status).toBe("draft");

    const recovered = await backend.assignAndMergeTaskShiftPartition(
      base44,
      user,
      payload,
      context("partition-assign-merge-partial-action"),
    );
    expect(recovered.shift).toMatchObject({ id: adjacentShift.id, start_time: "06:30", end_time: "18:00" });
    expect((await entities.PlanningShiftTaskSegment.get(targetSegment.id)).status).toBe("removed");
    expect(backend.occurrenceCoverage(
      demand,
      entities.PlanningShiftTaskSegment.records,
      entities.PlanningShift.records,
    )).toMatchObject({ coverage_status: "full", allocated_minutes: 690 });
    expect(entities.PlanningShift.records).toHaveLength(2);
    expect(entities.PlanningShiftTaskSegment.records).toHaveLength(2);
    expect(entities.PlanningAssignment.records).toHaveLength(1);
  });

  it("voegt een open nachtdienstdeel over de kalendergrens terug bij dezelfde medewerker", async () => {
    const fixture = await prepareAssignedTaskPartition({
      key: "partition-assign-merge-night",
      startTime: "22:00",
      endTime: "06:00",
      splitTime: "02:00",
    });
    let validationCalls = 0;
    fixture.base44.asServiceRole.functions.invoke = async () => {
      validationCalls += 1;
      return {};
    };

    const result = await backend.assignAndMergeTaskShiftPartition(
      fixture.base44,
      user,
      fixture.payload,
      context("partition-assign-merge-night-action"),
    );

    expect(result.shift).toMatchObject({
      service_date: "2026-08-17",
      end_date: "2026-08-18",
      start_time: "22:00",
      end_time: "06:00",
      duration_minutes: 480,
    });
    expect(result.segment).toMatchObject({
      start_date: "2026-08-17",
      end_date: "2026-08-18",
      start_time: "22:00",
      end_time: "06:00",
    });
    expect(validationCalls).toBe(2);
    expect(fixture.entities.PlanningMutationCoordinator.records
      .filter(item => item.resource_type === "personnel_day")
      .map(item => item.resource_id)
      .sort()).toEqual([
      `${fixture.personnelId}:2026-08-16`,
      `${fixture.personnelId}:2026-08-17`,
      `${fixture.personnelId}:2026-08-18`,
      `${fixture.personnelId}:2026-08-19`,
      `week:${fixture.personnelId}:2026-08-17`,
    ]);
  });

  it("weigert stale assign-and-merge revisies vóór businesswrites en medewerkercontrole", async () => {
    const fixture = await prepareAssignedTaskPartition({ key: "partition-assign-merge-stale" });
    const { base44, entities, payload } = fixture;
    let validationCalls = 0;
    base44.asServiceRole.functions.invoke = async () => {
      validationCalls += 1;
      return {};
    };
    const before = structuredClone({
      shifts: entities.PlanningShift.records,
      segments: entities.PlanningShiftTaskSegment.records,
      assignments: entities.PlanningAssignment.records,
      occurrences: entities.PlanningTaskOccurrence.records,
      audits: entities.PlanningAuditEvent.records,
    });

    await expect(backend.assignAndMergeTaskShiftPartition(base44, user, {
      ...payload,
      expected_target_shift_revision: payload.expected_target_shift_revision + 1,
    }, context("partition-assign-merge-stale-action"))).rejects.toMatchObject({ status: 409 });
    expect({
      shifts: entities.PlanningShift.records,
      segments: entities.PlanningShiftTaskSegment.records,
      assignments: entities.PlanningAssignment.records,
      occurrences: entities.PlanningTaskOccurrence.records,
      audits: entities.PlanningAuditEvent.records,
    }).toEqual(before);
    expect(validationCalls).toBe(0);
  });

  it.each([
    {
      label: "gepubliceerde companion",
      mutate: fixture => { fixture.entities.PlanningShift.records.find(item => item.id === fixture.targetShift.id).published_revision = 1; },
      code: "TASK_PARTITION_DRAFT_REQUIRED",
    },
    {
      label: "required_count groter dan een",
      mutate: fixture => { fixture.entities.PlanningShift.records.find(item => item.id === fixture.targetShift.id).required_count = 2; },
      code: "TASK_PARTITION_REQUIRED_COUNT_ONE",
    },
    {
      label: "meervoudige taakdienst",
      mutate: fixture => { fixture.entities.PlanningShift.records.find(item => item.id === fixture.targetShift.id).task_segment_count = 2; },
      code: "TASK_PARTITION_SINGLE_TASK_REQUIRED",
    },
    {
      label: "intussen bezette companion",
      mutate: fixture => {
        fixture.entities.PlanningAssignment.records.push({
          id: `assignment-occupied-${fixture.targetShift.id}`,
          shift_id: fixture.targetShift.id,
          slot_index: 0,
          personnel_id: "personnel-other",
          status: "draft",
          revision: 1,
          published_revision: 0,
        });
      },
      code: "TASK_PARTITION_ASSIGNMENT_STATE_CHANGED",
    },
  ])("faalt gesloten bij $label", async ({ mutate, code }) => {
    const fixture = await prepareAssignedTaskPartition({ key: `partition-assign-merge-${code}` });
    mutate(fixture);
    let validationCalls = 0;
    fixture.base44.asServiceRole.functions.invoke = async () => {
      validationCalls += 1;
      return {};
    };
    const before = structuredClone({
      shifts: fixture.entities.PlanningShift.records,
      segments: fixture.entities.PlanningShiftTaskSegment.records,
      assignments: fixture.entities.PlanningAssignment.records,
      occurrences: fixture.entities.PlanningTaskOccurrence.records,
    });

    await expect(backend.assignAndMergeTaskShiftPartition(
      fixture.base44,
      user,
      fixture.payload,
      context(`partition-assign-merge-fail-${code}`),
    )).rejects.toMatchObject({ status: 409, details: { code } });
    expect({
      shifts: fixture.entities.PlanningShift.records,
      segments: fixture.entities.PlanningShiftTaskSegment.records,
      assignments: fixture.entities.PlanningAssignment.records,
      occurrences: fixture.entities.PlanningTaskOccurrence.records,
    }).toEqual(before);
    expect(validationCalls).toBe(0);
  });

  it("weigert een samengevoegde bezetting langer dan twaalf uur", async () => {
    const fixture = await prepareAssignedTaskPartition({ key: "partition-assign-merge-max-duration" });
    const targetShift = fixture.entities.PlanningShift.records.find(item => item.id === fixture.targetShift.id);
    const targetSegment = fixture.entities.PlanningShiftTaskSegment.records.find(item => item.id === fixture.targetSegment.id);
    Object.assign(targetShift, { end_time: "20:30", duration_minutes: 300 });
    Object.assign(targetSegment, { end_time: "20:30", duration_minutes: 300 });
    const before = structuredClone({
      shifts: fixture.entities.PlanningShift.records,
      segments: fixture.entities.PlanningShiftTaskSegment.records,
      assignments: fixture.entities.PlanningAssignment.records,
    });

    await expect(backend.assignAndMergeTaskShiftPartition(
      fixture.base44,
      user,
      fixture.payload,
      context("partition-assign-merge-max-duration-action"),
    )).rejects.toMatchObject({
      status: 409,
      details: {
        code: "TASK_PARTITION_MAX_ASSIGNED_DURATION_EXCEEDED",
        maximum_duration_minutes: 720,
      },
    });
    expect({
      shifts: fixture.entities.PlanningShift.records,
      segments: fixture.entities.PlanningShiftTaskSegment.records,
      assignments: fixture.entities.PlanningAssignment.records,
    }).toEqual(before);
  });

  it("kopieert deterministisch en replayt na verloren response de finalized reeks en occurrence", async () => {
    const source = {
      ...occurrence("occurrence-copy-night", "object-1", "22:00", "06:00", 480),
      end_date: "2026-08-18",
      object_task_definition_id: "definition-copy-night",
    };
    const { base44, entities } = setup([source]);
    entities.ObjectTaskDefinition.records.push({
      id: "definition-copy-night",
      customer_id: "customer-1",
      object_id: "object-1",
      task_type: "reception",
      execution_mode: "continuous",
      instructions: "Actuele nachtinstructie",
      status: "active",
      version: 7,
    });
    const payload = {
      source_occurrence_id: source.id,
      expected_source_occurrence_revision: 1,
      target_service_date: "2099-08-24",
    };

    const first = await backend.copyTaskOccurrence(
      base44,
      user,
      payload,
      context("copy-task-occurrence-first"),
    );
    const replay = await backend.copyTaskOccurrence(
      base44,
      user,
      payload,
      context("copy-task-occurrence-first"),
    );

    expect(first.task_occurrence).toMatchObject({
      service_date: "2099-08-24",
      end_date: "2099-08-25",
      window_start_time: "22:00",
      window_end_time: "06:00",
      required_minutes: 480,
      definition_version: 7,
      lifecycle_status: "active",
    });
    expect(first.schedule_revision).toMatchObject({
      recurrence_type: "one_time",
      effective_from: "2099-08-24",
      recurrence_end_date: "2099-08-24",
    });
    expect(first.shifts).toEqual([]);
    expect(first.segments).toEqual([]);
    expect(first.assignments).toEqual([]);
    expect(first.exceptions).toEqual([]);
    expect(replay).toMatchObject({ idempotent: true, audit_event_id: first.audit_event_id });
    expect(replay.definition).toEqual(await entities.ObjectTaskDefinition.get(first.definition.id));
    expect(replay.series).toEqual(await entities.ObjectTaskScheduleSeries.get(first.series.id));
    expect(replay.schedule_revision).toEqual(await entities.ObjectTaskScheduleRevision.get(first.schedule_revision.id));
    expect(replay.task_occurrence).toEqual(await entities.PlanningTaskOccurrence.get(first.task_occurrence.id));
    expect(replay.task_occurrences).toEqual([replay.task_occurrence]);
    expect(replay.series.metadata?.copy_task_occurrence_mutation).toMatchObject({
      phase: "completed",
      audit_event_id: first.audit_event_id,
    });
    expect(replay.task_occurrence.metadata?.copy_task_occurrence_mutation).toMatchObject({
      phase: "completed",
      audit_event_id: first.audit_event_id,
    });
    const second = await backend.copyTaskOccurrence(
      base44,
      user,
      payload,
      context("copy-task-occurrence-second"),
    );
    expect(second.task_occurrence.id).toBe(first.task_occurrence.id);
    expect(second.series.id).toBe(first.series.id);
    expect(second.deduplicated).toBe(true);
    const auditCountAfterSecondCopy = entities.PlanningAuditEvent.records.length;
    const lateFirstReplay = await backend.copyTaskOccurrence(
      base44,
      user,
      payload,
      context("copy-task-occurrence-first"),
    );
    expect(lateFirstReplay).toMatchObject({
      idempotent: true,
      audit_event_id: first.audit_event_id,
    });
    expect(lateFirstReplay.series).toEqual(await entities.ObjectTaskScheduleSeries.get(first.series.id));
    expect(lateFirstReplay.task_occurrence).toEqual(
      await entities.PlanningTaskOccurrence.get(first.task_occurrence.id),
    );
    expect(entities.PlanningAuditEvent.records).toHaveLength(auditCountAfterSecondCopy);
    expect(entities.ObjectTaskScheduleSeries.records).toHaveLength(1);
    expect(entities.ObjectTaskScheduleRevision.records).toHaveLength(1);
    expect(entities.PlanningTaskOccurrence.records.filter(
      item => item.metadata?.copy_identity === `${source.id}:2099-08-24`,
    )).toHaveLength(1);
    expect(entities.PlanningShift.records).toEqual([]);
    expect(entities.PlanningAssignment.records).toEqual([]);
    expect(entities.ObjectTaskScheduleException.records).toEqual([]);
  });

  it("herstelt een taakkopie na audituitval automatisch bij bootstrap", async () => {
    const source = {
      ...occurrence("occurrence-copy-audit-bootstrap", "object-1", "10:00", "18:00", 480),
      object_task_definition_id: "definition-copy-audit-bootstrap",
    };
    const { base44, entities } = setup([source]);
    entities.ObjectTaskDefinition.records.push({
      id: "definition-copy-audit-bootstrap",
      customer_id: "customer-1",
      object_id: "object-1",
      task_type: "reception",
      execution_mode: "continuous",
      status: "active",
      version: 1,
    });
    const payload = {
      source_occurrence_id: source.id,
      expected_source_occurrence_revision: 1,
      target_service_date: "2099-08-24",
    };
    const originalAuditCreate = entities.PlanningAuditEvent.create.bind(entities.PlanningAuditEvent);
    let failAuditOnce = true;
    entities.PlanningAuditEvent.create = async data => {
      if (failAuditOnce && data.action === "copy_task_occurrence") {
        failAuditOnce = false;
        throw new Error("simulated copy audit failure");
      }
      return originalAuditCreate(data);
    };

    await expect(backend.copyTaskOccurrence(
      base44,
      user,
      payload,
      context("copy-audit-bootstrap-action"),
    )).rejects.toThrow("simulated copy audit failure");
    expect(entities.PlanningAuditEvent.records.filter(item => (
      item.action === "copy_task_occurrence"
    ))).toHaveLength(0);
    expect(entities.ObjectTaskScheduleSeries.records[0].metadata.copy_task_occurrence_mutation)
      .toMatchObject({ phase: "state_written_audit_pending" });

    const bootstrap = await backend.bootstrapRange(base44, user, {
      period_start: "2099-08-24",
      period_end: "2099-08-24",
    }, context("copy-audit-bootstrap-open"));

    expect(bootstrap.copy_task_occurrence_recovery).toEqual([
      expect.objectContaining({ status: "completed" }),
    ]);
    const audit = entities.PlanningAuditEvent.records.find(item => (
      item.action === "copy_task_occurrence"
    ));
    expect(audit).toBeTruthy();
    expect(entities.ObjectTaskScheduleSeries.records[0].metadata.copy_task_occurrence_mutation)
      .toMatchObject({ phase: "completed", audit_event_id: audit.id });
    const copiedOccurrence = entities.PlanningTaskOccurrence.records.find(item => (
      item.metadata?.copy_identity === `${source.id}:2099-08-24`
    ));
    expect(copiedOccurrence.metadata.copy_task_occurrence_mutation)
      .toMatchObject({ phase: "completed", audit_event_id: audit.id });
    expect(entities.PlanningAuditEvent.records.filter(item => (
      item.action === "copy_task_occurrence"
    ))).toHaveLength(1);
  });

  it("herstelt een geaudite taakkopie na series-final-markercrash automatisch bij bootstrap", async () => {
    const source = {
      ...occurrence("occurrence-copy-bootstrap-recovery", "object-1", "10:00", "18:00", 480),
      object_task_definition_id: "definition-copy-bootstrap-recovery",
    };
    const { base44, entities } = setup([source]);
    entities.ObjectTaskDefinition.records.push({
      id: "definition-copy-bootstrap-recovery",
      customer_id: "customer-1",
      object_id: "object-1",
      task_type: "reception",
      execution_mode: "continuous",
      status: "active",
      version: 1,
    });
    const payload = {
      source_occurrence_id: source.id,
      expected_source_occurrence_revision: 1,
      target_service_date: "2099-08-24",
    };
    const originalSeriesUpdateMany = entities.ObjectTaskScheduleSeries.updateMany
      .bind(entities.ObjectTaskScheduleSeries);
    let failFinalMarkerOnce = true;
    entities.ObjectTaskScheduleSeries.updateMany = async (query, update) => {
      if (
        failFinalMarkerOnce
        && update?.$set?.metadata?.copy_task_occurrence_mutation?.phase === "completed"
      ) {
        failFinalMarkerOnce = false;
        throw new Error("simulated copy series final-marker failure");
      }
      return originalSeriesUpdateMany(query, update);
    };

    await expect(backend.copyTaskOccurrence(
      base44,
      user,
      payload,
      context("copy-bootstrap-recovery-action"),
    )).rejects.toThrow("simulated copy series final-marker failure");
    const audit = entities.PlanningAuditEvent.records.find(item => (
      item.action === "copy_task_occurrence"
      && item.idempotency_key === "copy-bootstrap-recovery-action"
    ));
    expect(audit).toBeTruthy();
    const pendingSeries = entities.ObjectTaskScheduleSeries.records[0];
    expect(pendingSeries.metadata.copy_task_occurrence_mutation).toMatchObject({
      phase: "state_written_audit_pending",
      idempotency_key: "copy-bootstrap-recovery-action",
    });

    const bootstrap = await backend.bootstrapRange(base44, user, {
      period_start: "2099-08-24",
      period_end: "2099-08-24",
    }, context("copy-bootstrap-recovery-open"));

    expect(bootstrap.copy_task_occurrence_recovery).toEqual([
      expect.objectContaining({ status: "completed", audit_event_id: audit.id }),
    ]);
    const recoveredSeries = await entities.ObjectTaskScheduleSeries.get(pendingSeries.id);
    expect(recoveredSeries.metadata.copy_task_occurrence_mutation).toMatchObject({
      phase: "completed",
      audit_event_id: audit.id,
    });
    const copiedOccurrence = entities.PlanningTaskOccurrence.records.find(item => (
      item.metadata?.copy_identity === `${source.id}:2099-08-24`
    ));
    expect(copiedOccurrence.metadata.copy_task_occurrence_mutation).toMatchObject({
      phase: "completed",
      audit_event_id: audit.id,
    });
    expect(entities.PlanningAuditEvent.records.filter(item => (
      item.action === "copy_task_occurrence"
    ))).toHaveLength(1);
  });

  it("weigert een occurrence-kopie met stale bronrevision vóór writes", async () => {
    const source = {
      ...occurrence("occurrence-copy-stale", "object-1", "10:00", "18:00", 480),
      object_task_definition_id: "definition-copy-stale",
    };
    const { base44, entities } = setup([source]);
    entities.ObjectTaskDefinition.records.push({
      id: "definition-copy-stale",
      customer_id: "customer-1",
      object_id: "object-1",
      task_type: "reception",
      execution_mode: "continuous",
      status: "active",
      version: 1,
    });

    await expect(backend.copyTaskOccurrence(base44, user, {
      source_occurrence_id: source.id,
      expected_source_occurrence_revision: 2,
      target_service_date: "2099-08-24",
    }, context("copy-task-occurrence-stale"))).rejects.toMatchObject({ status: 409 });
    expect(entities.ObjectTaskScheduleSeries.records).toEqual([]);
    expect(entities.ObjectTaskScheduleRevision.records).toEqual([]);
    expect(entities.PlanningTaskOccurrence.records).toEqual([source]);
  });
});

describe("planningApi medewerker/dag-reserveringen", () => {
  it("herstelt een nachtdienst onder beide dagleases en ververst de medewerkerstatus finaal", async () => {
    const { base44, entities } = setup([]);
    entities.PlanningShift.records.push({
      id: "shift-night-restore",
      source_key: "manual-night-restore",
      source_type: "manual",
      service_name_snapshot: "Nachtdienst",
      service_date: "2026-08-17",
      end_date: "2026-08-18",
      start_time: "22:00",
      end_time: "02:00",
      required_count: 1,
      status: "draft",
      revision: 1,
      published_revision: 0,
    });
    entities.PlanningAssignment.records.push({
      id: "assignment-night-restore",
      shift_id: "shift-night-restore",
      slot_index: 0,
      personnel_id: "personnel-night",
      personnel_name_snapshot: "Nacht Beveiliger",
      status: "removed",
      warning_codes: [],
      warning_snapshot: [],
      has_critical_warnings: false,
      revision: 1,
      published_revision: 0,
    });
    entities.Personnel.records.push({ id: "personnel-night", name: "Nacht Beveiliger", status: "active" });
    const originalAssignmentUpdateMany = entities.PlanningAssignment.updateMany.bind(entities.PlanningAssignment);
    let deactivateAfterRestoreWrite = true;
    entities.PlanningAssignment.updateMany = async (query, update) => {
      const response = await originalAssignmentUpdateMany(query, update);
      if (deactivateAfterRestoreWrite && update.$set?.status === "draft") {
        deactivateAfterRestoreWrite = false;
        entities.Personnel.records[0].status = "inactive";
      }
      return response;
    };

    const result = await backend.restoreAssignment(base44, user, {
      assignment_id: "assignment-night-restore",
      expected_shift_revision: 1,
    }, context("restore-night-assignment"));

    expect(result.assignment).toMatchObject({
      status: "draft",
      has_critical_warnings: true,
      warning_codes: expect.arrayContaining(["personnel_not_active"]),
    });
    expect(result.assignment.metadata?.final_assignment_validation_at).toBeTruthy();
    expect(entities.PlanningMutationCoordinator.records
      .filter(item => item.resource_type === "personnel_day")
      .map(item => item.resource_id)
      .sort()).toEqual([
        "personnel-night:2026-08-16",
        "personnel-night:2026-08-17",
        "personnel-night:2026-08-18",
        "personnel-night:2026-08-19",
        "week:personnel-night:2026-08-17",
      ]);
  });

  it("reserveert bij verplaatsen alle oude en nieuwe kalenderdagen van actieve medewerkers", async () => {
    const { base44, entities } = setup([]);
    entities.PlanningShift.records.push({
      id: "shift-night-move",
      source_key: "manual-night-move",
      source_type: "manual",
      service_name_snapshot: "Verplaatsbare nachtdienst",
      service_date: "2026-08-17",
      end_date: "2026-08-18",
      start_time: "22:00",
      end_time: "02:00",
      required_count: 1,
      status: "draft",
      revision: 1,
      published_revision: 0,
    });
    entities.PlanningAssignment.records.push({
      id: "assignment-night-move",
      shift_id: "shift-night-move",
      slot_index: 0,
      personnel_id: "personnel-night",
      personnel_name_snapshot: "Nacht Beveiliger",
      status: "draft",
      warning_codes: [],
      warning_snapshot: [],
      has_critical_warnings: false,
      revision: 1,
      published_revision: 0,
    });
    entities.Personnel.records.push({ id: "personnel-night", name: "Nacht Beveiliger", status: "active" });

    const result = await backend.moveShift(base44, user, {
      shift_id: "shift-night-move",
      expected_shift_revision: 1,
      service_date: "2026-08-19",
      end_date: "2026-08-20",
    }, context("move-night-shift"));

    expect(result.shift).toMatchObject({ service_date: "2026-08-19", end_date: "2026-08-20" });
    expect(entities.PlanningMutationCoordinator.records
      .filter(item => item.resource_type === "personnel_day")
      .map(item => item.resource_id)
      .sort()).toEqual([
        "personnel-night:2026-08-16",
        "personnel-night:2026-08-17",
        "personnel-night:2026-08-18",
        "personnel-night:2026-08-19",
        "personnel-night:2026-08-20",
        "personnel-night:2026-08-21",
        "week:personnel-night:2026-08-17",
      ]);
  });

  it("laat ook een undo die een assignment activeert via dezelfde daglease lopen", async () => {
    const { base44, entities } = setup([]);
    const shift = {
      id: "shift-undo-restore",
      source_key: "manual-undo-restore",
      source_type: "manual",
      service_name_snapshot: "Undo-nachtdienst",
      service_date: "2026-08-19",
      end_date: "2026-08-20",
      start_time: "22:00",
      end_time: "02:00",
      required_count: 1,
      status: "draft",
      revision: 1,
      published_revision: 0,
    };
    const removedAssignment = {
      id: "assignment-undo-restore",
      shift_id: shift.id,
      slot_index: 0,
      personnel_id: "personnel-night",
      personnel_name_snapshot: "Nacht Beveiliger",
      status: "removed",
      warning_codes: [],
      warning_snapshot: [],
      has_critical_warnings: false,
      revision: 1,
      published_revision: 0,
    };
    entities.PlanningShift.records.push(structuredClone(shift));
    entities.PlanningAssignment.records.push(structuredClone(removedAssignment));
    entities.Personnel.records.push({ id: "personnel-night", name: "Nacht Beveiliger", status: "active" });
    entities.PlanningAuditEvent.records.push({
      id: "audit-unassign-source",
      action: "unassign",
      resource_type: "PlanningAssignment",
      resource_id: removedAssignment.id,
      shift_id: shift.id,
      assignment_id: removedAssignment.id,
      undoable: true,
      undo_token: "undo-token-night",
      undo_payload: {
        action: "restore_assignment",
        shift_id: shift.id,
        assignment_id: removedAssignment.id,
        previous_shift: structuredClone(shift),
        previous_assignment: { ...structuredClone(removedAssignment), status: "draft" },
      },
    });

    const result = await backend.undoPlanning(base44, user, {
      audit_event_id: "audit-unassign-source",
      undo_token: "undo-token-night",
      expected_shift_revision: 1,
    }, context("undo-restores-night-assignment"));

    expect(result.assignment.status).toBe("draft");
    expect(entities.PlanningMutationCoordinator.records
      .filter(item => item.resource_type === "personnel_day")
      .map(item => item.resource_id)
      .sort()).toEqual([
        "personnel-night:2026-08-18",
        "personnel-night:2026-08-19",
        "personnel-night:2026-08-20",
        "personnel-night:2026-08-21",
        "week:personnel-night:2026-08-17",
      ]);
  });
});

describe("planningApi bootstrap snapshots", () => {
  it("leest occurrence-, segment- en dienstsnapshot aan het einde gelijktijdig", async () => {
    const { base44, entities } = setup([]);
    let enteredFinalReadCount = 0;
    let resolveAllFinalReadsEntered;
    let releaseFinalReads;
    const allFinalReadsEntered = new Promise(resolve => { resolveAllFinalReadsEntered = resolve; });
    const finalReadsReleased = new Promise(resolve => { releaseFinalReads = resolve; });
    const finalReadCallCounts = new Map();

    for (const [name, target] of [
      ["PlanningTaskOccurrence", entities.PlanningTaskOccurrence],
      ["PlanningShiftTaskSegment", entities.PlanningShiftTaskSegment],
      ["PlanningShift", entities.PlanningShift],
    ]) {
      const originalList = target.list.bind(target);
      target.list = async (...args) => {
        const callCount = Number(finalReadCallCounts.get(name) || 0) + 1;
        finalReadCallCounts.set(name, callCount);
        if (callCount === 2) {
          enteredFinalReadCount += 1;
          if (enteredFinalReadCount === 3) resolveAllFinalReadsEntered();
          await finalReadsReleased;
        }
        return originalList(...args);
      };
    }

    const pending = backend.bootstrapRange(base44, user, {
      period_start: "2026-08-17",
      period_end: "2026-08-17",
    }, context("bootstrap-parallel-final-snapshots"));
    const allEnteredBeforeRelease = await Promise.race([
      allFinalReadsEntered.then(() => true),
      new Promise(resolve => setTimeout(() => resolve(false), 250)),
    ]);
    releaseFinalReads();
    await pending;

    expect(allEnteredBeforeRelease).toBe(true);
    expect(Object.fromEntries(finalReadCallCounts)).toEqual({
      PlanningTaskOccurrence: 2,
      PlanningShiftTaskSegment: 2,
      PlanningShift: 2,
    });
  });
});

describe("planningApi ingangsdatum van wekelijkse objecttaken", () => {
  it("maakt voor een maandag-vrijdagtaak vanaf 17 augustus geen planningskaarten in de week ervoor", async () => {
    const definition = weeklyReceptionDefinitionStartingAugust17();
    const { base44, entities } = setup([]);
    entities.ObjectTaskDefinition.records.push(structuredClone(definition));

    const result = await backend.bootstrapRange(base44, user, {
      period_start: "2026-08-10",
      period_end: "2026-08-21",
    }, context("bootstrap-weekly-task-from-august-17"));

    const activeOccurrences = entities.PlanningTaskOccurrence.records
      .filter(item => (
        item.object_task_definition_id === definition.id
        && item.lifecycle_status === "active"
      ))
      .sort((left, right) => left.service_date.localeCompare(right.service_date));
    expect(activeOccurrences.map(item => item.service_date)).toEqual([
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
    ]);
    expect(activeOccurrences.some(item => (
      item.service_date >= "2026-08-10" && item.service_date <= "2026-08-14"
    ))).toBe(false);
    expect(result.created_task_occurrence_count).toBe(5);

    const replay = await backend.bootstrapRange(base44, user, {
      period_start: "2026-08-10",
      period_end: "2026-08-21",
    }, context("bootstrap-weekly-task-from-august-17-again"));
    expect(replay.created_task_occurrence_count).toBe(0);
    expect(entities.PlanningTaskOccurrence.records.filter(item => (
      item.object_task_definition_id === definition.id
      && item.lifecycle_status === "active"
    ))).toHaveLength(5);
  });

  it("supersedeert een eerder foutief gematerialiseerde occurrence van voor de ingangsdatum", async () => {
    const definition = weeklyReceptionDefinitionStartingAugust17();
    const tooEarlyOccurrence = {
      ...occurrence("occurrence-too-early", "object-1", "06:30", "18:00", 690),
      source_key: `object-task:${definition.id}:series-1:2026-08-10`,
      object_task_definition_id: definition.id,
      definition_version: definition.version,
      schedule_period_key: "series-1",
      service_date: "2026-08-10",
      end_date: "2026-08-10",
    };
    const { base44, entities } = setup([tooEarlyOccurrence]);
    entities.ObjectTaskDefinition.records.push(structuredClone(definition));

    const result = await backend.bootstrapRange(base44, user, {
      period_start: "2026-08-10",
      period_end: "2026-08-21",
    }, context("reconcile-too-early-weekly-task-occurrence"));

    expect(await entities.PlanningTaskOccurrence.get(tooEarlyOccurrence.id)).toMatchObject({
      lifecycle_status: "superseded",
    });
    expect(result.superseded_task_occurrence_ids).toContain(tooEarlyOccurrence.id);
    expect(entities.PlanningTaskOccurrence.records
      .filter(item => (
        item.object_task_definition_id === definition.id
        && item.lifecycle_status === "active"
      ))
      .map(item => item.service_date)
      .sort()).toEqual([
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
    ]);
  });

  it("maakt voor een ingeplande legacy occurrence vóór valid_from een open bronwijziging met de moderne revisie", async () => {
    const definition = weeklyReceptionDefinitionStartingAugust17();
    const modernSeries = {
      id: "series-reception-from-august-17",
      series_key: "ots-reception-from-august-17",
      customer_id: "customer-1",
      object_id: "object-1",
      object_task_definition_id: definition.id,
      current_revision_id: "revision-reception-from-august-17",
      current_revision_number: 1,
      status: "active",
      timezone: "Europe/Amsterdam",
      version: 1,
    };
    const modernRevision = {
      id: modernSeries.current_revision_id,
      series_id: modernSeries.id,
      customer_id: "customer-1",
      object_id: "object-1",
      object_task_definition_id: definition.id,
      revision_number: 1,
      operation: "schedule",
      effective_from: "2026-08-17",
      recurrence_type: "weekly",
      weekday: 1,
      start_time: "06:30",
      end_time: "18:00",
      end_day_offset: 0,
      recurrence_end_date: null,
      required_minutes: 690,
      task_snapshot: {
        task_type: "reception",
        execution_mode: "continuous",
      },
    };
    const tooEarlyOccurrence = withPublishedSecurityPlan({
      ...occurrence("occurrence-planned-too-early", "object-1", "06:30", "18:00", 690),
      source_key: `object-task:${definition.id}:series-1:2026-08-10`,
      object_task_definition_id: definition.id,
      definition_version: definition.version,
      schedule_period_key: "series-1",
      service_date: "2026-08-10",
      end_date: "2026-08-10",
    });
    const { base44, entities } = setup([tooEarlyOccurrence]);
    entities.ObjectTaskDefinition.records.push(structuredClone(definition));
    entities.ObjectTaskScheduleSeries.records.push(structuredClone(modernSeries));
    entities.ObjectTaskScheduleRevision.records.push(structuredClone(modernRevision));
    const composition = await backend.composeShift(base44, user, {
      segments: [{
        task_occurrence_id: tooEarlyOccurrence.id,
        start_time: "06:30",
        end_time: "18:00",
      }],
      expected_occurrence_revisions: { [tooEarlyOccurrence.id]: tooEarlyOccurrence.revision },
    }, context("compose-too-early-legacy-occurrence"));

    const result = await backend.bootstrapRange(base44, user, {
      period_start: "2026-08-10",
      period_end: "2026-08-17",
    }, context("reconcile-planned-too-early-legacy-occurrence"));

    expect(await entities.PlanningTaskOccurrence.get(tooEarlyOccurrence.id)).toMatchObject({
      lifecycle_status: "active",
    });
    expect(result.superseded_task_occurrence_ids).not.toContain(tooEarlyOccurrence.id);
    expect(result.task_source_change_ids).toHaveLength(1);
    expect(entities.PlanningTaskSourceChange.records).toEqual([
      expect.objectContaining({
        id: result.task_source_change_ids[0],
        status: "open",
        change_type: "schedule_stopped",
        schedule_series_id: modernSeries.id,
        schedule_revision_id: modernRevision.id,
        task_occurrence_id: tooEarlyOccurrence.id,
        source_task_occurrence_id: tooEarlyOccurrence.id,
        replacement_task_occurrence_id: null,
        shift_id: composition.shift.id,
        shift_ids: [composition.shift.id],
        effective_from: modernRevision.effective_from,
      }),
    ]);

    await expect(backend.publishPlanning(base44, user, {
      scope_type: "selection",
      shift_ids: [composition.shift.id],
      expected_shift_revisions: { [composition.shift.id]: composition.shift.revision },
      publication_reason: "Vroege legacytaak moet eerst worden herpland",
    }, context("publish-with-too-early-legacy-occurrence"))).rejects.toMatchObject({
      status: 409,
      details: {
        code: "TASK_SOURCE_CHANGE_REQUIRES_REPLAN",
        source_change_ids: result.task_source_change_ids,
        shift_ids: [composition.shift.id],
        task_occurrence_ids: [tooEarlyOccurrence.id],
      },
    });
  });
});

describe("planningApi legacy occurrence-reconciliatie", () => {
  it("maakt na opslag van een stabiele period_key geen duplicaat voor een reeds ingeplande legacy occurrence", async () => {
    const definition = {
      id: "definition-legacy",
      customer_id: "customer-1",
      object_id: "object-1",
      task_type: "reception",
      execution_mode: "continuous",
      recurrence_type: "weekly",
      schedule_periods: [{ days: ["mon"], start_time: "08:00", end_time: "16:00" }],
      start_time: "08:00",
      end_time: "16:00",
      duration_minutes: 480,
      status: "active",
      version: 1,
    };
    const { base44, entities } = setup([]);
    entities.ObjectTaskDefinition.records.push(structuredClone(definition));

    await backend.bootstrapRange(base44, user, {
      period_start: "2026-08-17",
      period_end: "2026-08-17",
    }, context("bootstrap-legacy-before-save"));

    const legacyOccurrence = entities.PlanningTaskOccurrence.records[0];
    expect(legacyOccurrence.source_key).toBe(
      "object-task:definition-legacy:legacy:mon:08:00:16:00:0:2026-08-17",
    );
    await backend.composeShift(base44, user, {
      segments: [{ task_occurrence_id: legacyOccurrence.id, start_time: "08:00", end_time: "16:00" }],
      expected_occurrence_revisions: { [legacyOccurrence.id]: legacyOccurrence.revision },
    }, context("compose-legacy-occurrence"));

    await entities.ObjectTaskDefinition.updateMany(
      { id: definition.id },
      {
        $set: {
          version: 2,
          schedule_periods: [{
            period_key: "period:mon:08:00:16:00",
            days: ["mon"],
            start_time: "08:00",
            end_time: "16:00",
          }],
        },
      },
    );
    const result = await backend.bootstrapRange(base44, user, {
      period_start: "2026-08-17",
      period_end: "2026-08-17",
    }, context("bootstrap-legacy-after-save"));

    const occurrencesForService = entities.PlanningTaskOccurrence.records.filter(item =>
      item.object_task_definition_id === definition.id
      && item.service_date === "2026-08-17"
      && item.lifecycle_status === "active"
    );
    expect(result.created_task_occurrence_count).toBe(0);
    expect(occurrencesForService).toHaveLength(1);
    expect(occurrencesForService[0].id).toBe(legacyOccurrence.id);
    expect(entities.PlanningShiftTaskSegment.records).toContainEqual(
      expect.objectContaining({ task_occurrence_id: legacyOccurrence.id, status: "draft" }),
    );
  });
});

describe("planningApi publicatie van taakdekking", () => {
  it("blokkeert een nieuwe reekswijziging totdat de eerdere impact ook duurzaam is geaudit", async () => {
    const { base44, entities } = setup([]);
    const created = await createWeeklyObjectTask({
      base44,
      entities,
      key: "series-impact-audit-recovery",
    });
    const scheduleSeries = created.series[0].series;
    const body = {
      customer_id: "customer-1",
      object_id: "object-1",
      task_definition_id: created.definition.id,
      series_id: scheduleSeries.id,
      effective_from: "2099-08-24",
      start_time: "08:00",
      end_time: "16:00",
      repeat_weekly: true,
      recurrence_end_date: null,
      expected_version: scheduleSeries.version,
    };
    const mutation = context("series-impact-audit-recovery");
    const originalAuditCreate = entities.PlanningAuditEvent.create
      .bind(entities.PlanningAuditEvent);
    let failAuditOnce = true;
    entities.PlanningAuditEvent.create = async data => {
      if (
        failAuditOnce
        && data.action === "change_object_task_series"
        && data.idempotency_key === mutation.idempotencyKey
      ) {
        failAuditOnce = false;
        throw new Error("simulated series audit failure");
      }
      return originalAuditCreate(data);
    };

    await expect(backend.mutateObjectTaskSeries(
      base44,
      user,
      body,
      mutation,
      "schedule",
    )).rejects.toThrow("simulated series audit failure");
    const preparedSeries = await entities.ObjectTaskScheduleSeries.get(scheduleSeries.id);
    expect(preparedSeries.metadata.object_task_series_impact_mutation).toMatchObject({
      phase: "state_written_audit_pending",
      idempotency_key: mutation.idempotencyKey,
    });
    expect((await entities.ObjectTaskDefinition.get(created.definition.id))
      .metadata.last_schedule_series_mutation).toMatchObject({
      idempotency_key: mutation.idempotencyKey,
    });

    const foreignMutation = context("series-impact-audit-foreign-key");
    await expect(backend.mutateObjectTaskSeries(
      base44,
      user,
      body,
      foreignMutation,
      "schedule",
    )).rejects.toMatchObject({
      status: 409,
      details: {
        code: "TASK_SERIES_IMPACT_RECOVERY_PENDING",
        pending_idempotency_key: mutation.idempotencyKey,
      },
    });
    expect((await entities.ObjectTaskScheduleSeries.get(scheduleSeries.id))
      .metadata.object_task_series_impact_mutation.idempotency_key).toBe(
      mutation.idempotencyKey,
    );

    const recovered = await backend.mutateObjectTaskSeries(
      base44,
      user,
      body,
      mutation,
      "schedule",
    );
    expect(recovered.series.metadata.object_task_series_impact_mutation).toMatchObject({
      phase: "impact_completed",
      idempotency_key: mutation.idempotencyKey,
      audit_event_id: recovered.audit_event_id,
    });
    expect(entities.PlanningAuditEvent.records.filter(item => (
      item.action === "change_object_task_series"
      && item.idempotency_key === mutation.idempotencyKey
    ))).toHaveLength(1);
  });

  it("finaliseert na browserreload een geaudite reeksimpact waarvan alleen de marker-CAS uitviel", async () => {
    const { base44, entities } = setup([]);
    const created = await createWeeklyObjectTask({
      base44,
      entities,
      key: "series-impact-final-marker-recovery",
    });
    const scheduleSeries = created.series[0].series;
    const body = {
      customer_id: "customer-1",
      object_id: "object-1",
      task_definition_id: created.definition.id,
      series_id: scheduleSeries.id,
      effective_from: "2099-08-24",
      start_time: "08:00",
      end_time: "16:00",
      repeat_weekly: true,
      recurrence_end_date: null,
      expected_version: scheduleSeries.version,
    };
    const mutation = context("series-impact-final-marker-recovery");
    const originalSeriesUpdateMany = entities.ObjectTaskScheduleSeries.updateMany
      .bind(entities.ObjectTaskScheduleSeries);
    let failFinalMarkerOnce = true;
    entities.ObjectTaskScheduleSeries.updateMany = async (query, update) => {
      if (
        failFinalMarkerOnce
        && update?.$set?.metadata?.object_task_series_impact_mutation?.phase
          === "impact_completed"
      ) {
        failFinalMarkerOnce = false;
        throw new Error("simulated final series impact marker failure");
      }
      return originalSeriesUpdateMany(query, update);
    };

    await expect(backend.mutateObjectTaskSeries(
      base44,
      user,
      body,
      mutation,
      "schedule",
    )).rejects.toThrow("simulated final series impact marker failure");
    const audit = entities.PlanningAuditEvent.records.find(item => (
      item.action === "change_object_task_series"
      && item.idempotency_key === mutation.idempotencyKey
    ));
    expect(audit).toBeTruthy();
    expect((await entities.ObjectTaskScheduleSeries.get(scheduleSeries.id))
      .metadata.object_task_series_impact_mutation).toMatchObject({
      phase: "state_written_audit_pending",
      idempotency_key: mutation.idempotencyKey,
    });

    const firstOpen = await backend.listObjectTasks(base44, {
      customer_id: "customer-1",
      object_id: "object-1",
    }, user);
    expect(firstOpen.series_impact_recovery).toEqual([
      expect.objectContaining({
        series_id: scheduleSeries.id,
        status: "completed",
        audit_event_id: audit.id,
      }),
    ]);
    expect((await entities.ObjectTaskScheduleSeries.get(scheduleSeries.id))
      .metadata.object_task_series_impact_mutation).toMatchObject({
      phase: "impact_completed",
      audit_event_id: audit.id,
    });

    const secondOpen = await backend.listObjectTasks(base44, {
      customer_id: "customer-1",
      object_id: "object-1",
    }, user);
    expect(secondOpen.series_impact_recovery).toEqual([]);
  });

  it("migreert een ingeplande blauwdrukwijziging direct en houdt die daarna publiceerbaar", async () => {
    const { base44, entities } = setup([]);
    const created = await createWeeklyObjectTask({
      base44,
      entities,
      key: "planned-source-change",
      withSecurityPlan: true,
    });
    await backend.bootstrapRange(base44, user, {
      period_start: "2099-08-24",
      period_end: "2099-08-24",
    }, context("bootstrap-planned-source-change"));
    const scheduledOccurrence = entities.PlanningTaskOccurrence.records.find(item => (
      item.service_date === "2099-08-24" && item.lifecycle_status === "active"
    ));
    const composition = await backend.composeShift(base44, user, {
      segments: [{
        task_occurrence_id: scheduledOccurrence.id,
        start_time: "06:30",
        end_time: "18:00",
      }],
      expected_occurrence_revisions: { [scheduledOccurrence.id]: scheduledOccurrence.revision },
    }, context("compose-before-object-task-change"));
    const scheduleSeries = created.series[0].series;

    const changed = await backend.mutateObjectTaskSeries(base44, user, {
      customer_id: "customer-1",
      object_id: "object-1",
      task_definition_id: created.definition.id,
      series_id: scheduleSeries.id,
      effective_from: "2099-08-24",
      start_time: "10:00",
      end_time: "18:00",
      repeat_weekly: true,
      recurrence_end_date: null,
      expected_version: scheduleSeries.version,
    }, context("change-planned-object-task-series"), "schedule");

    expect(changed.current_revision).toMatchObject({
      operation: "schedule",
      effective_from: "2099-08-24",
      start_time: "10:00",
      end_time: "18:00",
      revision_number: 2,
    });
    expect(changed.reconciled.source_change_ids).toEqual([]);
    expect(changed.reconciled.created_occurrence_ids).toHaveLength(1);
    const replacementOccurrenceId = changed.reconciled.created_occurrence_ids[0];
    expect(entities.PlanningTaskSourceChange.records).toEqual([]);
    expect(await entities.PlanningTaskOccurrence.get(scheduledOccurrence.id)).toMatchObject({
      lifecycle_status: "superseded",
      window_start_time: "06:30",
    });
    expect(await entities.PlanningTaskOccurrence.get(replacementOccurrenceId)).toMatchObject({
      lifecycle_status: "active",
      window_start_time: "10:00",
      supersedes_task_occurrence_id: scheduledOccurrence.id,
    });
    const migratedShift = await entities.PlanningShift.get(composition.shift.id);
    expect(migratedShift).toMatchObject({
      status: "draft",
      start_time: "10:00",
      end_time: "18:00",
      task_occurrence_ids: [replacementOccurrenceId],
    });
    expect(await entities.PlanningShiftTaskSegment.get(composition.segments[0].id)).toMatchObject({
      status: "draft",
      task_occurrence_id: replacementOccurrenceId,
      start_time: "10:00",
      end_time: "18:00",
    });

    const publication = await backend.publishPlanning(base44, user, {
      scope_type: "selection",
      shift_ids: [composition.shift.id],
      expected_shift_revisions: { [composition.shift.id]: migratedShift.revision },
      publication_reason: "Gemigreerde taakdienst is gecontroleerd",
    }, context("publish-automatically-migrated-task-source-change"));
    expect(publication.publication.snapshot.task_occurrences).toEqual([
      expect.objectContaining({ id: replacementOccurrenceId }),
    ]);
    expect(entities.PlanningPublication.records).toHaveLength(1);
  });

  it("herstelt een blauwdrukwijziging als het segment al is omgezet maar de dienstgrens nog niet", async () => {
    const { base44, entities } = setup([]);
    const created = await createWeeklyObjectTask({
      base44,
      entities,
      key: "recover-planned-series-boundary-impact",
      withSecurityPlan: true,
    });
    await backend.bootstrapRange(base44, user, {
      period_start: "2099-08-24",
      period_end: "2099-08-24",
    }, context("bootstrap-recover-planned-series-boundary-impact"));
    const sourceOccurrence = entities.PlanningTaskOccurrence.records.find(item => (
      item.service_date === "2099-08-24" && item.lifecycle_status === "active"
    ));
    const composition = await backend.composeShift(base44, user, {
      segments: [{
        task_occurrence_id: sourceOccurrence.id,
        start_time: "06:30",
        end_time: "18:00",
      }],
      expected_occurrence_revisions: { [sourceOccurrence.id]: sourceOccurrence.revision },
    }, context("compose-before-recover-planned-series-boundary-impact"));
    const scheduleSeries = created.series[0].series;
    const body = {
      customer_id: "customer-1",
      object_id: "object-1",
      task_definition_id: created.definition.id,
      series_id: scheduleSeries.id,
      effective_from: "2099-08-24",
      start_time: "10:00",
      end_time: "18:00",
      repeat_weekly: true,
      recurrence_end_date: null,
      expected_version: scheduleSeries.version,
      confirm_remove_outside_shifts: true,
    };
    const mutation = context("recover-planned-series-boundary-impact");
    const originalShiftUpdateMany = entities.PlanningShift.updateMany
      .bind(entities.PlanningShift);
    let failBoundaryShiftOnce = true;
    entities.PlanningShift.updateMany = async (query, update) => {
      if (
        failBoundaryShiftOnce
        && String(query.id) === String(composition.shift.id)
        && update?.$set?.metadata?.task_boundary_migrated_at
      ) {
        failBoundaryShiftOnce = false;
        throw new Error("simulated object-task series boundary failure");
      }
      return originalShiftUpdateMany(query, update);
    };

    await expect(backend.mutateObjectTaskSeries(
      base44,
      user,
      body,
      mutation,
      "schedule",
    )).rejects.toThrow("simulated object-task series boundary failure");
    const preparedSeries = await entities.ObjectTaskScheduleSeries.get(scheduleSeries.id);
    expect(preparedSeries.metadata.object_task_series_impact_mutation).toMatchObject({
      phase: "state_written_audit_pending",
      idempotency_key: mutation.idempotencyKey,
      linked_shift_ids: [composition.shift.id],
      occurrence_shift_ids: [{
        occurrence_id: sourceOccurrence.id,
        shift_ids: [composition.shift.id],
      }],
    });
    const partiallyMigratedSegment = await entities.PlanningShiftTaskSegment.get(
      composition.segments[0].id,
    );
    expect(partiallyMigratedSegment.task_occurrence_id).not.toBe(sourceOccurrence.id);
    expect(await entities.PlanningShift.get(composition.shift.id)).toMatchObject({
      start_time: "06:30",
      end_time: "18:00",
    });

    const preparedRevisionCount = entities.ObjectTaskScheduleRevision.records.length;
    const foreignMutation = context("foreign-series-change-during-impact-recovery");
    await expect(backend.mutateObjectTaskSeries(
      base44,
      user,
      body,
      foreignMutation,
      "schedule",
    )).rejects.toMatchObject({
      status: 409,
      details: {
        code: "TASK_SERIES_IMPACT_RECOVERY_PENDING",
        pending_idempotency_key: mutation.idempotencyKey,
      },
    });
    expect((await entities.ObjectTaskScheduleSeries.get(scheduleSeries.id))
      .metadata.object_task_series_impact_mutation).toMatchObject({
      phase: "state_written_audit_pending",
      idempotency_key: mutation.idempotencyKey,
    });
    expect(entities.ObjectTaskScheduleRevision.records).toHaveLength(preparedRevisionCount);
    expect(entities.PlanningAuditEvent.records.filter(item => (
      item.idempotency_key === foreignMutation.idempotencyKey
    ))).toHaveLength(0);

    const reopened = await backend.listObjectTasks(base44, {
      customer_id: "customer-1",
      object_id: "object-1",
    }, user);
    expect(reopened.series_impact_recovery).toEqual([
      expect.objectContaining({
        series_id: scheduleSeries.id,
        status: "recovered",
        audit_event_id: expect.any(String),
      }),
    ]);
    const replacementOccurrence = entities.PlanningTaskOccurrence.records.find(item => (
      item.lifecycle_status === "active"
      && item.object_task_schedule_series_id === scheduleSeries.id
      && item.service_date === "2099-08-24"
    ));
    expect(await entities.PlanningShift.get(composition.shift.id)).toMatchObject({
      status: "draft",
      start_time: "10:00",
      end_time: "18:00",
      task_occurrence_ids: [replacementOccurrence.id],
    });
    expect(await entities.PlanningShiftTaskSegment.get(composition.segments[0].id)).toMatchObject({
      task_occurrence_id: replacementOccurrence.id,
      start_time: "10:00",
      end_time: "18:00",
    });
    expect(await entities.ObjectTaskScheduleSeries.get(scheduleSeries.id)).toMatchObject({
      metadata: {
        object_task_series_impact_mutation: expect.objectContaining({
          phase: "impact_completed",
          idempotency_key: mutation.idempotencyKey,
        }),
      },
    });
    expect(entities.PlanningAuditEvent.records.filter(item => (
      item.action === "change_object_task_series"
      && item.idempotency_key === mutation.idempotencyKey
    ))).toHaveLength(1);
  });

  it("houdt een carry-in nachtdienst buiten periodepublicatie die op startdatum wordt begrensd", async () => {
    const { base44, entities } = setup([]);
    entities.PlanningShift.records.push(
      {
        id: "shift-carry-in",
        source_key: "manual-carry-in",
        source_type: "manual",
        service_name_snapshot: "Carry-in nachtdienst",
        service_date: "2026-08-16",
        end_date: "2026-08-17",
        start_time: "22:00",
        end_time: "02:00",
        required_count: 1,
        status: "draft",
        revision: 1,
        published_revision: 0,
      },
      {
        id: "shift-period-owned",
        source_key: "manual-period-owned",
        source_type: "manual",
        service_name_snapshot: "Maandagdienst",
        service_date: "2026-08-17",
        end_date: null,
        start_time: "08:00",
        end_time: "16:00",
        required_count: 1,
        status: "draft",
        revision: 1,
        published_revision: 0,
      },
    );

    const result = await backend.publishPlanning(base44, user, {
      scope_type: "range",
      period_start: "2026-08-17",
      period_end: "2026-08-17",
      publication_reason: "Publicatie op startdatum",
    }, context("publish-period-start-ownership"));

    expect(result.publication.snapshot.shifts.map(item => item.id)).toEqual(["shift-period-owned"]);
    expect((await entities.PlanningShift.get("shift-carry-in")).status).toBe("draft");
    expect((await entities.PlanningShift.get("shift-period-owned")).status).toBe("published");
  });

  it("vereist een expliciete reden als de gepubliceerde beveiligingsplanrevisie ontbreekt", async () => {
    const demand = occurrence("occurrence-reception", "object-1", "08:00", "16:00", 480);
    const { base44 } = setup([demand]);
    const composition = await backend.composeShift(base44, user, {
      segments: [{ task_occurrence_id: demand.id, start_time: "08:00", end_time: "16:00" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    }, context("compose-without-published-security-plan"));

    await expect(backend.publishPlanning(base44, user, {
      scope_type: "selection",
      shift_ids: [composition.shift.id],
      expected_shift_revisions: { [composition.shift.id]: composition.shift.revision },
      publication_reason: "Testpublicatie",
    }, context("publish-without-security-plan"))).rejects.toMatchObject({
      status: 409,
      details: {
        critical_warnings: expect.arrayContaining([
          expect.objectContaining({ code: "task_security_plan_revision_missing" }),
        ]),
      },
    });
  });

  it("berekent een selectiepublicatie alleen uit de segmenten in dezelfde snapshot", async () => {
    const demand = withPublishedSecurityPlan(occurrence("occurrence-reception", "object-1", "08:00", "16:00", 480));
    const { base44 } = setup([demand]);
    const morning = await backend.composeShift(base44, user, {
      segments: [{ task_occurrence_id: demand.id, start_time: "08:00", end_time: "12:00" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    }, context("compose-publication-morning"));
    const occurrenceAfterMorning = await base44.asServiceRole.entities.PlanningTaskOccurrence.get(demand.id);
    await backend.composeShift(base44, user, {
      segments: [{ task_occurrence_id: demand.id, start_time: "12:00", end_time: "16:00" }],
      expected_occurrence_revisions: { [demand.id]: occurrenceAfterMorning.revision },
    }, context("compose-publication-evening"));

    const result = await backend.publishPlanning(base44, user, {
      scope_type: "selection",
      shift_ids: [morning.shift.id],
      expected_shift_revisions: { [morning.shift.id]: morning.shift.revision },
      publication_reason: "Bewuste deelpublicatie voor regressietest",
      acknowledge_critical_warnings: true,
      critical_warning_acknowledgement_reason: "Alleen de ochtenddienst wordt nu vrijgegeven.",
    }, context("publish-morning-selection"));

    expect(result.publication.snapshot.task_segments).toHaveLength(1);
    expect(result.publication.snapshot.task_occurrences).toHaveLength(1);
    expect(result.publication.snapshot.task_occurrences[0].coverage).toMatchObject({
      coverage_status: "partial",
      allocated_minutes: 240,
      remaining_minutes: 240,
    });
  });

  it("neemt gepubliceerde zondagse carry-in dekking als extern bewijs mee zonder die dienst in de maandagsnapshot op te nemen", async () => {
    const { base44, entities } = setup([]);
    const demand = addCarryInPublicationFixture(entities, "published");

    const result = await backend.publishPlanning(base44, user, {
      scope_type: "selection",
      shift_ids: ["shift-monday-selected"],
      expected_shift_revisions: { "shift-monday-selected": 1 },
      publication_reason: "Maandagdienst met reeds gepubliceerde zondagse carry-in",
    }, context("publish-monday-with-published-sunday-carry-in"));

    expect(result.publication.snapshot.shifts.map(item => item.id)).toEqual([
      "shift-monday-selected",
    ]);
    expect(result.publication.snapshot.task_segments.map(item => item.id)).toEqual([
      "segment-monday-selected",
    ]);
    expect(result.publication.snapshot.task_occurrences.map(item => item.id)).toEqual([demand.id]);
    expect(result.publication.snapshot.task_occurrences[0]).toMatchObject({
      service_date: "2026-08-16",
      coverage: {
        coverage_status: "full",
        allocated_minutes: 480,
        remaining_minutes: 0,
      },
      coverage_basis: {
        calculation: "scope_plus_external_published_parents",
        scope_shift_ids: ["shift-monday-selected"],
        scope_segment_ids: ["segment-monday-selected"],
        external_published_shift_ids: ["shift-sunday-external"],
        external_published_segment_ids: ["segment-sunday-external"],
        external_publication_evidence: [expect.objectContaining({
          publication_id: "publication-sunday-external",
          publication_version: 1,
          publication_checksum: "checksum-sunday-external",
          shift_id: "shift-sunday-external",
          shift_revision: 1,
          segment_id: "segment-sunday-external",
          segment_revision: 1,
        })],
      },
    });
    expect(result.publication.critical_warning_count).toBe(0);
    expect((await entities.PlanningShift.get("shift-sunday-external"))).toMatchObject({
      status: "draft",
      revision: 2,
      start_time: "23:00",
    });
  });

  it("telt een zondagse draft-ouderdienst niet als externe carry-in dekking en vereist bevestiging voor de deelpublicatie", async () => {
    const { base44, entities } = setup([]);
    const demand = addCarryInPublicationFixture(entities, "draft");
    const request = {
      scope_type: "selection",
      shift_ids: ["shift-monday-selected"],
      expected_shift_revisions: { "shift-monday-selected": 1 },
      publication_reason: "Maandagdienst terwijl zondagse carry-in nog concept is",
    };

    await expect(backend.publishPlanning(
      base44,
      user,
      request,
      context("publish-monday-with-draft-sunday-carry-in-without-ack"),
    )).rejects.toMatchObject({
      status: 409,
      details: {
        code: "critical_warning_acknowledgement_required",
        critical_warnings: expect.arrayContaining([
          expect.objectContaining({
            task_occurrence_id: demand.id,
            code: "task_occurrence_partially_planned",
            severity: "critical",
            details: expect.objectContaining({
              coverage_status: "partial",
              allocated_minutes: 240,
              remaining_minutes: 240,
            }),
          }),
        ]),
      },
    });
    expect(entities.PlanningPublication.records).toHaveLength(0);
    expect((await entities.PlanningShift.get("shift-monday-selected")).status).toBe("draft");

    const result = await backend.publishPlanning(base44, user, {
      ...request,
      acknowledge_critical_warnings: true,
      critical_warning_acknowledgement_reason: "De zondagse helft volgt in een afzonderlijke publicatie.",
    }, context("publish-monday-with-draft-sunday-carry-in-with-ack"));

    expect(result.publication.snapshot.task_occurrences[0]).toMatchObject({
      coverage: {
        coverage_status: "partial",
        allocated_minutes: 240,
        remaining_minutes: 240,
      },
      coverage_basis: {
        scope_shift_ids: ["shift-monday-selected"],
        scope_segment_ids: ["segment-monday-selected"],
        external_published_shift_ids: [],
        external_published_segment_ids: [],
      },
    });
    expect(result.publication.snapshot.shifts.map(item => item.id)).toEqual([
      "shift-monday-selected",
    ]);
    expect(result.publication.snapshot.task_segments.map(item => item.id)).toEqual([
      "segment-monday-selected",
    ]);
    expect((await entities.PlanningShift.get("shift-sunday-external")).status).toBe("draft");
  });

  it("blokkeert publicatie van een dienst met een niet-geaudite planning_mutation", async () => {
    const { base44, entities } = setup([]);
    entities.PlanningShift.records.push({
      id: "shift-pending-mutation",
      source_key: "manual-pending-mutation",
      source_type: "manual",
      service_name_snapshot: "Dienst met onafgeronde mutatie",
      service_date: "2026-08-17",
      end_date: "2026-08-17",
      start_time: "08:00",
      end_time: "16:00",
      required_count: 1,
      status: "draft",
      revision: 2,
      published_revision: 0,
      metadata: {
        planning_mutation: {
          action: "move",
          idempotency_key: "pending-move-without-audit",
          correlation_id: "pending-move-without-audit",
          actor_user_id: user.id,
          request_hash: "pending-request-hash",
          phase: "state_written_audit_pending",
          started_at: "2026-08-11T08:00:00.000Z",
          updated_at: "2026-08-11T08:00:00.000Z",
        },
      },
    });

    await expect(backend.publishPlanning(base44, user, {
      scope_type: "selection",
      shift_ids: ["shift-pending-mutation"],
      expected_shift_revisions: { "shift-pending-mutation": 2 },
      publication_reason: "Mag niet door onafgeronde mutatie",
    }, context("publish-shift-with-unaudited-pending-mutation"))).rejects.toMatchObject({
      status: 409,
      details: {
        shift_id: "shift-pending-mutation",
        pending_action: "move",
        pending_idempotency_key: "pending-move-without-audit",
      },
    });
    expect(entities.PlanningPublication.records).toHaveLength(0);
    expect(entities.PlanningAuditEvent.records).toHaveLength(0);
    expect((await entities.PlanningShift.get("shift-pending-mutation"))).toMatchObject({
      status: "draft",
      published_revision: 0,
    });
  });
});
