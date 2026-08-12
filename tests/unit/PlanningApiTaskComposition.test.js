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
  };
  return {
    base44: { asServiceRole: { entities, functions: { invoke: async () => ({}) } } },
    entities,
  };
}

const user = { id: "admin-1", role: "admin", name: "Planner" };
const context = key => ({ idempotencyKey: key, correlationId: key });

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
});

describe("planning coverage-entiteiten", () => {
  it("staan alleen service-role writes toe en geven admins uitsluitend leesrechten", () => {
    for (const file of [
      "PlanningAssignment.jsonc",
      "PlanningAuditEvent.jsonc",
      "PlanningPublication.jsonc",
      "PlanningShift.jsonc",
      "PlanningTaskOccurrence.jsonc",
      "PlanningShiftTaskSegment.jsonc",
      "PlanningMutationCoordinator.jsonc",
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
    base44.asServiceRole.functions.invoke = async () => {
      assignmentValidationCalls += 1;
      return {};
    };

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
    expect(assignmentValidationCalls).toBe(2);
    expect(entities.PlanningAuditEvent.records).toEqual([
      expect.objectContaining({
        action: "compose_and_assign",
        shift_id: result.shift.id,
        assignment_id: result.assignment.id,
        undoable: false,
      }),
    ]);
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

  it("snoeit verlopen idempotencyclaims uit het gedeelde register", async () => {
    const demand = occurrence("occurrence-reception", "object-1", "08:00", "16:00", 480);
    const { base44, entities } = setup([demand]);
    entities.Personnel.records.push({ id: "personnel-1", name: "Sam Beveiliger", status: "active" });
    entities.PlanningMutationCoordinator.records.push({
      id: "coordinator-registry",
      coordinator_key: "idempotency_registry:v2",
      resource_type: "idempotency_registry",
      resource_id: "compose_and_assign",
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
    }, context("compose-and-assign-prunes-expired-claims"));

    const registry = entities.PlanningMutationCoordinator.records.find(
      item => item.resource_type === "idempotency_registry",
    );
    expect(registry.metadata.claims).toEqual({});
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

    await expect(backend.composeAndAssign(base44, user, payload, retryContext))
      .rejects.toThrow("tijdelijke auditstoring");
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

    const result = await backend.composeAndAssign(base44, user, {
      personnel_id: "personnel-1",
      segments: [{ task_occurrence_id: demand.id, start_time: "08:00", end_time: "16:00" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    }, context("compose-and-assign-final-validation"));

    expect(result.assignment.has_critical_warnings).toBe(true);
    expect(result.assignment.warning_codes).toContain("shift_overlap");
    expect(result.assignment.metadata?.final_assignment_validation_at).toBeTruthy();
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

    const result = await backend.composeAndAssign(base44, user, {
      personnel_id: "personnel-1",
      segments: [{ task_occurrence_id: demand.id, start_time: "08:00", end_time: "16:00" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    }, context("compose-and-assign-final-personnel-reload"));

    expect(result.assignment.has_critical_warnings).toBe(true);
    expect(result.assignment.warning_codes).toContain("personnel_not_active");
    expect(result.assignment.metadata?.final_assignment_validation_at).toBeTruthy();
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
        "personnel-night:2026-08-17",
        "personnel-night:2026-08-18",
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
      segments: [{ task_occurrence_id: demand.id, start_time: "06:00", end_time: "20:00" }],
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
      segments: [{ task_occurrence_id: demand.id, start_time: "06:00", end_time: "20:00" }],
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
      segments: [{ task_occurrence_id: demand.id, start_time: "06:00", end_time: "20:00" }],
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
        "personnel-night:2026-08-17",
        "personnel-night:2026-08-18",
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
        "personnel-night:2026-08-17",
        "personnel-night:2026-08-18",
        "personnel-night:2026-08-19",
        "personnel-night:2026-08-20",
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
        "personnel-night:2026-08-19",
        "personnel-night:2026-08-20",
      ]);
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
