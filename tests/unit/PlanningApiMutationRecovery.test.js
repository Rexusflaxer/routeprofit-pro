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

function shift(overrides = {}) {
  return {
    id: "shift-1",
    source_key: "manual:shift-1",
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
    ...overrides,
  };
}

function assignment(overrides = {}) {
  return {
    id: "assignment-1",
    shift_id: "shift-1",
    slot_index: 0,
    personnel_id: "personnel-1",
    personnel_name_snapshot: "Sam Beveiliger",
    status: "draft",
    warning_codes: [],
    warning_snapshot: [],
    has_critical_warnings: false,
    revision: 1,
    published_revision: 0,
    metadata: {},
    ...overrides,
  };
}

function occurrence(overrides = {}) {
  return {
    id: "occurrence-1",
    source_key: "object-task:definition-1:period-1:2026-08-17",
    object_task_definition_id: "definition-1",
    definition_version: 1,
    schedule_period_key: "period-1",
    customer_id: "customer-1",
    object_id: "object-1",
    task_type: "reception",
    task_name_snapshot: "Receptiedienst",
    object_name_snapshot: "Object 1",
    customer_name_snapshot: "Klant 1",
    execution_mode: "continuous",
    service_date: "2026-08-17",
    end_date: "2026-08-17",
    window_start_time: "08:00",
    window_end_time: "16:00",
    timezone: "Europe/Amsterdam",
    required_minutes: 480,
    lifecycle_status: "active",
    revision: 1,
    published_revision: 0,
    metadata: {},
    ...overrides,
  };
}

function setup({ shifts = [], assignments = [], occurrences = [], segments = [] } = {}) {
  const entities = {
    PlanningTaskOccurrence: entity(occurrences, "occurrence"),
    PlanningShiftTaskSegment: entity(segments, "segment"),
    PlanningShift: entity(shifts, "shift"),
    PlanningAssignment: entity(assignments, "assignment"),
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
      {
        id: "object-1",
        customer_id: "customer-1",
        name: "Object 1",
        default_operating_company_id: "company-1",
        contract_assignment_policy: "allow_manual_review",
      },
    ], "object"),
    Customer: entity([{ id: "customer-1", trade_name: "Klant 1" }], "customer"),
    Personnel: entity([{ id: "personnel-1", name: "Sam Beveiliger", status: "active" }], "personnel"),
    PersonnelAbsence: entity([], "absence"),
    PersonnelRestriction: entity([], "restriction"),
    PersonnelSecurityPass: entity([], "security-pass"),
  };
  return {
    base44: { asServiceRole: { entities, functions: { invoke: async () => ({}) } } },
    entities,
  };
}

const user = { id: "admin-1", role: "admin", name: "Planner" };
const context = key => ({ idempotencyKey: key, correlationId: key });

function failAuditOnce(entities, action) {
  const create = entities.PlanningAuditEvent.create.bind(entities.PlanningAuditEvent);
  let shouldFail = true;
  entities.PlanningAuditEvent.create = async data => {
    if (shouldFail && data.action === action) {
      shouldFail = false;
      throw new Error(`tijdelijke ${action}-auditstoring`);
    }
    return create(data);
  };
}

describe("planningApi herstel na late mutatiefouten", () => {
  it("herstelt assign na een auditfout zonder dubbele bezetting", async () => {
    const { base44, entities } = setup({ shifts: [shift()] });
    failAuditOnce(entities, "assign");
    const body = {
      shift_id: "shift-1",
      personnel_id: "personnel-1",
      slot_index: 0,
      expected_shift_revision: 1,
    };
    const mutation = context("assign-audit-recovery");

    await expect(backend.assignPersonnel(base44, user, body, mutation))
      .rejects.toThrow("tijdelijke assign-auditstoring");
    expect(entities.PlanningAssignment.records.filter(item => item.status !== "removed")).toHaveLength(1);
    expect(entities.PlanningShift.records[0].metadata.planning_mutation).toMatchObject({
      action: "assign",
      idempotency_key: mutation.idempotencyKey,
      phase: "state_written_audit_pending",
    });

    const recovered = await backend.assignPersonnel(base44, user, body, mutation);
    expect(recovered).toMatchObject({ undoable: false });
    expect(entities.PlanningAssignment.records.filter(item => item.status !== "removed")).toHaveLength(1);
    expect(entities.PlanningAuditEvent.records).toEqual([
      expect.objectContaining({ action: "assign", undoable: false }),
    ]);
  });

  it("herstelt unassign na een auditfout zonder een verwijderde toewijzing te dupliceren", async () => {
    const { base44, entities } = setup({ shifts: [shift()], assignments: [assignment()] });
    failAuditOnce(entities, "unassign");
    const body = {
      shift_id: "shift-1",
      assignment_id: "assignment-1",
      expected_shift_revision: 1,
    };
    const mutation = context("unassign-audit-recovery");

    await expect(backend.unassignPersonnel(base44, user, body, mutation))
      .rejects.toThrow("tijdelijke unassign-auditstoring");
    expect(entities.PlanningAssignment.records[0].status).toBe("removed");

    const recovered = await backend.unassignPersonnel(base44, user, body, mutation);
    expect(recovered).toMatchObject({ idempotent: true, undoable: false });
    expect(entities.PlanningAssignment.records).toHaveLength(1);
    expect(entities.PlanningAuditEvent.records).toEqual([
      expect.objectContaining({ action: "unassign", undoable: false }),
    ]);
  });

  it("herstelt move na een auditfout op exact dezelfde verplaatste dienst", async () => {
    const { base44, entities } = setup({ shifts: [shift()], assignments: [assignment()] });
    failAuditOnce(entities, "move");
    const body = {
      shift_id: "shift-1",
      expected_shift_revision: 1,
      service_date: "2026-08-18",
    };
    const mutation = context("move-audit-recovery");

    await expect(backend.moveShift(base44, user, body, mutation))
      .rejects.toThrow("tijdelijke move-auditstoring");
    expect(entities.PlanningShift.records[0]).toMatchObject({ service_date: "2026-08-18" });

    const recovered = await backend.moveShift(base44, user, body, mutation);
    expect(recovered).toMatchObject({ undoable: false, shift: { service_date: "2026-08-18" } });
    expect(entities.PlanningShift.records).toHaveLength(1);
    expect(entities.PlanningAssignment.records).toHaveLength(1);
    expect(entities.PlanningAuditEvent.records).toEqual([
      expect.objectContaining({ action: "move", undoable: false }),
    ]);
  });

  it("herstelt undo na een auditfout en voert dezelfde undo slechts eenmaal uit", async () => {
    const { base44, entities } = setup({ shifts: [shift()] });
    const assigned = await backend.assignPersonnel(base44, user, {
      shift_id: "shift-1",
      personnel_id: "personnel-1",
      slot_index: 0,
      expected_shift_revision: 1,
    }, context("assign-before-undo"));
    failAuditOnce(entities, "undo");
    const body = {
      audit_event_id: assigned.audit_event_id,
      undo_token: assigned.undo_token,
      expected_shift_revision: assigned.shift.revision,
    };
    const mutation = context("undo-audit-recovery");

    await expect(backend.undoPlanning(base44, user, body, mutation))
      .rejects.toThrow("tijdelijke undo-auditstoring");
    expect(entities.PlanningAssignment.records[0].status).toBe("removed");

    const recovered = await backend.undoPlanning(base44, user, body, mutation);
    expect(recovered).toMatchObject({ undoable: false });
    expect(entities.PlanningAssignment.records).toHaveLength(1);
    expect(entities.PlanningAssignment.records[0].status).toBe("removed");
    expect(entities.PlanningAuditEvent.records.filter(item => item.action === "undo")).toHaveLength(1);
  });

  it("houdt een gewone compositie onzichtbaar na auditfalen en herstelt zonder duplicaten", async () => {
    const demand = occurrence();
    const { base44, entities } = setup({ occurrences: [demand] });
    failAuditOnce(entities, "compose_shift");
    const body = {
      segments: [{ task_occurrence_id: demand.id, start_time: "08:00", end_time: "16:00" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    };
    const mutation = context("compose-audit-recovery");

    await expect(backend.composeShift(base44, user, body, mutation))
      .rejects.toThrow("tijdelijke compose_shift-auditstoring");
    expect(entities.PlanningShift.records[0]).toMatchObject({ status: "cancelled" });
    expect(backend.activeTaskSegments(
      entities.PlanningShiftTaskSegment.records,
      entities.PlanningShift.records,
    )).toEqual([]);

    const recovered = await backend.composeShift(base44, user, body, mutation);
    expect(recovered.shift).toMatchObject({ status: "draft" });
    expect(entities.PlanningShift.records).toHaveLength(1);
    expect(entities.PlanningShiftTaskSegment.records.filter(item => item.status !== "removed")).toHaveLength(1);
    expect(entities.PlanningAuditEvent.records.filter(item => item.action === "compose_shift")).toHaveLength(1);
  });

  it("herstelt een gewone compositie als alleen de finale zichtbaarheid-CAS uitvalt", async () => {
    const demand = occurrence();
    const { base44, entities } = setup({ occurrences: [demand] });
    const update = entities.PlanningShift.updateMany.bind(entities.PlanningShift);
    let failCompletionOnce = true;
    entities.PlanningShift.updateMany = async (query, patch) => {
      if (
        failCompletionOnce
        && patch.$set?.status === "draft"
        && patch.$set?.metadata?.planning_composition?.phase === "completed"
      ) {
        failCompletionOnce = false;
        return { success: true, updated: 0 };
      }
      return update(query, patch);
    };
    const body = {
      segments: [{ task_occurrence_id: demand.id, start_time: "08:00", end_time: "16:00" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    };
    const mutation = context("compose-final-cas-recovery");

    await expect(backend.composeShift(base44, user, body, mutation)).rejects.toMatchObject({ status: 409 });
    expect(entities.PlanningShift.records[0]).toMatchObject({
      status: "cancelled",
      metadata: { planning_composition: { phase: "pending" } },
    });
    expect(entities.PlanningAuditEvent.records.filter(item => item.action === "compose_shift")).toHaveLength(1);

    const recovered = await backend.composeShift(base44, user, body, mutation);
    expect(recovered.shift).toMatchObject({
      status: "draft",
      metadata: { planning_composition: { phase: "completed" } },
    });
    expect(entities.PlanningShift.records).toHaveLength(1);
    expect(entities.PlanningShiftTaskSegment.records.filter(item => item.status !== "removed")).toHaveLength(1);
    expect(entities.PlanningAuditEvent.records.filter(item => item.action === "compose_shift")).toHaveLength(1);
  });

  it("herstelt compose_and_assign als de finale zichtbaarheid-CAS na de audit uitvalt", async () => {
    const demand = occurrence();
    const { base44, entities } = setup({ occurrences: [demand] });
    const update = entities.PlanningShift.updateMany.bind(entities.PlanningShift);
    let failCompletionOnce = true;
    entities.PlanningShift.updateMany = async (query, patch) => {
      if (
        failCompletionOnce
        && patch.$set?.status === "draft"
        && patch.$set?.metadata?.compose_and_assign?.phase === "completed"
      ) {
        failCompletionOnce = false;
        return { success: true, updated: 0 };
      }
      return update(query, patch);
    };
    const body = {
      personnel_id: "personnel-1",
      segments: [{ task_occurrence_id: demand.id, start_time: "08:00", end_time: "16:00" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    };
    const mutation = context("compose-and-assign-final-cas-recovery");

    await expect(backend.composeAndAssign(base44, user, body, mutation)).rejects.toMatchObject({ status: 409 });
    expect(entities.PlanningShift.records[0]).toMatchObject({ status: "cancelled" });
    expect(backend.activeTaskSegments(
      entities.PlanningShiftTaskSegment.records,
      entities.PlanningShift.records,
    )).toEqual([]);

    const recovered = await backend.composeAndAssign(base44, user, body, mutation);
    expect(recovered.shift).toMatchObject({ status: "draft" });
    expect(recovered.assignment).toMatchObject({ personnel_id: "personnel-1", status: "draft" });
    expect(entities.PlanningShift.records).toHaveLength(1);
    expect(entities.PlanningAssignment.records.filter(item => item.status !== "removed")).toHaveLength(1);
    expect(entities.PlanningAuditEvent.records.filter(item => item.action === "compose_and_assign")).toHaveLength(1);
  });
});

describe("planningApi kopie- en verplaatsdatums", () => {
  it("rebased een expliciete overnight einddatum bij kopieren en verplaatsen", async () => {
    const overnight = shift({
      service_date: "2026-08-17",
      end_date: "2026-08-18",
      start_time: "22:00",
      end_time: "02:00",
      duration_minutes: 240,
    });
    const copySetup = setup({ shifts: [overnight] });
    const copied = await backend.copyShift(copySetup.base44, user, {
      shift_id: overnight.id,
      expected_shift_revision: 1,
      service_date: "2026-08-20",
    }, context("copy-overnight-rebase"));
    expect(copied.shift).toMatchObject({
      service_date: "2026-08-20",
      end_date: "2026-08-21",
      duration_minutes: 240,
    });

    const moveSetup = setup({ shifts: [overnight] });
    const moved = await backend.moveShift(moveSetup.base44, user, {
      shift_id: overnight.id,
      expected_shift_revision: 1,
      service_date: "2026-08-20",
    }, context("move-overnight-rebase"));
    expect(moved.shift).toMatchObject({
      service_date: "2026-08-20",
      end_date: "2026-08-21",
      duration_minutes: 240,
    });
  });

  it("weigert een expliciete copy-einddatum die de 24-uursgrens overschrijdt", async () => {
    const { base44 } = setup({ shifts: [shift()] });
    await expect(backend.copyShift(base44, user, {
      shift_id: "shift-1",
      expected_shift_revision: 1,
      service_date: "2026-08-20",
      end_date: "2026-08-22",
      start_time: "08:00",
      end_time: "09:00",
    }, context("copy-too-long"))).rejects.toMatchObject({ status: 409 });
  });
});

describe("planningApi route-bootstrap reconciliatie", () => {
  function addRouteSource(entities) {
    entities.Route.records.push({
      id: "route-1",
      name: "Avondroute",
      operating_company_id: "company-1",
      time_window_start: "18:00",
      time_window_end: "23:00",
      assigned_tasks: [],
    });
    entities.RouteExecution.records.push({
      id: "execution-1",
      source_route_id: "route-1",
      service_date: "2026-08-17",
      shift_start_time: "18:00",
      shift_end_time: "23:00",
      employee_id: "personnel-1",
      employee_name: "Sam Beveiliger",
      operating_company_id: "company-1",
      status: "planned",
    });
  }

  it("repareert dubbele bronshifts, dubbele canonieke slots en orphan assignments", async () => {
    const sourceKey = "route:route-1:2026-08-17";
    const canonical = shift({
      id: "shift-a",
      source_key: sourceKey,
      source_type: "route",
      source_id: "route-1",
      route_id: "route-1",
      service_date: "2026-08-17",
      start_time: "18:00",
      end_time: "23:00",
      created_date: "2026-08-11T08:00:00.000Z",
    });
    const duplicate = shift({
      id: "shift-b",
      source_key: sourceKey,
      source_type: "route",
      source_id: "route-1",
      route_id: "route-1",
      service_date: "2026-08-17",
      start_time: "18:00",
      end_time: "23:00",
      created_date: "2026-08-11T08:01:00.000Z",
    });
    const { base44, entities } = setup({
      shifts: [canonical, duplicate],
      assignments: [
        assignment({ id: "assignment-a", shift_id: "shift-a", created_date: "2026-08-11T08:00:00.000Z" }),
        assignment({ id: "assignment-a-duplicate", shift_id: "shift-a", created_date: "2026-08-11T08:01:00.000Z" }),
        assignment({ id: "assignment-orphan", shift_id: "shift-b", created_date: "2026-08-11T08:02:00.000Z" }),
      ],
    });
    addRouteSource(entities);

    await backend.bootstrapRange(base44, user, {
      period_start: "2026-08-17",
      period_end: "2026-08-17",
    }, context("bootstrap-reconcile-duplicates"));

    expect((await entities.PlanningShift.get("shift-a")).status).toBe("draft");
    expect((await entities.PlanningShift.get("shift-b"))).toMatchObject({
      status: "cancelled",
      metadata: { duplicate_of_shift_id: "shift-a" },
    });
    expect(entities.PlanningAssignment.records.filter(item => item.status !== "removed")).toEqual([
      expect.objectContaining({ id: "assignment-a", shift_id: "shift-a" }),
    ]);
    expect(await entities.PlanningAssignment.get("assignment-a-duplicate")).toMatchObject({
      status: "removed",
      metadata: { duplicate_of_assignment_id: "assignment-a" },
    });
    expect(await entities.PlanningAssignment.get("assignment-orphan")).toMatchObject({
      status: "removed",
      metadata: { duplicate_of_shift_id: "shift-a" },
    });
  });

  it("serialiseert gelijktijdige bootstrap van dezelfde routebron en blijft duplicate-safe bij retry", async () => {
    const { base44, entities } = setup();
    addRouteSource(entities);
    const create = entities.PlanningShift.create.bind(entities.PlanningShift);
    let enteredCreate;
    let releaseCreate;
    const atCreate = new Promise(resolve => { enteredCreate = resolve; });
    const released = new Promise(resolve => { releaseCreate = resolve; });
    let blockOnce = true;
    entities.PlanningShift.create = async data => {
      if (blockOnce) {
        blockOnce = false;
        enteredCreate();
        await released;
      }
      return create(data);
    };
    const body = { period_start: "2026-08-17", period_end: "2026-08-17" };
    const first = backend.bootstrapRange(base44, user, body, context("bootstrap-concurrent-a"));
    await atCreate;
    await expect(backend.bootstrapRange(base44, user, body, context("bootstrap-concurrent-b")))
      .rejects.toMatchObject({ status: 409 });
    releaseCreate();
    await first;

    await backend.bootstrapRange(base44, user, body, context("bootstrap-concurrent-b"));
    expect(entities.PlanningShift.records.filter(item => item.status !== "cancelled")).toHaveLength(1);
    expect(entities.PlanningAssignment.records.filter(item => item.status !== "removed")).toHaveLength(1);
  });

  it("blokkeert fresh duplicate-bronshifts vóór bootstrap-reconciliatie businessrecords wijzigt", async () => {
    const { base44, entities } = setup();
    addRouteSource(entities);
    const createCoordinator = entities.PlanningMutationCoordinator.create.bind(entities.PlanningMutationCoordinator);
    let insertedFreshDuplicates = false;
    entities.PlanningMutationCoordinator.create = async data => {
      if (!insertedFreshDuplicates && data.resource_type === "bootstrap_source") {
        insertedFreshDuplicates = true;
        const sourceKey = "route:route-1:2026-08-17";
        entities.PlanningShift.records.push(
          shift({ id: "shift-fresh-a", source_key: sourceKey, source_type: "route", source_id: "route-1" }),
          shift({
            id: "shift-fresh-b",
            source_key: sourceKey,
            source_type: "route",
            source_id: "route-1",
            metadata: {
              planning_mutation: {
                action: "move",
                idempotency_key: "foreign-fresh-bootstrap",
                actor_user_id: user.id,
                request_hash: "foreign-hash",
                phase: "state_written_audit_pending",
              },
            },
          }),
        );
        entities.PlanningAssignment.records.push(assignment({
          id: "assignment-fresh-orphan",
          shift_id: "shift-fresh-b",
        }));
      }
      return createCoordinator(data);
    };

    await expect(backend.bootstrapRange(base44, user, {
      period_start: "2026-08-17",
      period_end: "2026-08-17",
    }, context("bootstrap-fresh-duplicate-gate"))).rejects.toMatchObject({ status: 409 });

    expect(entities.PlanningShift.records.map(item => ({ id: item.id, status: item.status }))).toEqual([
      { id: "shift-fresh-a", status: "draft" },
      { id: "shift-fresh-b", status: "draft" },
    ]);
    expect(await entities.PlanningAssignment.get("assignment-fresh-orphan")).toMatchObject({ status: "draft" });
    expect(entities.PlanningAuditEvent.records).toHaveLength(0);
  });
});

describe("planningApi lease fencing", () => {
  it("vernieuwt onafhankelijke leases begrensd parallel met één ownership-read en CAS", async () => {
    const { base44, entities } = setup();
    const expiresAt = new Date(Date.now() + 90_000).toISOString();
    entities.PlanningMutationCoordinator.records.push(
      {
        id: "coordinator-parallel-a",
        coordinator_key: "task_occurrence:occurrence-a",
        resource_type: "task_occurrence",
        resource_id: "occurrence-a",
        revision: 1,
        lease: { token: "shared-token", status: "pending", expires_at: expiresAt },
      },
      {
        id: "coordinator-parallel-b",
        coordinator_key: "task_occurrence:occurrence-b",
        resource_type: "task_occurrence",
        resource_id: "occurrence-b",
        revision: 1,
        lease: { token: "shared-token", status: "pending", expires_at: expiresAt },
      },
    );
    const coordinatorGet = entities.PlanningMutationCoordinator.get.bind(entities.PlanningMutationCoordinator);
    let inFlightReads = 0;
    let maximumConcurrentReads = 0;
    let readCount = 0;
    entities.PlanningMutationCoordinator.get = async id => {
      inFlightReads += 1;
      readCount += 1;
      maximumConcurrentReads = Math.max(maximumConcurrentReads, inFlightReads);
      await new Promise(resolve => setTimeout(resolve, 10));
      const record = await coordinatorGet(id);
      inFlightReads -= 1;
      return record;
    };

    await backend.renewPlanningResourceLeases(base44, user, [
      {
        coordinatorId: "coordinator-parallel-a",
        resourceType: "task_occurrence",
        resourceId: "occurrence-a",
        token: "shared-token",
      },
      {
        coordinatorId: "coordinator-parallel-b",
        resourceType: "task_occurrence",
        resourceId: "occurrence-b",
        token: "shared-token",
      },
    ]);

    expect(maximumConcurrentReads).toBeGreaterThan(1);
    expect(readCount).toBe(2);
    expect(await coordinatorGet("coordinator-parallel-a")).toMatchObject({
      revision: 2,
      lease: { token: "shared-token" },
    });
    expect(await coordinatorGet("coordinator-parallel-b")).toMatchObject({
      revision: 2,
      lease: { token: "shared-token" },
    });
  });

  it("controleert ownership maar schrijft een ruime lease niet bij elke mutationele stap opnieuw", async () => {
    const { base44, entities } = setup();
    const expiresAt = new Date(Date.now() + 110_000).toISOString();
    entities.PlanningMutationCoordinator.records.push(
      {
        id: "coordinator-fresh-a",
        coordinator_key: "task_occurrence:occurrence-a",
        resource_type: "task_occurrence",
        resource_id: "occurrence-a",
        revision: 1,
        lease: { token: "fresh-token", status: "pending", expires_at: expiresAt },
      },
      {
        id: "coordinator-fresh-b",
        coordinator_key: "shift_composition:shift-a",
        resource_type: "shift_composition",
        resource_id: "shift-a",
        revision: 1,
        lease: { token: "fresh-token", status: "pending", expires_at: expiresAt },
      },
    );
    const coordinatorGet = entities.PlanningMutationCoordinator.get.bind(entities.PlanningMutationCoordinator);
    const coordinatorUpdateMany = entities.PlanningMutationCoordinator.updateMany.bind(
      entities.PlanningMutationCoordinator,
    );
    let ownershipReadCount = 0;
    let coordinatorWriteCount = 0;
    entities.PlanningMutationCoordinator.get = async id => {
      ownershipReadCount += 1;
      return coordinatorGet(id);
    };
    entities.PlanningMutationCoordinator.updateMany = async (...args) => {
      coordinatorWriteCount += 1;
      return coordinatorUpdateMany(...args);
    };

    await backend.renewPlanningResourceLeases(base44, user, [
      {
        coordinatorId: "coordinator-fresh-a",
        resourceType: "task_occurrence",
        resourceId: "occurrence-a",
        token: "fresh-token",
      },
      {
        coordinatorId: "coordinator-fresh-b",
        resourceType: "shift_composition",
        resourceId: "shift-a",
        token: "fresh-token",
      },
    ]);

    expect(ownershipReadCount).toBe(2);
    expect(coordinatorWriteCount).toBe(0);
    expect(await coordinatorGet("coordinator-fresh-a")).toMatchObject({ revision: 1 });
    expect(await coordinatorGet("coordinator-fresh-b")).toMatchObject({ revision: 1 });
  });

  it("geeft onafhankelijke leases begrensd parallel vrij", async () => {
    const { base44, entities } = setup();
    const expiresAt = new Date(Date.now() + 90_000).toISOString();
    entities.PlanningMutationCoordinator.records.push(
      {
        id: "coordinator-release-a",
        coordinator_key: "task_occurrence:occurrence-a",
        resource_type: "task_occurrence",
        resource_id: "occurrence-a",
        revision: 1,
        lease: { token: "release-token", status: "pending", expires_at: expiresAt },
      },
      {
        id: "coordinator-release-b",
        coordinator_key: "shift_composition:shift-a",
        resource_type: "shift_composition",
        resource_id: "shift-a",
        revision: 1,
        lease: { token: "release-token", status: "pending", expires_at: expiresAt },
      },
    );
    const coordinatorGet = entities.PlanningMutationCoordinator.get.bind(entities.PlanningMutationCoordinator);
    let inFlightReads = 0;
    let maximumConcurrentReads = 0;
    entities.PlanningMutationCoordinator.get = async id => {
      inFlightReads += 1;
      maximumConcurrentReads = Math.max(maximumConcurrentReads, inFlightReads);
      await new Promise(resolve => setTimeout(resolve, 10));
      const record = await coordinatorGet(id);
      inFlightReads -= 1;
      return record;
    };

    const errors = await backend.releasePlanningResourceLeases(base44, user, [
      { coordinatorId: "coordinator-release-a", token: "release-token" },
      { coordinatorId: "coordinator-release-b", token: "release-token" },
    ]);

    expect(errors).toEqual([]);
    expect(maximumConcurrentReads).toBeGreaterThan(1);
    expect(await coordinatorGet("coordinator-release-a")).toMatchObject({ lease: null, revision: 2 });
    expect(await coordinatorGet("coordinator-release-b")).toMatchObject({ lease: null, revision: 2 });
  });

  it("ruimt alle overige leases op wanneer een parallelle release definitief faalt", async () => {
    const { base44, entities } = setup();
    const expiresAt = new Date(Date.now() + 90_000).toISOString();
    entities.PlanningMutationCoordinator.records.push(
      {
        id: "coordinator-release-fails",
        coordinator_key: "task_occurrence:occurrence-fails",
        resource_type: "task_occurrence",
        resource_id: "occurrence-fails",
        revision: 1,
        lease: { token: "release-token", status: "pending", expires_at: expiresAt },
      },
      {
        id: "coordinator-release-succeeds",
        coordinator_key: "shift_composition:shift-succeeds",
        resource_type: "shift_composition",
        resource_id: "shift-succeeds",
        revision: 1,
        lease: { token: "release-token", status: "pending", expires_at: expiresAt },
      },
    );
    const coordinatorUpdateMany = entities.PlanningMutationCoordinator.updateMany.bind(
      entities.PlanningMutationCoordinator,
    );
    entities.PlanningMutationCoordinator.updateMany = async (query, update) => {
      if (query.id === "coordinator-release-fails") throw new Error("release storage unavailable");
      return coordinatorUpdateMany(query, update);
    };

    const errors = await backend.releasePlanningResourceLeases(base44, user, [
      { coordinatorId: "coordinator-release-fails", token: "release-token" },
      { coordinatorId: "coordinator-release-succeeds", token: "release-token" },
    ]);

    expect(errors).toEqual([
      expect.objectContaining({
        id: "coordinator-release-fails",
        message: "release storage unavailable",
      }),
    ]);
    expect(await entities.PlanningMutationCoordinator.get("coordinator-release-fails"))
      .toMatchObject({ lease: { token: "release-token" }, revision: 1 });
    expect(await entities.PlanningMutationCoordinator.get("coordinator-release-succeeds"))
      .toMatchObject({ lease: null, revision: 2 });
  });

  it("laat een verlopen eigenaar zijn lease niet hernieuwen of een write hervatten", async () => {
    const { base44, entities } = setup();
    entities.PlanningMutationCoordinator.records.push({
      id: "coordinator-stale",
      coordinator_key: "shift_composition:shift-1",
      resource_type: "shift_composition",
      resource_id: "shift-1",
      revision: 1,
      lease: {
        token: "stale-token",
        status: "pending",
        idempotency_key: "stale-request",
        actor_user_id: user.id,
        expires_at: "2026-08-10T00:00:00.000Z",
      },
    });

    await expect(backend.renewPlanningResourceLeases(base44, user, [{
      coordinatorId: "coordinator-stale",
      resourceType: "shift_composition",
      resourceId: "shift-1",
      token: "stale-token",
    }])).rejects.toMatchObject({ status: 409 });
    expect(await entities.PlanningMutationCoordinator.get("coordinator-stale")).toMatchObject({
      revision: 1,
      lease: { token: "stale-token", expires_at: "2026-08-10T00:00:00.000Z" },
    });
  });

  it("laat een oude eigenaar een verse lease met een ander token niet hernieuwen", async () => {
    const { base44, entities } = setup();
    const expiresAt = new Date(Date.now() + 120_000).toISOString();
    entities.PlanningMutationCoordinator.records.push({
      id: "coordinator-reowned",
      coordinator_key: "shift_composition:shift-1",
      resource_type: "shift_composition",
      resource_id: "shift-1",
      revision: 1,
      lease: {
        token: "new-owner-token",
        status: "pending",
        idempotency_key: "new-owner-request",
        actor_user_id: "admin-2",
        expires_at: expiresAt,
      },
    });

    await expect(backend.renewPlanningResourceLeases(base44, user, [{
      coordinatorId: "coordinator-reowned",
      resourceType: "shift_composition",
      resourceId: "shift-1",
      token: "old-owner-token",
    }])).rejects.toMatchObject({ status: 409 });
    expect(await entities.PlanningMutationCoordinator.get("coordinator-reowned")).toMatchObject({
      revision: 1,
      lease: { token: "new-owner-token", expires_at: expiresAt },
    });
  });
});

describe("planningApi publicatieversies", () => {
  it("serialiseert gelijktijdige publicaties van dezelfde scope naar unieke oplopende versies", async () => {
    const { base44, entities } = setup({ shifts: [shift()] });
    const create = entities.PlanningPublication.create.bind(entities.PlanningPublication);
    let enteredCreate;
    let releaseCreate;
    const atCreate = new Promise(resolve => { enteredCreate = resolve; });
    const released = new Promise(resolve => { releaseCreate = resolve; });
    let blockOnce = true;
    entities.PlanningPublication.create = async data => {
      if (blockOnce) {
        blockOnce = false;
        enteredCreate();
        await released;
      }
      return create(data);
    };
    const body = {
      scope_type: "range",
      period_start: "2026-08-17",
      period_end: "2026-08-17",
      publication_reason: "Dagplanning definitief",
    };

    const first = backend.publishPlanning(base44, user, body, context("publish-race-a"));
    await atCreate;
    await expect(backend.publishPlanning(base44, user, body, context("publish-race-b")))
      .rejects.toMatchObject({ status: 409 });
    releaseCreate();
    const firstResult = await first;
    const secondResult = await backend.publishPlanning(base44, user, body, context("publish-race-b"));

    expect(firstResult.publication.version).toBe(1);
    expect(secondResult.publication).toMatchObject({
      version: 2,
      supersedes_publication_id: firstResult.publication.id,
    });
    expect(entities.PlanningPublication.records.map(item => item.version)).toEqual([1, 2]);
  });
});

describe("planningApi copy-saga", () => {
  it("houdt een kopie verborgen na auditfalen, blokkeert foreign move en herstelt het immutable doel", async () => {
    const { base44, entities } = setup({ shifts: [shift()] });
    failAuditOnce(entities, "copy");
    const body = {
      shift_id: "shift-1",
      expected_shift_revision: 1,
      service_date: "2026-08-18",
    };
    const mutation = context("copy-audit-recovery");

    await expect(backend.copyShift(base44, user, body, mutation))
      .rejects.toThrow("tijdelijke copy-auditstoring");
    const pendingCopy = entities.PlanningShift.records.find(item => item.source_type === "copy");
    expect(pendingCopy).toMatchObject({
      status: "cancelled",
      service_date: "2026-08-18",
      metadata: {
        planning_mutation: { action: "copy", phase: "state_written_audit_pending" },
        copy_saga: { phase: "audit_pending" },
      },
    });

    await expect(backend.moveShift(base44, user, {
      shift_id: pendingCopy.id,
      expected_shift_revision: pendingCopy.revision,
      service_date: "2026-08-19",
    }, context("foreign-move-pending-copy"))).rejects.toMatchObject({ status: 409 });
    expect((await entities.PlanningShift.get(pendingCopy.id))).toMatchObject({
      status: "cancelled",
      service_date: "2026-08-18",
    });

    const recovered = await backend.copyShift(base44, user, body, mutation);
    expect(recovered.shift).toMatchObject({
      id: pendingCopy.id,
      status: "draft",
      service_date: "2026-08-18",
      metadata: { copy_saga: { phase: "completed" } },
    });
    expect(entities.PlanningShift.records.filter(item => item.source_type === "copy")).toHaveLength(1);
    expect(entities.PlanningAuditEvent.records.filter(item => item.action === "copy")).toEqual([
      expect.objectContaining({
        after_state: expect.objectContaining({
          shift: expect.objectContaining({ service_date: "2026-08-18", status: "draft" }),
        }),
      }),
    ]);
  });

  it("herstelt copy als de finale visibility-CAS na de audit uitvalt", async () => {
    const { base44, entities } = setup({ shifts: [shift()] });
    const update = entities.PlanningShift.updateMany.bind(entities.PlanningShift);
    let failFinalOnce = true;
    entities.PlanningShift.updateMany = async (query, patch) => {
      if (
        failFinalOnce
        && patch.$set?.status === "draft"
        && patch.$set?.metadata?.copy_saga?.phase === "completed"
      ) {
        failFinalOnce = false;
        return { success: true, updated: 0 };
      }
      return update(query, patch);
    };
    const body = {
      shift_id: "shift-1",
      expected_shift_revision: 1,
      service_date: "2026-08-18",
    };
    const mutation = context("copy-final-cas-recovery");

    await expect(backend.copyShift(base44, user, body, mutation)).rejects.toMatchObject({ status: 409 });
    const pendingCopy = entities.PlanningShift.records.find(item => item.source_type === "copy");
    expect(pendingCopy).toMatchObject({ status: "cancelled", metadata: { copy_saga: { phase: "audit_pending" } } });
    expect(entities.PlanningAuditEvent.records.filter(item => item.action === "copy")).toHaveLength(1);

    const recovered = await backend.copyShift(base44, user, body, mutation);
    expect(recovered.shift).toMatchObject({ status: "draft", service_date: "2026-08-18" });
    expect(entities.PlanningShift.records.filter(item => item.source_type === "copy")).toHaveLength(1);
    expect(entities.PlanningAuditEvent.records.filter(item => item.action === "copy")).toHaveLength(1);
  });

  it("blokkeert een fresh copy-target met foreign pending marker vóór reconciliatie", async () => {
    const { base44, entities } = setup({ shifts: [shift()] });
    const createCoordinator = entities.PlanningMutationCoordinator.create.bind(entities.PlanningMutationCoordinator);
    const mutation = context("copy-fresh-target-gate");
    let insertedFreshTarget = false;
    entities.PlanningMutationCoordinator.create = async data => {
      if (!insertedFreshTarget && data.resource_type === "copy_source") {
        insertedFreshTarget = true;
        entities.PlanningShift.records.push(shift({
          id: "shift-fresh-copy-target",
          source_key: `copy:shift-1:${mutation.idempotencyKey}`,
          source_type: "copy",
          source_id: "shift-1",
          metadata: {
            planning_mutation: {
              action: "assign",
              idempotency_key: "foreign-copy-target",
              actor_user_id: user.id,
              request_hash: "foreign-hash",
              phase: "state_written_audit_pending",
            },
          },
        }));
      }
      return createCoordinator(data);
    };

    await expect(backend.copyShift(base44, user, {
      shift_id: "shift-1",
      expected_shift_revision: 1,
      service_date: "2026-08-18",
    }, mutation)).rejects.toMatchObject({ status: 409 });

    expect(await entities.PlanningShift.get("shift-fresh-copy-target")).toMatchObject({
      status: "draft",
      metadata: { planning_mutation: { action: "assign", phase: "state_written_audit_pending" } },
    });
    expect(entities.PlanningAuditEvent.records).toHaveLength(0);
  });
});

describe("planningApi cross-action mutation gate", () => {
  it("blokkeert cancel op een assign die na state-write nog geen audit heeft en laat assign herstellen", async () => {
    const taskShift = shift({ source_type: "task", source_key: "task-composition:gate" });
    const { base44, entities } = setup({ shifts: [taskShift] });
    failAuditOnce(entities, "assign");
    const assignBody = {
      shift_id: taskShift.id,
      personnel_id: "personnel-1",
      slot_index: 0,
      expected_shift_revision: 1,
    };
    const assignContext = context("assign-before-foreign-cancel");
    await expect(backend.assignPersonnel(base44, user, assignBody, assignContext))
      .rejects.toThrow("tijdelijke assign-auditstoring");
    const pendingShift = await entities.PlanningShift.get(taskShift.id);

    await expect(backend.cancelTaskShift(base44, user, {
      shift_id: taskShift.id,
      expected_shift_revision: pendingShift.revision,
      expected_occurrence_revisions: {},
    }, context("foreign-cancel-pending-assign"))).rejects.toMatchObject({ status: 409 });
    expect(await entities.PlanningShift.get(taskShift.id)).toMatchObject({ status: "draft" });
    expect(entities.PlanningAssignment.records.filter(item => item.status !== "removed")).toHaveLength(1);
    expect(entities.PlanningAuditEvent.records.filter(item => item.action === "cancel_task_shift")).toHaveLength(0);

    const recovered = await backend.assignPersonnel(base44, user, assignBody, assignContext);
    expect(recovered.assignment.status).toBe("draft");
    expect(entities.PlanningAuditEvent.records.filter(item => item.action === "assign")).toHaveLength(1);
  });
});

describe("planningApi publication-saga faults", () => {
  const publishBody = {
    scope_type: "range",
    period_start: "2026-08-17",
    period_end: "2026-08-17",
    publication_reason: "Dagplanning definitief",
  };

  it("laat geen live published state achter als PlanningPublication.create vóór persist faalt", async () => {
    const { base44, entities } = setup({ shifts: [shift()] });
    const create = entities.PlanningPublication.create.bind(entities.PlanningPublication);
    let failOnce = true;
    entities.PlanningPublication.create = async data => {
      if (failOnce) {
        failOnce = false;
        throw new Error("tijdelijke publication-create-storing");
      }
      return create(data);
    };
    const firstContext = context("publish-create-recovery");

    await expect(backend.publishPlanning(base44, user, publishBody, firstContext))
      .rejects.toThrow("tijdelijke publication-create-storing");
    expect(await entities.PlanningShift.get("shift-1")).toMatchObject({ status: "draft", revision: 1 });
    expect(entities.PlanningPublication.records).toHaveLength(0);
    expect(entities.PlanningAuditEvent.records).toHaveLength(0);

    const recovered = await backend.publishPlanning(base44, user, publishBody, {
      idempotencyKey: firstContext.idempotencyKey,
      correlationId: "publish-create-recovery-new-correlation",
    });
    expect(recovered.shift).toBeUndefined();
    expect(recovered.shifts[0]).toMatchObject({ status: "published", revision: 2, published_revision: 2 });
    expect(entities.PlanningPublication.records).toHaveLength(1);
    expect(entities.PlanningAuditEvent.records.filter(item => item.action === "publish")).toHaveLength(1);
  });

  it("herstelt publication zonder audit en publiceert live pas na de herstelde audit", async () => {
    const { base44, entities } = setup({ shifts: [shift()] });
    failAuditOnce(entities, "publish");
    const mutation = context("publish-audit-recovery");

    await expect(backend.publishPlanning(base44, user, publishBody, mutation))
      .rejects.toThrow("tijdelijke publish-auditstoring");
    expect(entities.PlanningPublication.records).toHaveLength(1);
    expect(entities.PlanningAuditEvent.records).toHaveLength(0);
    expect(await entities.PlanningShift.get("shift-1")).toMatchObject({ status: "draft", revision: 1 });

    const recovered = await backend.publishPlanning(base44, user, publishBody, mutation);
    expect(recovered.shifts[0]).toMatchObject({ status: "published", revision: 2, published_revision: 2 });
    expect(entities.PlanningPublication.records).toHaveLength(1);
    expect(entities.PlanningAuditEvent.records.filter(item => item.action === "publish")).toHaveLength(1);
  });

  it("dedupliceert een PlanningPublication.create die na persist een transportfout geeft", async () => {
    const { base44, entities } = setup({ shifts: [shift()] });
    const create = entities.PlanningPublication.create.bind(entities.PlanningPublication);
    let failAfterPersistOnce = true;
    entities.PlanningPublication.create = async data => {
      const created = await create(data);
      if (failAfterPersistOnce) {
        failAfterPersistOnce = false;
        throw new Error("publication-create-response-lost");
      }
      return created;
    };
    const mutation = context("publish-create-after-persist-recovery");

    await expect(backend.publishPlanning(base44, user, publishBody, mutation))
      .rejects.toThrow("publication-create-response-lost");
    expect(entities.PlanningPublication.records).toHaveLength(1);
    expect(entities.PlanningAuditEvent.records).toHaveLength(0);
    expect(await entities.PlanningShift.get("shift-1")).toMatchObject({ status: "draft", revision: 1 });

    const recovered = await backend.publishPlanning(base44, user, publishBody, mutation);
    expect(recovered.shifts[0]).toMatchObject({ status: "published", revision: 2 });
    expect(entities.PlanningPublication.records).toHaveLength(1);
    expect(entities.PlanningAuditEvent.records.filter(item => item.action === "publish")).toHaveLength(1);
  });

  it("dedupliceert een publish-audit waarvan alleen de response verloren ging", async () => {
    const { base44, entities } = setup({ shifts: [shift()] });
    const create = entities.PlanningAuditEvent.create.bind(entities.PlanningAuditEvent);
    let failAfterPersistOnce = true;
    entities.PlanningAuditEvent.create = async data => {
      const created = await create(data);
      if (data.action === "publish" && failAfterPersistOnce) {
        failAfterPersistOnce = false;
        throw new Error("publish-audit-response-lost");
      }
      return created;
    };
    const mutation = context("publish-audit-after-persist-recovery");

    await expect(backend.publishPlanning(base44, user, publishBody, mutation))
      .rejects.toThrow("publish-audit-response-lost");
    expect(entities.PlanningPublication.records).toHaveLength(1);
    expect(entities.PlanningAuditEvent.records.filter(item => item.action === "publish")).toHaveLength(1);
    expect(await entities.PlanningShift.get("shift-1")).toMatchObject({ status: "draft", revision: 1 });

    const recovered = await backend.publishPlanning(base44, user, publishBody, mutation);
    expect(recovered.shifts[0]).toMatchObject({ status: "published", revision: 2 });
    expect(entities.PlanningPublication.records).toHaveLength(1);
    expect(entities.PlanningAuditEvent.records.filter(item => item.action === "publish")).toHaveLength(1);
  });

  it("fencet foreign move na durable audit en hervat een mislukte finale shift-CAS", async () => {
    const { base44, entities } = setup({ shifts: [shift()] });
    const update = entities.PlanningShift.updateMany.bind(entities.PlanningShift);
    let failFinalOnce = true;
    entities.PlanningShift.updateMany = async (query, patch) => {
      if (
        failFinalOnce
        && patch.$set?.status === "published"
        && patch.$set?.metadata?.publication_finalization
      ) {
        failFinalOnce = false;
        return { success: true, updated: 0 };
      }
      return update(query, patch);
    };
    const mutation = context("publish-final-cas-recovery");

    await expect(backend.publishPlanning(base44, user, publishBody, mutation)).rejects.toMatchObject({ status: 409 });
    expect(entities.PlanningPublication.records).toHaveLength(1);
    expect(entities.PlanningAuditEvent.records.filter(item => item.action === "publish")).toHaveLength(1);
    expect(await entities.PlanningShift.get("shift-1")).toMatchObject({ status: "draft", revision: 1 });

    await expect(backend.moveShift(base44, user, {
      shift_id: "shift-1",
      expected_shift_revision: 1,
      service_date: "2026-08-18",
    }, context("foreign-move-pending-publication"))).rejects.toMatchObject({ status: 409 });

    const recovered = await backend.publishPlanning(base44, user, publishBody, {
      idempotencyKey: mutation.idempotencyKey,
      correlationId: "publish-final-cas-recovery-new-correlation",
    });
    expect(recovered.shifts[0]).toMatchObject({ status: "published", revision: 2, published_revision: 2 });
    expect(entities.PlanningPublication.records).toHaveLength(1);
    expect(entities.PlanningAuditEvent.records.filter(item => item.action === "publish")).toHaveLength(1);
  });

  it("herstelt een gedeeltelijke child-finalisering voordat de parent shift zichtbaar wordt", async () => {
    const { base44, entities } = setup({ shifts: [shift()], assignments: [assignment()] });
    const update = entities.PlanningShift.updateMany.bind(entities.PlanningShift);
    let failParentOnce = true;
    entities.PlanningShift.updateMany = async (query, patch) => {
      if (failParentOnce && patch.$set?.status === "published") {
        failParentOnce = false;
        return { success: true, updated: 0 };
      }
      return update(query, patch);
    };
    const mutation = context("publish-partial-child-recovery");

    await expect(backend.publishPlanning(base44, user, publishBody, mutation)).rejects.toMatchObject({ status: 409 });
    expect(await entities.PlanningAssignment.get("assignment-1")).toMatchObject({
      status: "published",
      revision: 2,
      published_revision: 2,
    });
    expect(await entities.PlanningShift.get("shift-1")).toMatchObject({ status: "draft", revision: 1 });
    expect(entities.PlanningPublication.records).toHaveLength(1);
    expect(entities.PlanningAuditEvent.records.filter(item => item.action === "publish")).toHaveLength(1);

    const recovered = await backend.publishPlanning(base44, user, publishBody, mutation);
    expect(recovered.assignments[0]).toMatchObject({ status: "published", revision: 2 });
    expect(recovered.shifts[0]).toMatchObject({ status: "published", revision: 2 });
    expect(entities.PlanningPublication.records).toHaveLength(1);
    expect(entities.PlanningAuditEvent.records.filter(item => item.action === "publish")).toHaveLength(1);
  });

  it.each([
    ["verkeerde action", { action: "move", actor_user_id: user.id, request_hash: "wrong-hash" }],
    ["verkeerde actor", { action: "publish", actor_user_id: "admin-other", request_hash: "wrong-hash" }],
    ["verkeerde request hash", { action: "publish", actor_user_id: user.id, request_hash: "wrong-hash" }],
  ])("blokkeert dezelfde idempotency_key met %s in pending marker", async (_label, marker) => {
    const sharedKey = "shared-key-wrong-publish-marker";
    const { base44, entities } = setup({
      shifts: [shift({
        metadata: {
          planning_mutation: {
            ...marker,
            idempotency_key: sharedKey,
            phase: "state_written_audit_pending",
          },
        },
      })],
    });

    await expect(backend.publishPlanning(base44, user, publishBody, {
      idempotencyKey: sharedKey,
      correlationId: sharedKey,
    })).rejects.toMatchObject({ status: 409 });
    expect(await entities.PlanningShift.get("shift-1")).toMatchObject({ status: "draft", revision: 1 });
    expect(entities.PlanningPublication.records).toHaveLength(0);
    expect(entities.PlanningAuditEvent.records).toHaveLength(0);
  });

  it("weigert scopegroei tussen preflight en lease zonder publicatie- of businesswrites", async () => {
    const { base44, entities } = setup({ shifts: [shift({ id: "shift-a", source_key: "manual:shift-a" })] });
    const createCoordinator = entities.PlanningMutationCoordinator.create.bind(entities.PlanningMutationCoordinator);
    let insertedShift = false;
    entities.PlanningMutationCoordinator.create = async data => {
      if (!insertedShift && data.resource_type === "publication_scope") {
        insertedShift = true;
        entities.PlanningShift.records.push(shift({ id: "shift-b", source_key: "manual:shift-b" }));
      }
      return createCoordinator(data);
    };

    await expect(backend.publishPlanning(
      base44,
      user,
      publishBody,
      context("publish-frozen-shift-scope"),
    )).rejects.toMatchObject({
      status: 409,
      details: {
        code: "planning_publication_scope_changed",
        target_type: "shift",
        added_ids: ["shift-b"],
      },
    });

    expect(await entities.PlanningShift.get("shift-a")).toMatchObject({ status: "draft", revision: 1 });
    expect(await entities.PlanningShift.get("shift-b")).toMatchObject({ status: "draft", revision: 1 });
    expect(entities.PlanningPublication.records).toHaveLength(0);
    expect(entities.PlanningAuditEvent.records).toHaveLength(0);
    expect(entities.PlanningMutationCoordinator.records.every(
      item => !item.metadata?.pending_publication_intent,
    )).toBe(true);
  });

  it("weigert een nieuw segment en occurrence zonder bijbehorende preflight-fences", async () => {
    const { base44, entities } = setup({ shifts: [shift()] });
    const createCoordinator = entities.PlanningMutationCoordinator.create.bind(entities.PlanningMutationCoordinator);
    let insertedComposition = false;
    entities.PlanningMutationCoordinator.create = async data => {
      if (!insertedComposition && data.resource_type === "publication_scope") {
        insertedComposition = true;
        entities.PlanningTaskOccurrence.records.push(occurrence({ id: "occurrence-fresh" }));
        entities.PlanningShiftTaskSegment.records.push({
          id: "segment-fresh",
          shift_id: "shift-1",
          task_occurrence_id: "occurrence-fresh",
          status: "draft",
          revision: 1,
          metadata: {},
        });
      }
      return createCoordinator(data);
    };

    await expect(backend.publishPlanning(
      base44,
      user,
      publishBody,
      context("publish-frozen-composition-scope"),
    )).rejects.toMatchObject({
      status: 409,
      details: {
        code: "planning_publication_scope_changed",
        target_type: "task_segment",
        added_ids: ["segment-fresh"],
      },
    });

    expect(await entities.PlanningShift.get("shift-1")).toMatchObject({ status: "draft", revision: 1 });
    expect(await entities.PlanningTaskOccurrence.get("occurrence-fresh")).toMatchObject({ revision: 1 });
    expect(entities.PlanningPublication.records).toHaveLength(0);
    expect(entities.PlanningAuditEvent.records).toHaveLength(0);
    expect(entities.PlanningMutationCoordinator.records.every(
      item => !item.metadata?.pending_publication_intent,
    )).toBe(true);
  });

  it("herstelt partial intent-clear zonder een later verplaatste, al gefinaliseerde shift terug te draaien", async () => {
    const shifts = ["a", "b", "c"].map(suffix => shift({
      id: `shift-${suffix}`,
      source_key: `manual:shift-${suffix}`,
    }));
    const { base44, entities } = setup({ shifts });
    const updateCoordinator = entities.PlanningMutationCoordinator.updateMany
      .bind(entities.PlanningMutationCoordinator);
    let clearAttempt = 0;
    let failThirdClearOnce = true;
    entities.PlanningMutationCoordinator.updateMany = async (query, patch) => {
      if (patch.$set?.metadata?.last_completed_publication_intent_id) {
        clearAttempt += 1;
        if (failThirdClearOnce && clearAttempt === 3) {
          failThirdClearOnce = false;
          return { success: true, updated: 0 };
        }
      }
      return updateCoordinator(query, patch);
    };
    const mutation = context("publish-partial-intent-clear-replay");

    await expect(backend.publishPlanning(base44, user, publishBody, mutation))
      .rejects.toMatchObject({ status: 409 });
    expect(entities.PlanningPublication.records).toHaveLength(1);
    expect(entities.PlanningAuditEvent.records.filter(item => item.action === "publish")).toHaveLength(1);
    expect(entities.PlanningShift.records).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "published", revision: 2 }),
      expect.objectContaining({ status: "published", revision: 2 }),
      expect.objectContaining({ status: "published", revision: 2 }),
    ]));

    const clearedShiftCoordinator = entities.PlanningMutationCoordinator.records.find(item => (
      item.resource_type === "shift_composition"
      && !item.metadata?.pending_publication_intent
    ));
    expect(clearedShiftCoordinator).toBeTruthy();
    const movedShiftId = clearedShiftCoordinator.resource_id;
    const moved = await backend.moveShift(base44, user, {
      shift_id: movedShiftId,
      expected_shift_revision: 2,
      service_date: "2026-08-18",
      start_time: "09:00",
      end_time: "17:00",
    }, context("move-after-partial-publication-clear"));
    expect(moved.shift).toMatchObject({ status: "draft", revision: 3, start_time: "09:00" });

    const replay = await backend.publishPlanning(base44, user, publishBody, mutation);
    const immutableReplayShift = replay.shifts.find(item => item.id === movedShiftId);
    expect(replay).toMatchObject({ idempotent: true });
    expect(immutableReplayShift).toMatchObject({ status: "published", revision: 2, start_time: "08:00" });
    expect(await entities.PlanningShift.get(movedShiftId)).toMatchObject({
      status: "draft",
      revision: 3,
      service_date: "2026-08-18",
      start_time: "09:00",
    });
    expect(entities.PlanningMutationCoordinator.records.every(
      item => !item.metadata?.pending_publication_intent,
    )).toBe(true);
    expect(entities.PlanningPublication.records).toHaveLength(1);
    expect(entities.PlanningAuditEvent.records.filter(item => item.action === "publish")).toHaveLength(1);
  });

  it("replayt een volledig afgeronde publicatie immutable na een latere legitieme move", async () => {
    const { base44, entities } = setup({ shifts: [shift()] });
    const mutation = context("publish-complete-then-move-replay");
    await backend.publishPlanning(base44, user, publishBody, mutation);
    await backend.moveShift(base44, user, {
      shift_id: "shift-1",
      expected_shift_revision: 2,
      service_date: "2026-08-18",
      start_time: "10:00",
      end_time: "18:00",
    }, context("move-after-complete-publication"));

    const replay = await backend.publishPlanning(base44, user, publishBody, mutation);
    expect(replay).toMatchObject({
      idempotent: true,
      shifts: [expect.objectContaining({
        id: "shift-1",
        status: "published",
        revision: 2,
        start_time: "08:00",
      })],
    });
    expect(await entities.PlanningShift.get("shift-1")).toMatchObject({
      status: "draft",
      revision: 3,
      service_date: "2026-08-18",
      start_time: "10:00",
    });
    expect(entities.PlanningPublication.records).toHaveLength(1);
    expect(entities.PlanningAuditEvent.records.filter(item => item.action === "publish")).toHaveLength(1);
  });

  it("houdt coordinator-IO lineair wanneer de publicatiescope verdubbelt", async () => {
    const measure = async (count, key) => {
      const { base44, entities } = setup({
        shifts: Array.from({ length: count }, (_, index) => shift({
          id: `shift-${count}-${index}`,
          source_key: `manual:shift-${count}-${index}`,
        })),
      });
      const calls = { get: 0, updateMany: 0 };
      for (const method of Object.keys(calls)) {
        const original = entities.PlanningMutationCoordinator[method]
          .bind(entities.PlanningMutationCoordinator);
        entities.PlanningMutationCoordinator[method] = async (...args) => {
          calls[method] += 1;
          return original(...args);
        };
      }
      await backend.publishPlanning(base44, user, publishBody, context(key));
      return { ...calls, total: calls.get + calls.updateMany };
    };

    const five = await measure(5, "publish-scale-five");
    const ten = await measure(10, "publish-scale-ten");
    expect(ten.total).toBeLessThanOrEqual(five.total * 2 + 30);
    expect(ten.get).toBeLessThanOrEqual(five.get * 2 + 20);
    expect(ten.updateMany).toBeLessThanOrEqual(five.updateMany * 2 + 10);
  });

  it("isoleert route A en B in dezelfde periode in eigen scope en versiegeschiedenis", async () => {
    const { base44, entities } = setup({
      shifts: [
        shift({ id: "shift-route-a", source_key: "route:a", route_id: "route-a" }),
        shift({ id: "shift-route-b", source_key: "route:b", route_id: "route-b" }),
      ],
    });
    const routeBody = routeId => ({
      ...publishBody,
      route_id: routeId,
    });

    const routeA = await backend.publishPlanning(
      base44,
      user,
      routeBody("route-a"),
      context("publish-route-a"),
    );
    const routeB = await backend.publishPlanning(
      base44,
      user,
      routeBody("route-b"),
      context("publish-route-b"),
    );

    expect(routeA.publication).toMatchObject({ route_id: "route-a", version: 1, supersedes_publication_id: null });
    expect(routeB.publication).toMatchObject({ route_id: "route-b", version: 1, supersedes_publication_id: null });
    expect(routeA.publication.scope_key).not.toBe(routeB.publication.scope_key);
    expect(routeA.publication.snapshot.scope.route_id).toBe("route-a");
    expect(routeB.publication.snapshot.scope.route_id).toBe("route-b");
    expect(routeA.publication.shift_ids).toEqual(["shift-route-a"]);
    expect(routeB.publication.shift_ids).toEqual(["shift-route-b"]);
    expect(entities.PlanningPublication.records).toHaveLength(2);
  });
});

describe("planningApi compose source-reconciliatie gate", () => {
  it("blokkeert fresh source-key duplicates vóór occurrence-reservering of reconciliatie", async () => {
    const demand = occurrence();
    const { base44, entities } = setup({ occurrences: [demand] });
    const mutation = context("compose-fresh-duplicate-gate");
    const createCoordinator = entities.PlanningMutationCoordinator.create.bind(entities.PlanningMutationCoordinator);
    let insertedFreshDuplicates = false;
    entities.PlanningMutationCoordinator.create = async data => {
      if (
        !insertedFreshDuplicates
        && data.resource_type === "shift_composition"
        && String(data.resource_id).includes(mutation.idempotencyKey)
      ) {
        insertedFreshDuplicates = true;
        const sourceKey = `task-composition:${mutation.idempotencyKey}`;
        entities.PlanningShift.records.push(
          shift({ id: "shift-compose-fresh-a", source_key: sourceKey, source_type: "task" }),
          shift({
            id: "shift-compose-fresh-b",
            source_key: sourceKey,
            source_type: "task",
            metadata: {
              planning_mutation: {
                action: "assign",
                idempotency_key: "foreign-compose-duplicate",
                actor_user_id: user.id,
                request_hash: "foreign-hash",
                phase: "state_written_audit_pending",
              },
            },
          }),
        );
      }
      return createCoordinator(data);
    };

    await expect(backend.composeShift(base44, user, {
      segments: [{ task_occurrence_id: demand.id, start_time: "08:00", end_time: "16:00" }],
      expected_occurrence_revisions: { [demand.id]: 1 },
    }, mutation)).rejects.toMatchObject({ status: 409 });

    expect(await entities.PlanningTaskOccurrence.get(demand.id)).toMatchObject({ revision: 1, metadata: {} });
    expect(entities.PlanningShift.records.map(item => ({ id: item.id, status: item.status }))).toEqual([
      { id: "shift-compose-fresh-a", status: "draft" },
      { id: "shift-compose-fresh-b", status: "draft" },
    ]);
    expect(entities.PlanningShiftTaskSegment.records).toHaveLength(0);
    expect(entities.PlanningAuditEvent.records).toHaveLength(0);
  });
});
