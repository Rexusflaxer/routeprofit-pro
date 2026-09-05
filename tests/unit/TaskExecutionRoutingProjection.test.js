import fs from "node:fs";
import path from "node:path";
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from "node:util";
import { fileURLToPath } from "node:url";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const modules = {};
const handlers = {};

async function loadBackend(name, relativePath) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  let capturedHandler = null;
  globalThis.Deno = {
    env: { get: () => undefined },
    serve: handler => { capturedHandler = handler; },
  };
  const withoutSdk = source.replace(
    /^import \{ createClientFromRequest(?: as ([A-Za-z0-9_]+))? \} from ["']npm:@base44\/sdk@[^"']+["'];$/gm,
    (_match, alias) => `const ${alias || "createClientFromRequest"} = () => globalThis.__taskExecutionRoutingBase44;`,
  );
  const { transform } = await import("esbuild");
  const compiled = await transform(withoutSdk, { format: "esm", loader: "ts", target: "es2022" });
  modules[name] = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString("base64")}`);
  handlers[name] = capturedHandler;
}

beforeAll(async () => {
  globalThis.TextEncoder = NodeTextEncoder;
  globalThis.TextDecoder = NodeTextDecoder;
  globalThis.Uint8Array = new NodeTextEncoder().encode("").constructor;
  await loadBackend("mobile", "base44/functions/mobileApi/entry.ts");
  await loadBackend("optimization", "base44/functions/createRouteExecutionsFromOptimization/entry.ts");
  await loadBackend("assignment", "base44/functions/assignPersonnelToRouteExecution/entry.ts");
  await loadBackend("optimizationStart", "base44/functions/startOptimizationJob/entry.ts");
  await loadBackend("optimizationResult", "base44/functions/getOptimizationJobResult/entry.ts");
});

beforeEach(() => {
  delete globalThis.__taskExecutionRoutingBase44;
});

function sourceTask(overrides = {}) {
  return {
    id: "task-1",
    object_id: "object-1",
    task_type: "Receptiedienst",
    task_type_key: "reception",
    weekdays: [6],
    duration_minutes: 30,
    operating_company_id: "service-company",
    service_function_type: "receptionist",
    required_security_role_status: "beveiliger",
    customer_billable: true,
    ...overrides,
  };
}

function commercialRoutingSnapshot(overrides = {}) {
  return {
    schema_version: 1,
    status: "resolved",
    task_type_key: "reception",
    selling_company_id: "selling-company",
    service_responsible_company_id: "service-company",
    supplying_company_id: "employing-company",
    customer_id: "customer-1",
    object_id: "object-1",
    service_date: "2026-09-05",
    end_date: "2026-09-05",
    customer_contract_id: "customer-contract-1",
    customer_contract_version: 1,
    customer_contract_line_id: "contract-line-1",
    customer_contract_line_version: 1,
    customer_billable: true,
    candidate_count: 1,
    ...overrides,
  };
}

function routedTask(overrides = {}) {
  return {
    original_task_id: "task-1",
    task_id: "task-1",
    task_segment_id: "segment-1",
    object_id: "object-1",
    task_type: "Receptiedienst",
    task_type_key: "reception",
    selling_company_id: "selling-company",
    service_responsible_company_id: "service-company",
    supplying_company_id: "employing-company",
    customer_id: "customer-1",
    customer_account_id: "account-1",
    customer_contract_id: "customer-contract-1",
    customer_contract_line_id: "contract-line-1",
    customer_contract_rate_id: "rate-1",
    customer_billable: true,
    commercial_routing_status: "resolved",
    commercial_routing_snapshot: commercialRoutingSnapshot({ customer_account_id: "account-1" }),
    latitude: 52.1,
    longitude: 4.3,
    duration_minutes: 30,
    ...overrides,
  };
}

function publishedOccurrence(overrides = {}) {
  return {
    id: "occurrence-1",
    revision: 3,
    published_revision: 3,
    lifecycle_status: "active",
    service_date: "2026-09-05",
    end_date: "2026-09-05",
    customer_id: "customer-1",
    object_id: "object-1",
    task_type: "reception",
    task_type_key: "reception",
    selling_company_id: "selling-company",
    service_responsible_company_id: "service-company",
    customer_contract_id: "customer-contract-1",
    customer_contract_line_id: "contract-line-1",
    commercial_routing_status: "resolved",
    commercial_routing_snapshot: commercialRoutingSnapshot(),
    ...overrides,
  };
}

function publishedSegment(overrides = {}) {
  return {
    id: "segment-1",
    shift_id: "shift-1",
    task_occurrence_id: "occurrence-1",
    revision: 4,
    published_revision: 4,
    status: "published",
    start_date: "2026-09-05",
    end_date: "2026-09-05",
    customer_id: "customer-1",
    object_id: "object-1",
    task_type: "reception",
    task_type_key: "reception",
    selling_company_id: "selling-company",
    service_responsible_company_id: "service-company",
    customer_contract_id: "customer-contract-1",
    customer_contract_line_id: "contract-line-1",
    commercial_routing_status: "resolved",
    commercial_routing_snapshot: commercialRoutingSnapshot(),
    ...overrides,
  };
}

function publishedShift(overrides = {}) {
  return {
    id: "shift-1",
    revision: 5,
    published_revision: 5,
    status: "published",
    service_date: "2026-09-05",
    customer_id: "customer-1",
    selling_company_id: "selling-company",
    service_responsible_company_id: "service-company",
    customer_billable: true,
    service_context_snapshot: { customer_billable: true },
    ...overrides,
  };
}

function customerContract(overrides = {}) {
  return {
    id: "customer-contract-1",
    version: 1,
    status: "active",
    company_id: "selling-company",
    customer_id: "customer-1",
    customer_account_id: "account-1",
    start_date: "2026-01-01",
    end_date: "2026-12-31",
    ...overrides,
  };
}

function customerContractLine(overrides = {}) {
  return {
    id: "contract-line-1",
    version: 1,
    status: "active",
    contract_id: "customer-contract-1",
    company_id: "selling-company",
    customer_id: "customer-1",
    customer_account_id: "account-1",
    task_type_key: "reception",
    service_code: null,
    scope_type: "object",
    object_id: "object-1",
    collective_id: null,
    valid_from: "2026-01-01",
    valid_until: "2026-12-31",
    ...overrides,
  };
}

function publishedEvidence(overrides = {}) {
  return {
    linked: true,
    verified: true,
    segment: publishedSegment(),
    occurrence: publishedOccurrence(),
    shift: publishedShift(),
    contract: customerContract(),
    line: customerContractLine(),
    ...overrides,
  };
}

function employmentResolution(overrides = {}) {
  return {
    status: "resolved",
    planning_allowed: true,
    personnel_id: "personnel-1",
    contract_id: "personnel-contract-1",
    employing_company_id: "employing-company",
    company_id: "employing-company",
    supplying_company_id: "employing-company",
    payroll_cao_key: "cao_particuliere_beveiliging",
    cao_key: "cao_particuliere_beveiliging",
    blocking_reasons: [],
    selected_contract: {
      id: "personnel-contract-1",
      company_id: "employing-company",
      cao_key: "cao_particuliere_beveiliging",
      function_type: "receptionist",
    },
    ...overrides,
  };
}

describe.each(["mobile", "optimization"])("%s TaskExecution-routeringsprojectie", name => {
  it("bevriest commerciële, service- en arbeidsrollen zonder ze gelijk te trekken", () => {
    const projection = modules[name].buildTaskExecutionRoutingProjection(
      routedTask(),
      sourceTask(),
      { id: "object-1", customer_id: "customer-1" },
      employmentResolution(),
      publishedEvidence(),
    );

    expect(projection).toMatchObject({
      task_type_key: "reception",
      selling_company_id: "selling-company",
      service_responsible_company_id: "service-company",
      supplying_company_id: "employing-company",
      employing_company_id: "employing-company",
      payroll_cao_key: "cao_particuliere_beveiliging",
      customer_id: "customer-1",
      customer_account_id: "account-1",
      customer_contract_id: "customer-contract-1",
      customer_contract_line_id: "contract-line-1",
      customer_contract_rate_id: "rate-1",
      customer_billable: true,
      commercial_routing_status: "resolved",
    });
  });

  it("canonicaliseert Portier / concierge exact naar concierge", () => {
    expect(modules[name].projectedTaskTypeKey(
      { task_type: "Portier / concierge", customer_billable: true },
    )).toBe("concierge");
  });

  it("faalt gesloten bij ontbrekende facturatie-indicatie of route-tegenspraak", () => {
    expect(() => modules[name].buildTaskExecutionRoutingProjection(
      { task_type: "Receptiedienst", customer_id: "customer-1" },
      {},
      { customer_id: "customer-1" },
    )).toThrowError(expect.objectContaining({ code: "TASK_EXECUTION_CUSTOMER_BILLABLE_MISSING" }));

    expect(() => modules[name].buildTaskExecutionRoutingProjection(
      routedTask({ task_type_key: "fire_watch" }),
      sourceTask(),
      { customer_id: "customer-1" },
    )).toThrowError(expect.objectContaining({ code: "TASK_EXECUTION_TASK_TYPE_MISMATCH" }));

    expect(() => modules[name].buildTaskExecutionRoutingProjection(
      routedTask({
        customer_billable: false,
        commercial_routing_status: "not_applicable",
        commercial_routing_snapshot: { status: "not_applicable", customer_billable: false },
      }),
      sourceTask({ customer_billable: false }),
      { customer_id: "customer-1" },
    )).toThrowError(expect.objectContaining({ code: "TASK_EXECUTION_COMMERCIAL_ROUTE_MISMATCH" }));
  });

  it("markeert een legacy writerbron zonder gepubliceerde segmentkoppeling expliciet stale", () => {
    const task = routedTask({ task_segment_id: null });
    const projection = modules[name].buildTaskExecutionRoutingProjection(
      task,
      sourceTask(),
      { customer_id: "customer-1" },
    );
    expect(projection.commercial_routing_status).toBe("stale");
    expect(projection.commercial_routing_snapshot).toMatchObject({
      schema_version: 1,
      status: "stale",
      reason: "published_commercial_route_evidence_missing",
    });
  });

  it("weigert een segment dat na publicatie is gewijzigd", async () => {
    const base44 = {
      asServiceRole: {
        entities: {
          PlanningShiftTaskSegment: { get: vi.fn(async () => publishedSegment({ revision: 5, published_revision: 4 })) },
        },
      },
    };
    await expect(modules[name].loadPublishedTaskRoutingEvidence(
      base44,
      routedTask(),
      sourceTask(),
      "2026-09-05",
    )).rejects.toMatchObject({ code: "TASK_EXECUTION_PLANNING_EVIDENCE_STALE", status: 409 });
  });

  it("projecteert not_applicable alleen met exact intern en niet-factureerbaar publicatiebewijs", async () => {
    const internalSnapshot = commercialRoutingSnapshot({
      status: "not_applicable",
      reason: "explicit_internal_non_billable",
      customer_id: null,
      selling_company_id: null,
      customer_contract_id: null,
      customer_contract_line_id: null,
      customer_billable: false,
      candidate_count: 0,
      evidence_shift_ids: ["shift-1"],
      evidence_segment_ids: ["segment-1"],
    });
    const base44 = {
      asServiceRole: {
        entities: {
          PlanningShiftTaskSegment: { get: vi.fn(async () => publishedSegment({
            customer_id: null,
            selling_company_id: null,
            customer_contract_id: null,
            customer_contract_line_id: null,
            commercial_routing_status: "not_applicable",
            commercial_routing_snapshot: internalSnapshot,
          })) },
          PlanningTaskOccurrence: { get: vi.fn(async () => publishedOccurrence({
            customer_id: null,
            selling_company_id: null,
            customer_contract_id: null,
            customer_contract_line_id: null,
            commercial_routing_status: "not_applicable",
            commercial_routing_snapshot: internalSnapshot,
          })) },
          PlanningShift: { get: vi.fn(async () => publishedShift({
            customer_id: null,
            selling_company_id: null,
            customer_billable: false,
            service_context_snapshot: { customer_billable: false },
          })) },
        },
      },
    };
    const task = routedTask({
      customer_id: null,
      customer_account_id: null,
      selling_company_id: null,
      customer_contract_id: null,
      customer_contract_line_id: null,
      customer_contract_rate_id: null,
      customer_billable: false,
      commercial_routing_status: "not_applicable",
      commercial_routing_snapshot: internalSnapshot,
    });
    const source = sourceTask({ customer_id: null, customer_billable: false });
    const evidence = await modules[name].loadPublishedTaskRoutingEvidence(base44, task, source, "2026-09-05");
    const projection = modules[name].buildTaskExecutionRoutingProjection(task, source, {}, null, evidence);
    expect(projection).toMatchObject({
      commercial_routing_status: "not_applicable",
      customer_billable: false,
      customer_id: null,
      customer_account_id: null,
      selling_company_id: null,
      customer_contract_id: null,
      customer_contract_line_id: null,
    });
  });

  it("neemt resolved billability uit exact gepubliceerd segmentbewijs als de legacy dienst null is", async () => {
    const base44 = {
      asServiceRole: {
        entities: {
          PlanningShiftTaskSegment: { get: vi.fn(async () => publishedSegment()) },
          PlanningTaskOccurrence: { get: vi.fn(async () => publishedOccurrence()) },
          PlanningShift: { get: vi.fn(async () => publishedShift({
            customer_billable: null,
            service_context_snapshot: { customer_billable: null },
          })) },
          CustomerContract: { get: vi.fn(async () => customerContract()) },
          CustomerContractLine: { get: vi.fn(async () => customerContractLine()) },
        },
      },
    };
    const task = routedTask({ customer_billable: null });
    const source = sourceTask({ customer_billable: null });

    const evidence = await modules[name].loadPublishedTaskRoutingEvidence(
      base44,
      task,
      source,
      "2026-09-05",
    );
    const projection = modules[name].buildTaskExecutionRoutingProjection(
      task,
      source,
      { id: "object-1", customer_id: "customer-1" },
      null,
      evidence,
    );

    expect(evidence.segment.commercial_routing_snapshot.customer_billable).toBe(true);
    expect(projection).toMatchObject({
      commercial_routing_status: "resolved",
      customer_billable: true,
      customer_contract_id: "customer-contract-1",
      customer_contract_line_id: "contract-line-1",
    });
  });
});

it("schrijft de volledige routeprojectie in het echte optimalisatie-bulkCreate-pad", async () => {
  const bulkCreate = vi.fn(async payloads => payloads);
  globalThis.__taskExecutionRoutingBase44 = {
    auth: { me: vi.fn(async () => ({ id: "admin-1", role: "admin" })) },
    asServiceRole: {
      functions: { invoke: vi.fn(async () => ({ data: employmentResolution() })) },
      entities: {
        SurveillanceObject: { list: vi.fn(async () => [{ id: "object-1", name: "Object 1", customer_id: "customer-1", latitude: 52.1, longitude: 4.3 }]) },
        RouteExecution: { list: vi.fn(async () => []), create: vi.fn(async payload => ({ id: "route-execution-1", ...payload })) },
        Route: { list: vi.fn(async () => [{ id: "route-1", operating_company_id: "service-company" }]) },
        Task: { list: vi.fn(async () => [sourceTask()]) },
        PlanningShiftTaskSegment: { get: vi.fn(async () => publishedSegment()) },
        PlanningTaskOccurrence: { get: vi.fn(async () => publishedOccurrence()) },
        PlanningShift: { get: vi.fn(async () => publishedShift()) },
        CustomerContract: { get: vi.fn(async () => customerContract()) },
        CustomerContractLine: { get: vi.fn(async () => customerContractLine()) },
        TaskExecution: { filter: vi.fn(async () => []), delete: vi.fn(), bulkCreate },
      },
    },
  };
  const request = new Request("https://example.test/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      service_date: "2026-09-05",
      plannedResult: {
        routes: [{
          id: "route-1",
          route_id: "route-1",
          employee_id: "personnel-1",
          operating_company_id: "service-company",
          tasks: [routedTask()],
        }],
      },
    }),
  });

  const response = await handlers.optimization(request);
  expect(response.status).toBe(200);
  expect((await response.json()).blocked).toEqual([]);
  expect(bulkCreate).toHaveBeenCalledTimes(1);
  expect(bulkCreate.mock.calls[0][0][0]).toMatchObject({
    task_type_key: "reception",
    selling_company_id: "selling-company",
    service_responsible_company_id: "service-company",
    supplying_company_id: "employing-company",
    employing_company_id: "employing-company",
    payroll_cao_key: "cao_particuliere_beveiliging",
    customer_contract_id: "customer-contract-1",
    customer_contract_line_id: "contract-line-1",
    commercial_routing_status: "resolved",
    customer_billable: true,
  });
});

it("schrijft de commerciële route in het echte mobiele bulkCreate-pad", async () => {
  const bulkCreate = vi.fn(async payloads => payloads);
  globalThis.__taskExecutionRoutingBase44 = {
    auth: { me: vi.fn(async () => ({ id: "admin-1", role: "admin" })) },
    asServiceRole: {
      entities: {
        Route: { filter: vi.fn(async () => [{
          id: "route-1",
          name: "Route 1",
          weekdays: [6],
          operating_company_id: "service-company",
          assigned_tasks: [{
            task_id: "task-1",
            days: [6],
            ...routedTask(),
          }],
        }]) },
        RouteExecution: { filter: vi.fn(async () => []), create: vi.fn(async payload => ({ id: "route-execution-1", ...payload })) },
        Task: { list: vi.fn(async () => [sourceTask()]) },
        SurveillanceObject: { list: vi.fn(async () => [{ id: "object-1", name: "Object 1", customer_id: "customer-1", latitude: 52.1, longitude: 4.3 }]) },
        Vehicle: { list: vi.fn(async () => []) },
        Office: { list: vi.fn(async () => []) },
        PlanningShiftTaskSegment: { get: vi.fn(async () => publishedSegment()) },
        PlanningTaskOccurrence: { get: vi.fn(async () => publishedOccurrence()) },
        PlanningShift: { get: vi.fn(async () => publishedShift()) },
        CustomerContract: { get: vi.fn(async () => customerContract()) },
        CustomerContractLine: { get: vi.fn(async () => customerContractLine()) },
        TaskExecution: { bulkCreate },
      },
    },
  };
  const response = await handlers.mobile(new Request("https://example.test/mobile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "create_route_execution", route_id: "route-1", service_date: "2026-09-05" }),
  }));

  expect(response.status).toBe(200);
  expect(bulkCreate).toHaveBeenCalledTimes(1);
  expect(bulkCreate.mock.calls[0][0][0]).toMatchObject({
    task_type_key: "reception",
    selling_company_id: "selling-company",
    service_responsible_company_id: "service-company",
    supplying_company_id: null,
    customer_id: "customer-1",
    customer_contract_id: "customer-contract-1",
    customer_contract_line_id: "contract-line-1",
    commercial_routing_status: "resolved",
    customer_billable: true,
    employing_company_id: null,
    payroll_cao_key: null,
  });
});

it("slaat een bron-taak buiten haar weekdag over voordat mobiel oud publicatiebewijs valideert", async () => {
  const bulkCreate = vi.fn(async payloads => payloads);
  const segmentGet = vi.fn(async id => {
    if (id === "stale-segment-off-day") throw new Error("off-day bewijs hoort niet gelezen te worden");
    return publishedSegment();
  });
  globalThis.__taskExecutionRoutingBase44 = {
    auth: { me: vi.fn(async () => ({ id: "admin-1", role: "admin" })) },
    asServiceRole: {
      entities: {
        Route: { filter: vi.fn(async () => [{
          id: "route-1",
          name: "Route 1",
          weekdays: [6],
          operating_company_id: "service-company",
          assigned_tasks: [
            { task_id: "task-1", days: [6], ...routedTask() },
            {
              task_id: "task-off-day",
              days: [6],
              planning_shift_task_segment_id: "stale-segment-off-day",
              planning_task_occurrence_id: "stale-occurrence-off-day",
              planning_shift_id: "stale-shift-off-day",
            },
          ],
        }]) },
        RouteExecution: { filter: vi.fn(async () => []), create: vi.fn(async payload => ({ id: "route-execution-1", ...payload })) },
        Task: { list: vi.fn(async () => [
          sourceTask(),
          sourceTask({ id: "task-off-day", weekdays: [1] }),
        ]) },
        SurveillanceObject: { list: vi.fn(async () => [{ id: "object-1", name: "Object 1", customer_id: "customer-1", latitude: 52.1, longitude: 4.3 }]) },
        Vehicle: { list: vi.fn(async () => []) },
        Office: { list: vi.fn(async () => []) },
        PlanningShiftTaskSegment: { get: segmentGet },
        PlanningTaskOccurrence: { get: vi.fn(async () => publishedOccurrence()) },
        PlanningShift: { get: vi.fn(async () => publishedShift()) },
        CustomerContract: { get: vi.fn(async () => customerContract()) },
        CustomerContractLine: { get: vi.fn(async () => customerContractLine()) },
        TaskExecution: { bulkCreate },
      },
    },
  };

  const response = await handlers.mobile(new Request("https://example.test/mobile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "create_route_execution", route_id: "route-1", service_date: "2026-09-05" }),
  }));

  expect(response.status).toBe(200);
  expect(segmentGet).toHaveBeenCalledTimes(1);
  expect(segmentGet).toHaveBeenCalledWith("segment-1");
  expect(bulkCreate).toHaveBeenCalledTimes(1);
  expect(bulkCreate.mock.calls[0][0]).toHaveLength(1);
  expect(bulkCreate.mock.calls[0][0][0]).toMatchObject({ original_task_id: "task-1" });
});

it("projecteert werkgever en loon-CAO ook bij latere route-toewijzing", () => {
  expect(modules.assignment.resolvedEmploymentProjection(employmentResolution())).toEqual({
    personnel_contract_id: "personnel-contract-1",
    employing_company_id: "employing-company",
    payroll_cao_key: "cao_particuliere_beveiliging",
    supplying_company_id: "employing-company",
  });
  expect(() => modules.assignment.resolvedEmploymentProjection(employmentResolution({
    company_id: "other-company",
  }))).toThrowError(expect.objectContaining({ code: "TASK_EXECUTION_EMPLOYMENT_ROUTE_MISMATCH" }));
});

it("behoudt publicatiebewijs door de normale optimizer request/result-keten en het Route-schema", () => {
  const assigned = {
    task_id: "task-1",
    repeat_index: 2,
    planning_shift_task_segment_id: "segment-1",
    planning_task_occurrence_id: "occurrence-1",
    planning_shift_id: "shift-1",
  };
  expect(modules.optimizationStart.relevantAssignedTasksForRoute({ assigned_tasks: [assigned] })[0]).toMatchObject(assigned);

  const normalized = modules.optimizationResult.normalizeCompletedResult({
    routes: [{
      manual_route_id: "route-1",
      shift_start: 3600,
      end_time_seconds: 7200,
      steps: [{ type: "task", task_id: "task-1__2", original_task_id: "task-1", repeat_index: 2, arrival_seconds: 4000, service_seconds: 600 }],
    }],
    summary: { tasks_assigned: 1, tasks_unassigned: 0 },
  }, {
    display_weekday: 6,
    tasks: [sourceTask()],
    objects: [{ id: "object-1", name: "Object 1", address: "Teststraat 1" }],
    routes: [{ id: "route-1", assigned_tasks: [assigned] }],
  });
  expect(normalized.routes[0].tasks[0]).toMatchObject({
    planning_shift_task_segment_id: "segment-1",
    planning_task_occurrence_id: "occurrence-1",
    planning_shift_id: "shift-1",
  });

  const routeSchema = JSON.parse(fs.readFileSync(path.join(root, "base44/entities/Route.jsonc"), "utf8"));
  expect(routeSchema.properties.assigned_tasks.items.properties).toEqual(expect.objectContaining({
    planning_shift_task_segment_id: expect.any(Object),
    planning_task_occurrence_id: expect.any(Object),
    planning_shift_id: expect.any(Object),
  }));
});

it("weigert tegenstrijdig publicatiebewijs uit optimizerbronnen", () => {
  expect(() => modules.optimizationResult.planningEvidenceFromSources(
    { planning_shift_id: "shift-1" },
    { planning_shift_id: "shift-2" },
  )).toThrow("Tegenstrijdige planning_shift_id");
});

it("schrijft per taak een ander arbeidscontract op een gemengde geoptimaliseerde route", async () => {
  const bulkCreate = vi.fn(async payloads => payloads);
  const routeCreate = vi.fn(async payload => ({ id: "route-execution-1", ...payload }));
  const source2 = sourceTask({ id: "task-2", object_id: "object-2", task_type: "Brandwacht", task_type_key: "fire_watch", service_function_type: "fire_watch" });
  const task2 = routedTask({
    original_task_id: "task-2", task_id: "task-2", task_segment_id: "segment-2", object_id: "object-2",
    task_type: "Brandwacht", task_type_key: "fire_watch", customer_id: "customer-2", customer_account_id: "account-2",
    customer_contract_id: "customer-contract-2", customer_contract_line_id: "contract-line-2",
    commercial_routing_snapshot: commercialRoutingSnapshot({ task_type_key: "fire_watch", customer_id: "customer-2", object_id: "object-2", customer_account_id: "account-2", customer_contract_id: "customer-contract-2", customer_contract_line_id: "contract-line-2" }),
  });
  const resolutionFor = key => employmentResolution({
    contract_id: `personnel-contract-${key}`,
    employing_company_id: `employer-${key}`,
    company_id: `employer-${key}`,
    supplying_company_id: `employer-${key}`,
    payroll_cao_key: `cao-${key}`,
    cao_key: `cao-${key}`,
    selected_contract: { id: `personnel-contract-${key}`, company_id: `employer-${key}`, cao_key: `cao-${key}`, function_type: key === "fire" ? "fire_watch" : "receptionist" },
  });
  globalThis.__taskExecutionRoutingBase44 = {
    auth: { me: vi.fn(async () => ({ id: "admin-1", role: "admin" })) },
    asServiceRole: {
      functions: { invoke: vi.fn(async (_name, payload) => ({ data: resolutionFor(payload.service_context.task_type_key === "fire_watch" ? "fire" : "reception") })) },
      entities: {
        SurveillanceObject: { list: vi.fn(async () => [{ id: "object-1", customer_id: "customer-1", latitude: 52.1, longitude: 4.3 }, { id: "object-2", customer_id: "customer-2", latitude: 52.2, longitude: 4.4 }]) },
        RouteExecution: { list: vi.fn(async () => []), create: routeCreate },
        Route: { list: vi.fn(async () => [{ id: "route-1", operating_company_id: "service-company" }]) },
        Task: { list: vi.fn(async () => [sourceTask(), source2]) },
        PlanningShiftTaskSegment: { get: vi.fn(async id => id === "segment-2" ? publishedSegment({ id, shift_id: "shift-2", task_occurrence_id: "occurrence-2", object_id: "object-2", task_type: "fire_watch", task_type_key: "fire_watch", customer_id: "customer-2", customer_contract_id: "customer-contract-2", customer_contract_line_id: "contract-line-2", commercial_routing_snapshot: task2.commercial_routing_snapshot }) : publishedSegment()) },
        PlanningTaskOccurrence: { get: vi.fn(async id => id === "occurrence-2" ? publishedOccurrence({ id, object_id: "object-2", task_type: "fire_watch", task_type_key: "fire_watch", customer_id: "customer-2", customer_contract_id: "customer-contract-2", customer_contract_line_id: "contract-line-2", commercial_routing_snapshot: task2.commercial_routing_snapshot }) : publishedOccurrence()) },
        PlanningShift: { get: vi.fn(async id => id === "shift-2" ? publishedShift({ id, customer_id: "customer-2" }) : publishedShift()) },
        CustomerContract: { get: vi.fn(async id => id === "customer-contract-2" ? customerContract({ id, customer_id: "customer-2", customer_account_id: "account-2" }) : customerContract()) },
        CustomerContractLine: { get: vi.fn(async id => id === "contract-line-2" ? customerContractLine({ id, contract_id: "customer-contract-2", customer_id: "customer-2", customer_account_id: "account-2", task_type_key: "fire_watch", object_id: "object-2" }) : customerContractLine()) },
        TaskExecution: { filter: vi.fn(async () => []), delete: vi.fn(), bulkCreate },
      },
    },
  };
  const response = await handlers.optimization(new Request("https://example.test/create", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ service_date: "2026-09-05", plannedResult: { routes: [{ id: "route-1", employee_id: "personnel-1", operating_company_id: "service-company", tasks: [routedTask(), task2] }] } }) }));
  expect(response.status).toBe(200);
  expect((await response.json()).blocked).toEqual([]);
  expect(bulkCreate.mock.calls[0][0].map(task => task.personnel_contract_id)).toEqual(["personnel-contract-reception", "personnel-contract-fire"]);
  expect(routeCreate.mock.calls[0][0]).toMatchObject({ personnel_contract_id: null, contract_routing_snapshot: { contract_ids: ["personnel-contract-reception", "personnel-contract-fire"] } });
});

it("schrijft bij latere toewijzing eveneens het arbeidscontract per taak", async () => {
  const taskUpdate = vi.fn(async (_id, patch) => patch);
  const routeUpdate = vi.fn(async (_id, patch) => patch);
  const resolutionFor = key => employmentResolution({
    contract_id: `contract-${key}`, employing_company_id: `employer-${key}`, company_id: `employer-${key}`,
    payroll_cao_key: `cao-${key}`, cao_key: `cao-${key}`,
    selected_contract: { id: `contract-${key}`, company_id: `employer-${key}`, cao_key: `cao-${key}`, function_type: key },
  });
  globalThis.__taskExecutionRoutingBase44 = {
    auth: { me: vi.fn(async () => ({ id: "admin-1", role: "admin" })) },
    asServiceRole: {
      functions: { invoke: vi.fn(async (_name, payload) => ({ data: resolutionFor(payload.service_context.task_type_key) })) },
      entities: {
        RouteExecution: { get: vi.fn(async () => ({ id: "route-execution-1", source_route_id: "route-1", service_date: "2026-09-05", operating_company_id: "service-company", status: "planned" })), update: routeUpdate },
        TaskExecution: { filter: vi.fn(async () => [{ id: "te-1", original_task_id: "task-1", object_id: "object-1", task_type: "Receptiedienst", task_type_key: "reception", operating_company_id: "service-company" }, { id: "te-2", original_task_id: "task-2", object_id: "object-2", task_type: "Brandwacht", task_type_key: "fire_watch", operating_company_id: "service-company" }]), update: taskUpdate },
        Personnel: { get: vi.fn(async () => ({ id: "personnel-1", name: "Medewerker" })) },
        Route: { list: vi.fn(async () => [{ id: "route-1", operating_company_id: "service-company" }]) },
        Task: { list: vi.fn(async () => [sourceTask(), sourceTask({ id: "task-2", object_id: "object-2", task_type: "Brandwacht", task_type_key: "fire_watch", service_function_type: "fire_watch" })]) },
        SurveillanceObject: { list: vi.fn(async () => [{ id: "object-1" }, { id: "object-2" }]) },
      },
    },
  };
  const response = await handlers.assignment(new Request("https://example.test/assign", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ route_execution_id: "route-execution-1", personnel_id: "personnel-1" }) }));
  expect(response.status).toBe(200);
  expect(taskUpdate.mock.calls.map(call => call[1].personnel_contract_id)).toEqual(["contract-reception", "contract-fire_watch"]);
  expect(routeUpdate.mock.calls[0][1]).toMatchObject({ personnel_contract_id: null, contract_routing_snapshot: { contract_ids: ["contract-reception", "contract-fire_watch"] } });
});

it("schrijft werkgever, leverende BV, loon-CAO en taaksoort in het echte toewijzingspad", async () => {
  const taskUpdate = vi.fn(async (_id, patch) => ({ id: "task-execution-1", ...patch }));
  const routeUpdate = vi.fn(async (_id, patch) => ({ id: "route-execution-1", ...patch }));
  globalThis.__taskExecutionRoutingBase44 = {
    auth: { me: vi.fn(async () => ({ id: "admin-1", email: "admin@example.test", role: "admin" })) },
    asServiceRole: {
      functions: { invoke: vi.fn(async () => ({ data: employmentResolution() })) },
      entities: {
        RouteExecution: {
          get: vi.fn(async () => ({
            id: "route-execution-1",
            source_route_id: "route-1",
            route_id: "route-1",
            service_date: "2026-09-05",
            operating_company_id: "service-company",
            status: "planned",
          })),
          update: routeUpdate,
        },
        TaskExecution: {
          filter: vi.fn(async () => [{
            id: "task-execution-1",
            route_execution_id: "route-execution-1",
            original_task_id: "task-1",
            object_id: "object-1",
            task_type: "Receptiedienst",
            task_type_key: "reception",
            operating_company_id: "service-company",
            selling_company_id: "selling-company",
            service_responsible_company_id: "service-company",
            contract_routing_snapshot: { service_context: { task_type_key: "reception" } },
          }]),
          update: taskUpdate,
        },
        Personnel: { get: vi.fn(async () => ({ id: "personnel-1", name: "Medewerker" })) },
        Route: { list: vi.fn(async () => [{ id: "route-1", operating_company_id: "service-company" }]) },
        Task: { list: vi.fn(async () => [sourceTask()]) },
        SurveillanceObject: { list: vi.fn(async () => [{ id: "object-1", customer_id: "customer-1" }]) },
      },
    },
  };

  const response = await handlers.assignment(new Request("https://example.test/assign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ route_execution_id: "route-execution-1", personnel_id: "personnel-1" }),
  }));

  expect(response.status).toBe(200);
  expect(taskUpdate).toHaveBeenCalledWith("task-execution-1", expect.objectContaining({
    task_type_key: "reception",
    personnel_contract_id: "personnel-contract-1",
    employing_company_id: "employing-company",
    supplying_company_id: "employing-company",
    payroll_cao_key: "cao_particuliere_beveiliging",
    contract_routing_status: "resolved",
  }));
});
