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
  const matches = (record, query = {}) => Object.entries(query).every(([key, value]) => record[key] === value);
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
  };
  return {
    base44: { asServiceRole: { entities, functions: { invoke: async () => ({}) } } },
    entities,
  };
}

const user = { id: "admin-1", role: "admin", name: "Planner" };
const context = key => ({ idempotencyKey: key, correlationId: key });

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
    for (const file of ["PlanningTaskOccurrence.jsonc", "PlanningShiftTaskSegment.jsonc"]) {
      const schema = JSON.parse(fs.readFileSync(path.join(root, "base44/entities", file), "utf8"));
      expect(schema.rls).toEqual({
        create: false,
        read: { user_condition: { role: "admin" } },
        update: false,
        delete: false,
      });
    }
  });
});

describe("planningApi dienstsamenstelling", () => {
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
});
