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
  const listCalls = [];
  const filterCalls = [];
  const matchesValue = (actual, expected) => {
    if (!expected || typeof expected !== "object" || Array.isArray(expected)) {
      return actual === expected;
    }
    if (Object.hasOwn(expected, "$in")) {
      const actualValues = Array.isArray(actual) ? actual : [actual];
      if (!actualValues.some(value => expected.$in.includes(value))) return false;
    }
    if (Object.hasOwn(expected, "$gte") && !(actual >= expected.$gte)) return false;
    if (Object.hasOwn(expected, "$lte") && !(actual <= expected.$lte)) return false;
    if (Object.hasOwn(expected, "$ne") && actual === expected.$ne) return false;
    return true;
  };
  const matches = (record, query = {}) => Object.entries(query).every(([key, value]) => (
    key === "$or"
      ? value.some(part => matches(record, part))
      : matchesValue(record[key], value)
  ));
  const page = (items, limit, offset) => items.slice(Number(offset || 0), Number(offset || 0) + Number(limit || items.length));
  return {
    records,
    listCalls,
    filterCalls,
    async list(sort, limit, offset) {
      listCalls.push({ sort, limit, offset });
      return page(records, limit, offset).map(item => structuredClone(item));
    },
    async filter(query, sort, limit, offset) {
      filterCalls.push({ query: structuredClone(query), sort, limit, offset });
      return page(records.filter(item => matches(item, query)), limit, offset)
        .map(item => structuredClone(item));
    },
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
  const commercialContract = {
    id: "customer-contract-1",
    customer_id: "customer-1",
    customer_account_id: "customer-account-1",
    company_id: "seller-company-1",
    status: "active",
    start_date: "2020-01-01",
    end_date: null,
    version: 1,
  };
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
    CustomerContract: entity([commercialContract], "customer-contract"),
    CustomerContractLine: entity([{
      id: "customer-contract-line-reception",
      contract_id: commercialContract.id,
      customer_id: commercialContract.customer_id,
      customer_account_id: commercialContract.customer_account_id,
      company_id: commercialContract.company_id,
      scope_type: "customer",
      task_type_key: "reception",
      status: "active",
      sequence: 1,
      version: 1,
    }], "customer-contract-line"),
    Collectief: entity([], "collective"),
  };
  return {
    base44: {
      asServiceRole: {
        entities,
        functions: {
          invoke: async (_name, payload) => ({
            service_date: payload?.service_date || null,
            decision_status: "assignable",
            planning_assignment_allowed: true,
            draft_assignment_allowed: true,
            payroll_final_allowed: false,
            employment_routing_status: "resolved",
            contract_id: "personnel-contract-1",
            employing_company_id: "employer-company-1",
            payroll_cao_key: "cao_particuliere_beveiliging",
            selected_contract: {
              id: "personnel-contract-1",
              company_id: "employer-company-1",
              cao_key: "cao_particuliere_beveiliging",
            },
          }),
        },
      },
    },
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

  it("laat undo van unassign geen harde inzetblokkade omzeilen", async () => {
    const { base44, entities } = setup({ shifts: [shift()], assignments: [assignment()] });
    const unassigned = await backend.unassignPersonnel(base44, user, {
      shift_id: "shift-1",
      assignment_id: "assignment-1",
      expected_shift_revision: 1,
    }, context("unassign-before-blocked-undo"));
    entities.Personnel.records[0].available_for_planning = false;
    const shiftBeforeUndo = structuredClone(await entities.PlanningShift.get("shift-1"));

    await expect(backend.undoPlanning(base44, user, {
      audit_event_id: unassigned.audit_event_id,
      undo_token: unassigned.undo_token,
      expected_shift_revision: unassigned.shift.revision,
    }, context("blocked-unassign-undo"))).rejects.toMatchObject({
      status: 409,
      details: {
        code: "ASSIGNMENT_DRAFT_NOT_ALLOWED",
        draft_assignment_allowed: false,
        warning_codes: expect.arrayContaining(["personnel_not_active"]),
      },
    });

    expect(await entities.PlanningAssignment.get("assignment-1")).toMatchObject({
      status: "removed",
      revision: unassigned.assignment.revision,
    });
    expect(await entities.PlanningShift.get("shift-1")).toEqual(shiftBeforeUndo);
    expect(entities.PlanningAuditEvent.records.filter(item => item.action === "undo")).toHaveLength(0);
  });

  it("laat undo van move geen harde inzetblokkade omzeilen", async () => {
    const { base44, entities } = setup({ shifts: [shift()], assignments: [assignment()] });
    const moved = await backend.moveShift(base44, user, {
      shift_id: "shift-1",
      expected_shift_revision: 1,
      service_date: "2026-08-18",
    }, context("move-before-blocked-undo"));
    entities.Personnel.records[0].available_for_planning = false;
    const shiftBeforeUndo = structuredClone(await entities.PlanningShift.get("shift-1"));
    const assignmentBeforeUndo = structuredClone(await entities.PlanningAssignment.get("assignment-1"));

    await expect(backend.undoPlanning(base44, user, {
      audit_event_id: moved.audit_event_id,
      undo_token: moved.undo_token,
      expected_shift_revision: moved.shift.revision,
    }, context("blocked-move-undo"))).rejects.toMatchObject({
      status: 409,
      details: {
        code: "ASSIGNMENT_DRAFT_NOT_ALLOWED",
        draft_assignment_allowed: false,
      },
    });

    expect(await entities.PlanningShift.get("shift-1")).toEqual(shiftBeforeUndo);
    expect(await entities.PlanningAssignment.get("assignment-1")).toEqual(assignmentBeforeUndo);
    expect(entities.PlanningAuditEvent.records.filter(item => item.action === "undo")).toHaveLength(0);
  });

  it("herstelt een reeds geschreven undo-audit met het opgeslagen inzetbewijs", async () => {
    const { base44, entities } = setup({ shifts: [shift()], assignments: [assignment()] });
    const unassigned = await backend.unassignPersonnel(base44, user, {
      shift_id: "shift-1",
      assignment_id: "assignment-1",
      expected_shift_revision: 1,
    }, context("unassign-before-evidence-undo"));
    let validationCalls = 0;
    base44.asServiceRole.functions.invoke = async (_name, payload) => {
      validationCalls += 1;
      return {
        service_date: payload.service_date,
        decision_status: "assignable",
        planning_assignment_allowed: true,
        draft_assignment_allowed: true,
        payroll_final_allowed: false,
        employment_routing_status: "resolved",
        contract_id: "personnel-contract-1",
        employing_company_id: "employer-company-1",
        payroll_cao_key: "cao_particuliere_beveiliging",
      };
    };
    failAuditOnce(entities, "undo");
    const body = {
      audit_event_id: unassigned.audit_event_id,
      undo_token: unassigned.undo_token,
      expected_shift_revision: unassigned.shift.revision,
    };
    const mutation = context("undo-evidence-recovery");

    await expect(backend.undoPlanning(base44, user, body, mutation))
      .rejects.toThrow("tijdelijke undo-auditstoring");
    expect(validationCalls).toBe(1);
    const stateBeforeRecovery = structuredClone({
      shift: await entities.PlanningShift.get("shift-1"),
      assignment: await entities.PlanningAssignment.get("assignment-1"),
    });
    expect(stateBeforeRecovery.shift.metadata?.planning_mutation).toMatchObject({
      action: "undo",
      phase: "state_written_audit_pending",
      assignment_draft_evidence_by_assignment_id: {
        "assignment-1": {
          personnel_id: "personnel-1",
          draft_assignment_allowed: true,
        },
      },
    });
    entities.Personnel.records[0].available_for_planning = false;
    base44.asServiceRole.functions.invoke = async () => {
      validationCalls += 1;
      return {
        decision_status: "blocked",
        planning_assignment_allowed: false,
        draft_assignment_allowed: false,
        employment_routing_status: "resolved",
      };
    };

    const recovered = await backend.undoPlanning(base44, user, body, mutation);

    expect(recovered).toMatchObject({ undoable: false, assignment: { status: "draft" } });
    expect(validationCalls).toBe(1);
    expect({
      shift: await entities.PlanningShift.get("shift-1"),
      assignment: await entities.PlanningAssignment.get("assignment-1"),
    }).toEqual(stateBeforeRecovery);
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

describe("planningApi niet-wegklikbare contractrouteringspoort", () => {
  function taskPublicationFixture({ withAssignment = false } = {}) {
    const demand = occurrence({
      company_id: "company-1",
      service_responsible_company_id: "company-1",
      task_type_key: "reception",
      security_plan_id: "security-plan-1",
      security_plan_revision_id: "security-plan-revision-1",
      security_plan_snapshot: {
        plan: { id: "security-plan-1" },
        published_revision: {
          id: "security-plan-revision-1",
          security_plan_id: "security-plan-1",
          status: "published",
          revision_number: 1,
        },
      },
      selling_company_id: "stale-seller",
      customer_contract_id: "stale-customer-contract",
      customer_contract_line_id: "stale-customer-contract-line",
      commercial_routing_status: "resolved",
      commercial_routing_snapshot: {
        schema_version: 1,
        status: "resolved",
        selling_company_id: "stale-seller",
        customer_contract_id: "stale-customer-contract",
        customer_contract_line_id: "stale-customer-contract-line",
      },
    });
    const taskShift = shift({
      source_key: "task-composition:publication-routing",
      source_type: "task",
      source_id: demand.object_task_definition_id,
      customer_id: demand.customer_id,
      customer_ids: [demand.customer_id],
      object_id: demand.object_id,
      object_ids: [demand.object_id],
      task_occurrence_ids: [demand.id],
      task_segment_count: 1,
      selling_company_id: "stale-seller",
      selling_company_ids: ["stale-seller"],
      customer_contract_id: "stale-customer-contract",
      customer_contract_line_id: "stale-customer-contract-line",
      service_context_snapshot: {
        segment_contexts: [{
          task_occurrence_id: demand.id,
          customer_id: demand.customer_id,
          object_id: demand.object_id,
          task_type: demand.task_type,
          task_type_key: demand.task_type_key,
        }],
      },
    });
    const segment = {
      id: "segment-1",
      shift_id: taskShift.id,
      task_occurrence_id: demand.id,
      object_task_definition_id: demand.object_task_definition_id,
      sequence_index: 0,
      start_date: demand.service_date,
      end_date: demand.end_date,
      start_time: demand.window_start_time,
      end_time: demand.window_end_time,
      timezone: demand.timezone,
      duration_minutes: demand.required_minutes,
      company_id: demand.company_id,
      service_responsible_company_id: demand.service_responsible_company_id,
      selling_company_id: "stale-seller",
      customer_contract_id: "stale-customer-contract",
      customer_contract_line_id: "stale-customer-contract-line",
      commercial_routing_status: "resolved",
      commercial_routing_snapshot: demand.commercial_routing_snapshot,
      customer_id: demand.customer_id,
      object_id: demand.object_id,
      task_type: demand.task_type,
      task_type_key: demand.task_type_key,
      task_name_snapshot: demand.task_name_snapshot,
      status: "draft",
      revision: 1,
      published_revision: 0,
      metadata: {},
    };
    return {
      ...setup({
      shifts: [taskShift],
      assignments: withAssignment ? [assignment()] : [],
      occurrences: [demand],
      segments: [segment],
      }),
      fixture: { demand, taskShift, segment },
    };
  }

  function makeInternalNonBillable(records, suffix = "internal") {
    const internalOccurrence = {
      ...structuredClone(records.demand),
      id: `occurrence-${suffix}`,
      source_key: `internal-task:${suffix}:2026-08-17`,
      customer_id: null,
      customer_name_snapshot: null,
      selling_company_id: null,
      customer_contract_id: null,
      customer_contract_line_id: null,
      commercial_routing_status: "stale",
      commercial_routing_snapshot: null,
    };
    const internalShift = {
      ...structuredClone(records.taskShift),
      id: `shift-${suffix}`,
      source_key: `task-composition:${suffix}`,
      source_id: internalOccurrence.object_task_definition_id,
      customer_id: null,
      customer_ids: [],
      customer_name_snapshot: null,
      customer_billable: false,
      task_occurrence_ids: [internalOccurrence.id],
      selling_company_id: null,
      selling_company_ids: [],
      customer_contract_id: null,
      customer_contract_line_id: null,
      service_context_snapshot: {
        segment_contexts: [{
          task_occurrence_id: internalOccurrence.id,
          customer_id: null,
          object_id: internalOccurrence.object_id,
          task_type: internalOccurrence.task_type,
          task_type_key: internalOccurrence.task_type_key,
        }],
      },
    };
    const internalSegment = {
      ...structuredClone(records.segment),
      id: `segment-${suffix}`,
      shift_id: internalShift.id,
      task_occurrence_id: internalOccurrence.id,
      customer_id: null,
      customer_name_snapshot: null,
      selling_company_id: null,
      customer_contract_id: null,
      customer_contract_line_id: null,
      commercial_routing_status: "stale",
      commercial_routing_snapshot: null,
    };
    return { internalOccurrence, internalShift, internalSegment };
  }

  const publicationBody = {
    scope_type: "selection",
    shift_ids: ["shift-1"],
    expected_shift_revisions: { "shift-1": 1 },
    publication_reason: "Contractroutes definitief vastleggen",
  };

  it("publiceert pasbewijs voor werkgever B en weigert bewijs van alleen taakbedrijf A", async () => {
    const wrongCompany = taskPublicationFixture({ withAssignment: true });
    wrongCompany.entities.PlanningShift.records[0].required_security_pass_types = ["green"];
    wrongCompany.entities.PersonnelSecurityPass.records.push({
      id: "pass-operating-a",
      personnel_id: "personnel-1",
      company_id: "company-1",
      pass_type: "green",
      status: "active",
      valid_from: "2026-01-01",
      valid_until: "2026-12-31",
    });

    await expect(backend.publishPlanning(
      wrongCompany.base44,
      user,
      publicationBody,
      context("publish-pass-wrong-operating-company"),
    )).rejects.toMatchObject({
      status: 409,
      details: expect.objectContaining({
        code: "PLANNING_CONTRACT_ROUTING_NOT_READY",
        routing_issues: expect.arrayContaining([
          expect.objectContaining({
            reason: "employment_assignment_hard_gate_blocked",
            draft_assignment_blocking_codes: expect.arrayContaining(["security_pass_blocked"]),
          }),
        ]),
      }),
    });

    const correctEmployer = taskPublicationFixture({ withAssignment: true });
    correctEmployer.entities.PlanningShift.records[0].required_security_pass_types = ["green"];
    correctEmployer.entities.PersonnelSecurityPass.records.push({
      id: "pass-employer-b",
      personnel_id: "personnel-1",
      company_id: "employer-company-1",
      pass_type: "green",
      status: "active",
      valid_from: "2026-01-01",
      valid_until: "2026-12-31",
    });

    const published = await backend.publishPlanning(
      correctEmployer.base44,
      user,
      publicationBody,
      context("publish-pass-correct-employer"),
    );
    expect(published.assignments[0]).toMatchObject({
      status: "published",
      employing_company_id: "employer-company-1",
    });
  });

  it("staat alleen een expliciet klantloze en niet-factureerbare occurrence commercieel vrij", () => {
    const internalOccurrence = { id: "occurrence-internal", customer_id: null };
    const internalSegment = {
      id: "segment-internal",
      shift_id: "shift-internal",
      task_occurrence_id: internalOccurrence.id,
      customer_id: null,
      status: "draft",
    };
    const internalShift = {
      id: "shift-internal",
      customer_id: null,
      customer_ids: [],
      customer_billable: false,
    };

    expect(backend.publicationCommercialExemption(
      internalOccurrence,
      [internalSegment],
      new Map([[internalShift.id, internalShift]]),
    )).toMatchObject({
      exempt: true,
      reason: "explicit_internal_non_billable",
      shift_ids: ["shift-internal"],
      segment_ids: ["segment-internal"],
    });

    expect(backend.publicationCommercialExemption(
      internalOccurrence,
      [],
      new Map([[internalShift.id, internalShift]]),
    )).toMatchObject({ exempt: false, reason: "missing_internal_segment_evidence" });
    expect(backend.publicationCommercialExemption(
      internalOccurrence,
      [internalSegment],
      new Map(),
    )).toMatchObject({
      exempt: false,
      integrity_issues: [expect.objectContaining({ reason: "parent_shift_missing" })],
    });
    expect(backend.publicationCommercialExemption(
      internalOccurrence,
      [internalSegment],
      new Map([[internalShift.id, { ...internalShift, customer_billable: null }]]),
    )).toMatchObject({
      exempt: false,
      integrity_issues: [expect.objectContaining({ reason: "non_billable_not_explicit" })],
    });
    expect(backend.publicationCommercialExemption(
      { ...internalOccurrence, customer_id: "customer-1" },
      [internalSegment],
      new Map([[internalShift.id, internalShift]]),
    )).toMatchObject({ exempt: false, reason: "customer_context_present" });
    expect(backend.publicationCommercialExemption(
      { ...internalOccurrence, customer_name_snapshot: "Klant zonder ID" },
      [internalSegment],
      new Map([[internalShift.id, internalShift]]),
    )).toMatchObject({ exempt: false, reason: "customer_context_present" });
    expect(backend.publicationCommercialExemption(
      { ...internalOccurrence, customer_contract_id: "stale-contract" },
      [internalSegment],
      new Map([[internalShift.id, internalShift]]),
    )).toMatchObject({ exempt: false, reason: "commercial_identity_present" });
    expect(backend.publicationCommercialExemption(
      internalOccurrence,
      [internalSegment],
      new Map([[internalShift.id, { ...internalShift, customer_id: "customer-1" }]]),
    )).toMatchObject({
      exempt: false,
      integrity_issues: [expect.objectContaining({ reason: "customer_context_present" })],
    });
  });

  it("publiceert een aantoonbaar interne niet-factureerbare taak met een not_applicable-bewijs", async () => {
    const prepared = taskPublicationFixture();
    const { internalOccurrence, internalShift, internalSegment } = makeInternalNonBillable(
      prepared.fixture,
    );
    const { base44, entities } = setup({
      shifts: [internalShift],
      occurrences: [internalOccurrence],
      segments: [internalSegment],
    });

    const result = await backend.publishPlanning(base44, user, {
      ...publicationBody,
      shift_ids: [internalShift.id],
      expected_shift_revisions: { [internalShift.id]: 1 },
    }, context("publish-explicit-internal-non-billable"));

    expect(result.publication.snapshot.task_occurrences[0]).toMatchObject({
      id: internalOccurrence.id,
      customer_id: null,
      selling_company_id: null,
      customer_contract_id: null,
      customer_contract_line_id: null,
      commercial_routing_status: "not_applicable",
      commercial_routing_snapshot: expect.objectContaining({
        schema_version: 1,
        status: "not_applicable",
        reason: "explicit_internal_non_billable",
        customer_billable: false,
        evidence_shift_ids: [internalShift.id],
        evidence_segment_ids: [internalSegment.id],
      }),
    });
    expect(result.publication.snapshot.task_segments[0]).toMatchObject({
      id: internalSegment.id,
      commercial_routing_status: "not_applicable",
      customer_contract_id: null,
    });
    expect(result.publication.snapshot.shifts[0]).toMatchObject({
      id: internalShift.id,
      customer_billable: false,
      selling_company_id: null,
      customer_contract_id: null,
      customer_contract_line_id: null,
    });
    expect(await entities.PlanningTaskOccurrence.get(internalOccurrence.id)).toMatchObject({
      commercial_routing_status: "not_applicable",
      revision: 2,
    });
  });

  it("houdt klantcontext routeplichtig, ook wanneer de parentshift expliciet niet-factureerbaar is", async () => {
    const { base44, entities } = taskPublicationFixture();
    entities.PlanningShift.records[0].customer_billable = false;
    entities.CustomerContractLine.records.length = 0;

    await expect(backend.publishPlanning(
      base44,
      user,
      publicationBody,
      context("publish-customer-non-billable-without-route"),
    )).rejects.toMatchObject({
      status: 409,
      details: {
        code: "PLANNING_CONTRACT_ROUTING_NOT_READY",
        routing_issues: [expect.objectContaining({
          route_type: "commercial",
          status: "missing_contract",
          reason: "no_matching_customer_contract_line",
        })],
      },
    });
  });

  it("publiceert resolved en vrijgestelde commerciële segmenten samen zonder top-level contractbewijs te verzinnen", async () => {
    const prepared = taskPublicationFixture();
    const { internalOccurrence, internalShift, internalSegment } = makeInternalNonBillable(
      prepared.fixture,
      "internal-mixed",
    );
    const { base44 } = setup({
      shifts: [prepared.fixture.taskShift, internalShift],
      occurrences: [prepared.fixture.demand, internalOccurrence],
      segments: [prepared.fixture.segment, internalSegment],
    });

    const result = await backend.publishPlanning(base44, user, {
      scope_type: "selection",
      shift_ids: [prepared.fixture.taskShift.id, internalShift.id],
      expected_shift_revisions: {
        [prepared.fixture.taskShift.id]: 1,
        [internalShift.id]: 1,
      },
      publication_reason: "Gemengde commerciële routebewijzen",
    }, context("publish-mixed-resolved-and-exempt-commercial"));

    expect(result.publication.snapshot.task_occurrences).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: prepared.fixture.demand.id,
        commercial_routing_status: "resolved",
        customer_contract_id: "customer-contract-1",
      }),
      expect.objectContaining({
        id: internalOccurrence.id,
        commercial_routing_status: "not_applicable",
        customer_contract_id: null,
      }),
    ]));
    expect(result.publication.snapshot.shifts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: prepared.fixture.taskShift.id,
        customer_contract_id: "customer-contract-1",
      }),
      expect.objectContaining({
        id: internalShift.id,
        selling_company_id: null,
        customer_contract_id: null,
        customer_contract_line_id: null,
      }),
    ]));
  });

  it("blokkeert een ontbrekende commerciële route ook met waarschuwingbevestiging en kan veilig met dezelfde sleutel opnieuw", async () => {
    const { base44, entities } = taskPublicationFixture();
    const validLine = structuredClone(entities.CustomerContractLine.records[0]);
    entities.CustomerContractLine.records.length = 0;
    const mutation = context("publish-missing-commercial-route");

    await expect(backend.publishPlanning(base44, user, {
      ...publicationBody,
      acknowledge_critical_warnings: true,
      critical_warning_acknowledgement_reason: "Mag contractroutering niet omzeilen",
    }, mutation)).rejects.toMatchObject({
      status: 409,
      details: {
        code: "PLANNING_CONTRACT_ROUTING_NOT_READY",
        acknowledgement_bypass_allowed: false,
        commercial_issue_count: 1,
        employment_issue_count: 0,
        routing_issues: [expect.objectContaining({
          route_type: "commercial",
          task_occurrence_id: "occurrence-1",
          status: "missing_contract",
          reason: "no_matching_customer_contract_line",
        })],
      },
    });
    expect(entities.PlanningPublication.records).toHaveLength(0);
    expect(entities.PlanningAuditEvent.records).toHaveLength(0);
    expect(await entities.PlanningShift.get("shift-1")).toMatchObject({ status: "draft", revision: 1 });
    expect(await entities.PlanningTaskOccurrence.get("occurrence-1")).toMatchObject({
      customer_contract_id: "stale-customer-contract",
      revision: 1,
    });

    entities.CustomerContractLine.records.push(validLine);
    const retried = await backend.publishPlanning(base44, user, {
      ...publicationBody,
      acknowledge_critical_warnings: true,
      critical_warning_acknowledgement_reason: "Mag contractroutering niet omzeilen",
    }, mutation);
    expect(retried.publication.version).toBe(1);
    expect(entities.PlanningPublication.records).toHaveLength(1);
  });

  it("vervangt stale commerciële en arbeidsroutes door verse, rolgescheiden manifest- en publicatiesnapshots", async () => {
    const { base44, entities } = taskPublicationFixture({ withAssignment: true });
    base44.asServiceRole.functions.invoke = async (_name, payload) => ({
      service_date: payload.service_date,
      decision_status: "assignable",
      planning_assignment_allowed: true,
      draft_assignment_allowed: true,
      payroll_final_allowed: false,
      employment_routing_status: "resolved",
      contract_id: "personnel-contract-employer-b",
      employing_company_id: "employer-company-b",
      payroll_cao_key: "cao_particuliere_beveiliging",
      selected_contract: {
        id: "personnel-contract-employer-b",
        company_id: "employer-company-b",
        cao_key: "cao_particuliere_beveiliging",
      },
      schedule_gate: {
        required: false,
        ready: true,
        payroll_final_ready: false,
      },
    });

    const result = await backend.publishPlanning(
      base44,
      user,
      publicationBody,
      context("publish-fresh-role-separated-routes"),
    );

    expect(result.publication.snapshot.shifts[0]).toMatchObject({
      company_id: "company-1",
      selling_company_id: "seller-company-1",
      customer_contract_id: "customer-contract-1",
      customer_contract_line_id: "customer-contract-line-reception",
      customer_billable: true,
    });
    expect(result.publication.snapshot.task_occurrences[0]).toMatchObject({
      selling_company_id: "seller-company-1",
      customer_contract_id: "customer-contract-1",
      customer_contract_line_id: "customer-contract-line-reception",
      commercial_routing_status: "resolved",
      commercial_routing_snapshot: expect.objectContaining({
        customer_contract_version: 1,
        customer_contract_line_version: 1,
        customer_billable: true,
      }),
    });
    expect(result.publication.snapshot.task_segments[0]).toMatchObject({
      commercial_routing_status: "resolved",
      commercial_routing_snapshot: expect.objectContaining({ customer_billable: true }),
    });
    expect(result.publication.snapshot.assignments[0]).toMatchObject({
      personnel_contract_id: "personnel-contract-employer-b",
      employing_company_id: "employer-company-b",
      payroll_cao_key: "cao_particuliere_beveiliging",
      employment_routing_status: "resolved",
      contract_routing_snapshot: expect.objectContaining({
        contract_id: "personnel-contract-employer-b",
        employing_company_id: "employer-company-b",
      }),
    });
    expect(result.publication.metadata.finalization_manifest).toMatchObject({
      shifts: [expect.objectContaining({
        patch: expect.objectContaining({
          customer_billable: true,
          service_context_snapshot: expect.objectContaining({ customer_billable: true }),
        }),
      })],
      assignments: [expect.objectContaining({
        patch: expect.objectContaining({
          personnel_contract_id: "personnel-contract-employer-b",
          contract_routing_snapshot: expect.objectContaining({
            contract_id: "personnel-contract-employer-b",
          }),
        }),
      })],
      task_occurrences: [expect.objectContaining({
        patch: expect.objectContaining({
          customer_contract_id: "customer-contract-1",
          commercial_routing_status: "resolved",
        }),
      })],
    });
    expect(await entities.PlanningAssignment.get("assignment-1")).toMatchObject({
      personnel_contract_id: "personnel-contract-employer-b",
      employing_company_id: "employer-company-b",
      status: "published",
    });
  });

  it("blokkeert een dubbel passende commerciële contractregel met beide kandidaten als bewijs", async () => {
    const { base44, entities } = taskPublicationFixture();
    entities.CustomerContractLine.records.push({
      ...structuredClone(entities.CustomerContractLine.records[0]),
      id: "customer-contract-line-reception-duplicate",
    });

    await expect(backend.publishPlanning(
      base44,
      user,
      publicationBody,
      context("publish-ambiguous-commercial-route"),
    )).rejects.toMatchObject({
      status: 409,
      details: {
        code: "PLANNING_CONTRACT_ROUTING_NOT_READY",
        routing_issues: [expect.objectContaining({
          route_type: "commercial",
          status: "ambiguous",
          reason: "multiple_matching_customer_contract_lines",
          candidates: expect.arrayContaining([
            expect.objectContaining({
              customer_contract_line_id: "customer-contract-line-reception",
            }),
            expect.objectContaining({
              customer_contract_line_id: "customer-contract-line-reception-duplicate",
            }),
          ]),
        })],
      },
    });
    expect(entities.PlanningPublication.records).toHaveLength(0);
  });

  it("blokkeert een ontbrekende arbeidsroute ook met waarschuwingbevestiging", async () => {
    const { base44, entities } = setup({
      shifts: [shift()],
      assignments: [assignment({
        personnel_contract_id: "stale-personnel-contract",
        employing_company_id: "stale-employer",
        payroll_cao_key: "stale-cao",
        employment_routing_status: "resolved",
      })],
    });
    base44.asServiceRole.functions.invoke = async (_name, payload) => ({
      service_date: payload.service_date,
      decision_status: "blocked",
      planning_assignment_allowed: false,
      payroll_final_allowed: false,
      employment_routing_status: "missing_contract",
      contract_id: null,
      employing_company_id: null,
      payroll_cao_key: null,
    });

    await expect(backend.publishPlanning(base44, user, {
      scope_type: "range",
      period_start: "2026-08-17",
      period_end: "2026-08-17",
      publication_reason: "Arbeidsroute moet bewezen zijn",
      acknowledge_critical_warnings: true,
      critical_warning_acknowledgement_reason: "Mag arbeidsroute niet omzeilen",
    }, context("publish-missing-employment-route"))).rejects.toMatchObject({
      status: 409,
      details: {
        code: "PLANNING_CONTRACT_ROUTING_NOT_READY",
        acknowledgement_bypass_allowed: false,
        commercial_issue_count: 0,
        employment_issue_count: 1,
        routing_issues: [expect.objectContaining({
          route_type: "employment",
          assignment_id: "assignment-1",
          status: "missing_contract",
        })],
      },
    });
    expect(entities.PlanningPublication.records).toHaveLength(0);
    expect(entities.PlanningAuditEvent.records).toHaveLength(0);
    expect(await entities.PlanningAssignment.get("assignment-1")).toMatchObject({
      personnel_contract_id: "stale-personnel-contract",
      status: "draft",
      revision: 1,
    });
  });

  it("blokkeert publicatie als de arbeidsroute bestaat maar actuele inzetgereedheid faalt", async () => {
    const { base44, entities } = setup({
      shifts: [shift()],
      assignments: [assignment()],
    });
    base44.asServiceRole.functions.invoke = async (_name, payload) => ({
      service_date: payload.service_date,
      decision_status: "blocked",
      planning_assignment_allowed: false,
      draft_assignment_allowed: false,
      payroll_final_allowed: false,
      employment_routing_status: "resolved",
      contract_id: "personnel-contract-1",
      employing_company_id: "employer-company-1",
      payroll_cao_key: "cao_particuliere_beveiliging",
      selected_contract: {
        id: "personnel-contract-1",
        company_id: "employer-company-1",
        cao_key: "cao_particuliere_beveiliging",
      },
      blocking_reasons: ["Vereist WPBR- of kwalificatiebewijs ontbreekt."],
    });

    await expect(backend.publishPlanning(base44, user, {
      scope_type: "range",
      period_start: "2026-08-17",
      period_end: "2026-08-17",
      publication_reason: "Actuele inzetgereedheid moet bewezen zijn",
      acknowledge_critical_warnings: true,
      critical_warning_acknowledgement_reason: "Mag harde inzetblokkades niet omzeilen",
    }, context("publish-employment-readiness-blocked"))).rejects.toMatchObject({
      status: 409,
      details: {
        code: "PLANNING_CONTRACT_ROUTING_NOT_READY",
        acknowledgement_bypass_allowed: false,
        employment_issue_count: 1,
        routing_issues: [expect.objectContaining({
          route_type: "employment",
          assignment_id: "assignment-1",
          status: "blocked",
          reason: "employment_assignment_not_allowed",
          blocking_reasons: ["Vereist WPBR- of kwalificatiebewijs ontbreekt."],
        })],
      },
    });
    expect(entities.PlanningPublication.records).toHaveLength(0);
    expect(entities.PlanningAuditEvent.records).toHaveLength(0);
    expect(await entities.PlanningAssignment.get("assignment-1")).toMatchObject({
      status: "draft",
      revision: 1,
    });
  });

  it.each([
    {
      label: "medewerker is intussen niet beschikbaar",
      expectedWarningCode: "personnel_not_active",
      expectedBlockingCode: "personnel_not_available",
      mutate: entities => { entities.Personnel.records[0].available_for_planning = false; },
    },
    {
      label: "goedgekeurde afwezigheid is intussen geregistreerd",
      expectedWarningCode: "personnel_absence_vacation",
      expectedBlockingCode: "personnel_absence",
      mutate: entities => { entities.PersonnelAbsence.records.push({
        id: "absence-live-publication",
        personnel_id: "personnel-1",
        absence_type: "vacation",
        status: "approved",
        start_date: "2026-08-17",
        end_date: "2026-08-17",
      }); },
    },
    {
      label: "een overlappende dienst is intussen toegevoegd",
      expectedWarningCode: "shift_overlap",
      expectedBlockingCode: "shift_overlap",
      mutate: entities => {
        entities.PlanningShift.records.push(shift({
          id: "shift-live-overlap",
          source_key: "manual:live-overlap",
          start_time: "12:00",
          end_time: "18:00",
        }));
        entities.PlanningAssignment.records.push(assignment({
          id: "assignment-live-overlap",
          shift_id: "shift-live-overlap",
        }));
      },
    },
    {
      label: "een actieve objectrestrictie is intussen toegevoegd",
      expectedWarningCode: "personnel_restriction",
      expectedBlockingCode: "personnel_restriction",
      mutate: entities => { entities.PersonnelRestriction.records.push({
        id: "restriction-live-publication",
        personnel_id: "personnel-1",
        status: "active",
        may_work: false,
        scope_type: "object",
        scope_id: "object-1",
        scope_label: "Object 1",
        valid_from: "2026-08-17",
        valid_until: "2026-08-17",
      }); },
    },
    {
      label: "een vereiste beveiligingspas is intussen verlopen",
      expectedWarningCode: "security_pass_expired",
      expectedBlockingCode: "security_pass_blocked",
      mutate: entities => {
        entities.PlanningShift.records[0].required_security_pass_types = ["green"];
        entities.PersonnelSecurityPass.records.push({
          id: "pass-live-publication",
          personnel_id: "personnel-1",
          company_id: "employer-company-1",
          pass_type: "green",
          status: "expired",
          valid_until: "2026-08-16",
        });
      },
    },
  ])("blokkeert met actuele servergegevens wanneer $label", async ({
    expectedWarningCode,
    expectedBlockingCode,
    mutate,
  }) => {
    const { base44, entities } = taskPublicationFixture({ withAssignment: true });
    mutate(entities);

    await expect(backend.publishPlanning(
      base44,
      user,
      publicationBody,
      context(`publish-current-hard-gate-${expectedBlockingCode}`),
    )).rejects.toMatchObject({
      status: 409,
      details: {
        code: "PLANNING_CONTRACT_ROUTING_NOT_READY",
        acknowledgement_bypass_allowed: false,
        routing_issues: [expect.objectContaining({
          route_type: "employment",
          assignment_id: "assignment-1",
          reason: "employment_assignment_hard_gate_blocked",
          draft_assignment_blocking_codes: expect.arrayContaining([expectedBlockingCode]),
          warning_codes: expect.arrayContaining([expectedWarningCode]),
        })],
      },
    });
    expect(entities.PlanningPublication.records).toHaveLength(0);
    expect(entities.PlanningAuditEvent.records).toHaveLength(0);
    expect(await entities.PlanningAssignment.get("assignment-1")).toMatchObject({
      status: "draft",
      revision: 1,
    });
  });

  it("vereist voor een nachtdienst op iedere kalenderdag exact dezelfde arbeidsroute", async () => {
    const nightShift = shift({
      end_date: "2026-08-18",
      start_time: "22:00",
      end_time: "06:00",
      duration_minutes: 480,
    });
    const { base44 } = setup({ shifts: [nightShift], assignments: [assignment()] });
    base44.asServiceRole.functions.invoke = async (_name, payload) => ({
      service_date: payload.service_date,
      decision_status: "assignable",
      planning_assignment_allowed: true,
      draft_assignment_allowed: true,
      payroll_final_allowed: false,
      employment_routing_status: "resolved",
      contract_id: payload.service_date === "2026-08-17" ? "contract-a" : "contract-b",
      employing_company_id: "employer-company-1",
      payroll_cao_key: "cao_particuliere_beveiliging",
    });

    await expect(backend.publishPlanning(base44, user, {
      scope_type: "range",
      period_start: "2026-08-17",
      period_end: "2026-08-17",
      publication_reason: "Nachtdienst met wisselende route",
    }, context("publish-night-changing-employment-route"))).rejects.toMatchObject({
      status: 409,
      details: {
        code: "PLANNING_CONTRACT_ROUTING_NOT_READY",
        employment_issue_count: 1,
        routing_issues: [expect.objectContaining({
          assignment_id: "assignment-1",
          status: "ambiguous",
          covered_service_dates: ["2026-08-17", "2026-08-18"],
        })],
      },
    });
  });

  it("maakt een resolverstoring fail-closed zonder oude arbeidsroute te publiceren", async () => {
    const { base44, entities } = setup({
      shifts: [shift()],
      assignments: [assignment({
        personnel_contract_id: "stale-personnel-contract",
        employing_company_id: "stale-employer",
        payroll_cao_key: "stale-cao",
        employment_routing_status: "resolved",
      })],
    });
    base44.asServiceRole.functions.invoke = async () => {
      throw new Error("tijdelijke contractresolverstoring");
    };

    await expect(backend.publishPlanning(base44, user, {
      scope_type: "range",
      period_start: "2026-08-17",
      period_end: "2026-08-17",
      publication_reason: "Resolverstoring mag niet doorvallen",
    }, context("publish-employment-resolver-error"))).rejects.toMatchObject({
      status: 409,
      details: {
        code: "PLANNING_CONTRACT_ROUTING_NOT_READY",
        routing_issues: [expect.objectContaining({
          route_type: "employment",
          status: "stale",
          reason: "employment_route_resolution_failed",
          resolution_errors: [{
            service_date: "2026-08-17",
            message: "tijdelijke contractresolverstoring",
          }],
        })],
      },
    });
    expect(entities.PlanningPublication.records).toHaveLength(0);
    expect(await entities.PlanningAssignment.get("assignment-1")).toMatchObject({
      personnel_contract_id: "stale-personnel-contract",
      status: "draft",
      revision: 1,
    });
  });

  it("blokkeert een segment waarvan klant, object of taaksoort niet meer bij de occurrence hoort", async () => {
    const { base44, entities } = taskPublicationFixture();
    entities.PlanningShiftTaskSegment.records[0].customer_id = "customer-other";

    await expect(backend.publishPlanning(
      base44,
      user,
      publicationBody,
      context("publish-segment-occurrence-route-mismatch"),
    )).rejects.toMatchObject({
      status: 409,
      details: {
        code: "PLANNING_CONTRACT_ROUTING_NOT_READY",
        routing_issues: expect.arrayContaining([expect.objectContaining({
          entity: "PlanningShiftTaskSegment",
          task_segment_id: "segment-1",
          reason: "segment_occurrence_identity_mismatch",
          identity_issues: [expect.objectContaining({ field: "customer_id" })],
        })]),
      },
    });
    expect(entities.PlanningPublication.records).toHaveLength(0);
  });

  it("begrensd verse arbeidsroutecalls tot zes tegelijk en roept ze bij immutable replay niet opnieuw aan", async () => {
    const assignments = Array.from({ length: 8 }, (_, index) => assignment({
      id: `assignment-${index + 1}`,
      slot_index: index,
      personnel_id: `personnel-${index + 1}`,
      personnel_name_snapshot: `Medewerker ${index + 1}`,
    }));
    const { base44, entities } = setup({
      shifts: [shift({ required_count: 8 })],
      assignments,
    });
    for (let index = 2; index <= 8; index += 1) {
      entities.Personnel.records.push({
        id: `personnel-${index}`,
        name: `Medewerker ${index}`,
        status: "active",
      });
    }
    let active = 0;
    let maximumActive = 0;
    let invocationCount = 0;
    base44.asServiceRole.functions.invoke = async (_name, payload) => {
      invocationCount += 1;
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active -= 1;
      return {
        service_date: payload.service_date,
        decision_status: "assignable",
        planning_assignment_allowed: true,
        draft_assignment_allowed: true,
        payroll_final_allowed: false,
        employment_routing_status: "resolved",
        contract_id: `contract-${payload.personnel_id}`,
        employing_company_id: "employer-company-1",
        payroll_cao_key: "cao_particuliere_beveiliging",
      };
    };
    const mutation = context("publish-bounded-employment-routing");
    const request = {
      scope_type: "range",
      period_start: "2026-08-17",
      period_end: "2026-08-17",
      publication_reason: "Begrensde arbeidsroutering",
    };

    const first = await backend.publishPlanning(base44, user, request, mutation);
    const replay = await backend.publishPlanning(base44, user, request, mutation);

    expect(first.assignments).toHaveLength(8);
    expect(replay).toMatchObject({ idempotent: true });
    expect(maximumActive).toBe(6);
    expect(invocationCount).toBe(8);
    expect(entities.PlanningPublication.records).toHaveLength(1);
  });

  it("laadt actuele inzetfeiten voor 500 toewijzingen per begrensde batch en nooit per toewijzing", async () => {
    const assignments = Array.from({ length: 500 }, (_, index) => assignment({
      id: `assignment-bulk-${index + 1}`,
      slot_index: index,
      personnel_id: `personnel-bulk-${index + 1}`,
      personnel_name_snapshot: `Bulkmedewerker ${index + 1}`,
    }));
    const { base44, entities } = taskPublicationFixture();
    entities.PlanningShift.records[0].required_count = 500;
    entities.PlanningAssignment.records.push(...assignments);
    entities.Personnel.records.length = 0;
    entities.Personnel.records.push(...Array.from({ length: 500 }, (_, index) => ({
      id: `personnel-bulk-${index + 1}`,
      name: `Bulkmedewerker ${index + 1}`,
      status: "active",
    })));
    const irrelevantHistorySize = 5_200;
    for (let index = 0; index < irrelevantHistorySize; index += 1) {
      const suffix = `irrelevant-${index + 1}`;
      entities.PlanningShift.records.push(shift({
        id: `shift-${suffix}`,
        service_date: "2024-01-01",
        source_key: `manual:${suffix}`,
      }));
      entities.PlanningAssignment.records.push(assignment({
        id: `assignment-${suffix}`,
        shift_id: `shift-${suffix}`,
        personnel_id: `personnel-${suffix}`,
      }));
      entities.PlanningShiftTaskSegment.records.push({
        id: `segment-${suffix}`,
        shift_id: `shift-${suffix}`,
        task_occurrence_id: `occurrence-${suffix}`,
        status: "draft",
      });
      entities.PlanningTaskOccurrence.records.push(occurrence({
        id: `occurrence-${suffix}`,
        source_key: `history:${suffix}`,
        service_date: "2024-01-01",
        end_date: "2024-01-01",
      }));
      entities.PlanningTaskSourceChange.records.push({
        id: `source-change-${suffix}`,
        status: "resolved",
        service_date: "2024-01-01",
        shift_id: `shift-${suffix}`,
        shift_ids: [`shift-${suffix}`],
        task_occurrence_id: `occurrence-${suffix}`,
      });
      entities.PlanningPublication.records.push({
        id: `publication-${suffix}`,
        scope_key: `history:${suffix}`,
        version: 1,
        period_start: "2024-01-01",
        period_end: "2024-01-01",
        checksum: `checksum-${suffix}`,
        metadata: { request_hash: `request-${suffix}`, actor_user_id: "history-user" },
        snapshot: { shifts: [], task_segments: [] },
      });
      entities.PlanningAuditEvent.records.push({
        id: `audit-${suffix}`,
        action: "publish",
        publication_id: `publication-${suffix}`,
        resource_id: `publication-${suffix}`,
        actor_user_id: "history-user",
        idempotency_key: `history-${suffix}`,
        metadata: {
          publication_checksum: `checksum-${suffix}`,
          request_hash: `request-${suffix}`,
        },
      });
    }
    entities.PlanningPublication.records.push({
      id: "publication-overlapping-history",
      scope_key: "history:overlap",
      version: 1,
      period_start: "2026-08-17",
      period_end: "2026-08-17",
      checksum: "checksum-overlapping-history",
      metadata: { request_hash: "request-overlapping-history", actor_user_id: "history-user" },
      snapshot: { shifts: [], task_segments: [] },
    });
    entities.PlanningAuditEvent.records.push({
      id: "audit-overlapping-history",
      action: "publish",
      publication_id: "publication-overlapping-history",
      resource_id: "publication-overlapping-history",
      actor_user_id: "history-user",
      idempotency_key: "history-overlapping",
      metadata: {
        publication_checksum: "checksum-overlapping-history",
        request_hash: "request-overlapping-history",
      },
    });
    const observedEntities = [
      "Personnel",
      "PlanningShift",
      "PlanningAssignment",
      "PersonnelAbsence",
      "PersonnelRestriction",
      "PersonnelSecurityPass",
    ];
    const filterCounts = Object.fromEntries(observedEntities.map(name => [name, 0]));
    for (const name of observedEntities) {
      const originalFilter = entities[name].filter.bind(entities[name]);
      entities[name].filter = async (...args) => {
        filterCounts[name] += 1;
        return originalFilter(...args);
      };
    }
    let resolverCalls = 0;
    base44.asServiceRole.functions.invoke = async (_name, payload) => {
      resolverCalls += 1;
      return {
        service_date: payload.service_date,
        decision_status: "assignable",
        planning_assignment_allowed: true,
        draft_assignment_allowed: true,
        payroll_final_allowed: false,
        employment_routing_status: "resolved",
        contract_id: `contract-${payload.personnel_id}`,
        employing_company_id: "employer-company-1",
        payroll_cao_key: "cao_particuliere_beveiliging",
      };
    };

    const result = await backend.publishPlanning(base44, user, {
      scope_type: "range",
      period_start: "2026-08-17",
      period_end: "2026-08-17",
      publication_reason: "Bulk inzetcontrole zonder readfanout",
    }, context("publish-bulk-five-hundred-eligibility"));

    expect(result.assignments).toHaveLength(500);
    expect(resolverCalls).toBe(500);
    expect(filterCounts).toEqual({
      Personnel: 3,
      PlanningShift: 3,
      PlanningAssignment: 2,
      PersonnelAbsence: 3,
      PersonnelRestriction: 3,
      PersonnelSecurityPass: 3,
    });
    for (const name of [
      "PlanningShift",
      "PlanningAssignment",
      "PlanningShiftTaskSegment",
      "PlanningTaskOccurrence",
      "PlanningTaskSourceChange",
      "PlanningPublication",
      "PlanningAuditEvent",
    ]) {
      expect(entities[name].listCalls, `${name} mag geen volledige historie lezen`).toHaveLength(0);
    }
    expect(entities.PlanningShiftTaskSegment.filterCalls).toHaveLength(2);
    expect(entities.PlanningTaskOccurrence.filterCalls).toHaveLength(4);
    expect(entities.PlanningTaskSourceChange.filterCalls).toHaveLength(7);
    expect(entities.PlanningPublication.filterCalls).toHaveLength(4);
    expect(entities.PlanningAuditEvent.filterCalls).toHaveLength(3);
    expect(entities.PlanningShift.filterCalls.every(({ query }) => (
      query.service_date?.$in
      || (query.service_date?.$gte === "2026-08-17" && query.service_date?.$lte === "2026-08-17")
    ))).toBe(true);
    expect(entities.PlanningAssignment.filterCalls.every(({ query }) => query.shift_id?.$in)).toBe(true);
    expect(entities.PlanningPublication.filterCalls.every(({ query }) => (
      query.idempotency_key
      || query.scope_key
      || (query.period_start?.$lte === "2026-08-17" && query.period_end?.$gte === "2026-08-17")
    ))).toBe(true);
  }, 15_000);
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
