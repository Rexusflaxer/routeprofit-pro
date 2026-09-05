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

function entity(initial = []) {
  const records = initial.map(item => structuredClone(item));
  const matches = (record, query = {}) => Object.entries(query).every(([key, value]) => (
    value && typeof value === "object" && Object.hasOwn(value, "$in")
      ? value.$in.includes(record[key])
      : record[key] === value
  ));
  return {
    records,
    async filter(query) {
      return records.filter(record => matches(record, query)).map(record => structuredClone(record));
    },
  };
}

function setup({ personnel = null, invoke = null } = {}) {
  const targetShift = {
    id: "shift-target",
    revision: 3,
    status: "draft",
    service_date: "2026-08-24",
    start_time: "10:00",
    end_time: "18:00",
    company_id: "company-1",
    object_id: "object-1",
    cao_key: "cao_particuliere_beveiliging",
    required_count: 1,
  };
  const entities = {
    Personnel: entity(personnel || [{ id: "person-1", revision: 2, name: "Alex", status: "active" }]),
    PlanningShift: entity([
      targetShift,
      {
        id: "shift-overlap",
        revision: 1,
        status: "draft",
        service_date: "2026-08-24",
        start_time: "12:00",
        end_time: "14:00",
      },
    ]),
    PlanningTaskOccurrence: entity([]),
    SurveillanceObject: entity([]),
    PlanningAssignment: entity([{
      id: "assignment-overlap",
      revision: 1,
      personnel_id: "person-1",
      shift_id: "shift-overlap",
      status: "assigned",
    }]),
    PersonnelAbsence: entity([{
      id: "absence-1",
      revision: 1,
      personnel_id: "person-1",
      start_date: "2026-08-24",
      end_date: "2026-08-24",
      absence_type: "leave",
      status: "approved",
    }]),
    PersonnelRestriction: entity([{
      id: "restriction-1",
      revision: 1,
      personnel_id: "person-1",
      scope_type: "object",
      scope_id: "object-1",
      may_work: false,
      status: "active",
      valid_from: "2026-01-01",
      valid_until: "2026-12-31",
      reason: "Geen toegang",
    }]),
    PersonnelSecurityPass: entity([]),
  };
  let invocationCount = 0;
  const base44 = {
    asServiceRole: {
      entities,
      functions: {
        invoke: invoke || (async () => {
          invocationCount += 1;
          return {
            data: {
              decision_status: "blocked",
              contract_id: "contract-1",
              cao_key: "cao_particuliere_beveiliging",
              blocking_reasons: ["Contract staat deze inzet niet toe."],
              source_rule_ids: ["CAO-PB-test"],
            },
          };
        }),
      },
    },
  };
  return { base44, entities, targetShift, invocationCount: () => invocationCount };
}

function candidate(overrides = {}) {
  return {
    candidate_key: "candidate-1",
    personnel_id: "person-1",
    source_kind: "shift",
    source_id: "shift-target",
    expected_source_revision: 3,
    ...overrides,
  };
}

describe("planningApi bounded eligibility-prefetch", () => {
  it.each([
    ["missing_contract", "contract_missing"],
    ["ambiguous", "contract_ambiguous"],
  ])("projecteert een pure %s arbeidsroute als expliciet toegestane conceptdrop", async (routingStatus, routingCode) => {
    const { base44, entities } = setup({
      invoke: async (_name, payload) => ({
        data: {
          service_date: payload.service_date,
          decision_status: "blocked",
          planning_assignment_allowed: false,
          draft_assignment_allowed: true,
          employment_routing_status: routingStatus,
          contract_id: null,
          employing_company_id: null,
          payroll_cao_key: null,
          blocking_reasons: ["Arbeidscontractroutering vereist aandacht."],
        },
      }),
    });
    entities.PlanningShift.records.splice(1);
    entities.PlanningAssignment.records.length = 0;
    entities.PersonnelAbsence.records.length = 0;
    entities.PersonnelRestriction.records.length = 0;

    const result = await backend.prefetchAssignmentEligibility(base44, {
      basis_token: `planning-${routingStatus}`,
      candidates: [candidate()],
    });

    expect(result.results[0]).toMatchObject({
      status: "ready",
      routing_draft_assignment_allowed: true,
      draft_assignment_allowed: true,
      employment_routing_status: routingStatus,
      employment_routing_codes: [routingCode],
      warning_codes: [routingCode],
    });
  });

  it("laat clientwaarschuwingen nooit een lokale harde blokkade autoriseren", async () => {
    const { base44 } = setup({
      invoke: async (_name, payload) => ({
        data: {
          service_date: payload.service_date,
          decision_status: "assignable",
          planning_assignment_allowed: true,
          draft_assignment_allowed: true,
          employment_routing_status: "resolved",
          contract_id: "contract-1",
          employing_company_id: "employer-1",
          payroll_cao_key: "cao_particuliere_beveiliging",
        },
      }),
    });

    const result = await backend.prefetchAssignmentEligibility(base44, {
      basis_token: "planning-hard-blocks",
      candidates: [candidate({
        warning_snapshot: [{
          code: "client_says_ok",
          severity: "info",
          message: "Clientmelding mag serverfeiten niet overrulen.",
        }],
      })],
    });

    expect(result.results[0]).toMatchObject({
      routing_draft_assignment_allowed: true,
      draft_assignment_allowed: false,
      draft_assignment_blocking_codes: expect.arrayContaining([
        "shift_overlap",
        "personnel_absence",
        "personnel_restriction",
      ]),
    });
  });

  it("staat een meerdaagse pure route-ambiguiteit als concept toe maar wist de route-ID's", async () => {
    const { base44, entities } = setup({
      invoke: async (_name, payload) => ({
        data: {
          service_date: payload.service_date,
          decision_status: "assignable",
          planning_assignment_allowed: true,
          draft_assignment_allowed: true,
          employment_routing_status: "resolved",
          contract_id: payload.service_date === "2026-08-24" ? "contract-a" : "contract-b",
          employing_company_id: "employer-1",
          payroll_cao_key: "cao_particuliere_beveiliging",
        },
      }),
    });
    entities.PlanningShift.records.splice(1);
    entities.PlanningAssignment.records.length = 0;
    entities.PersonnelAbsence.records.length = 0;
    entities.PersonnelRestriction.records.length = 0;

    const result = await backend.prefetchAssignmentEligibility(base44, {
      basis_token: "planning-multiday-routing-ambiguity",
      candidates: [candidate({
        start_time: "22:00",
        end_date: "2026-08-25",
        end_time: "02:00",
      })],
    });

    expect(result.results[0]).toMatchObject({
      routing_draft_assignment_allowed: true,
      draft_assignment_allowed: true,
      employment_routing_status: "ambiguous",
      employment_routing_codes: ["contract_ambiguous"],
    });
  });

  it.each([
    ["alleen werkgever B", ["company-b"], true],
    ["alleen taakbedrijf A", ["company-1"], false],
    ["taakbedrijf A en werkgever B", ["company-1", "company-b"], true],
  ])("controleert een beveiligingspas tegen de resolved werkgever bij %s", async (_label, companyIds, allowed) => {
    const { base44, entities } = setup({
      invoke: async (_name, payload) => ({
        data: {
          service_date: payload.service_date,
          decision_status: "assignable",
          planning_assignment_allowed: true,
          draft_assignment_allowed: true,
          employment_routing_status: "resolved",
          contract_id: "contract-b",
          employing_company_id: "company-b",
          payroll_cao_key: "cao_particuliere_beveiliging",
        },
      }),
    });
    entities.PlanningShift.records.splice(1);
    entities.PlanningShift.records[0].required_security_pass_types = ["green"];
    entities.PlanningAssignment.records.length = 0;
    entities.PersonnelAbsence.records.length = 0;
    entities.PersonnelRestriction.records.length = 0;
    entities.PersonnelSecurityPass.records.push(...companyIds.map((companyId, index) => ({
      id: `pass-${index + 1}`,
      personnel_id: "person-1",
      company_id: companyId,
      pass_type: "green",
      status: "active",
      valid_from: "2026-01-01",
      valid_until: "2026-12-31",
    })));

    const result = await backend.prefetchAssignmentEligibility(base44, {
      basis_token: `planning-employer-pass-${companyIds.join("-")}`,
      candidates: [candidate()],
    });

    expect(result.results[0].draft_assignment_allowed).toBe(allowed);
    expect(result.results[0].draft_assignment_blocking_codes || []).toEqual(
      allowed ? [] : expect.arrayContaining(["security_pass_blocked"]),
    );
  });

  it.each(["missing_contract", "ambiguous"])(
    "laat bij een %s arbeidsroute geen willekeurige company-scoped pas als bewijs gelden",
    async routingStatus => {
      const { base44, entities } = setup({
        invoke: async (_name, payload) => ({
          data: {
            service_date: payload.service_date,
            decision_status: "blocked",
            planning_assignment_allowed: false,
            draft_assignment_allowed: true,
            employment_routing_status: routingStatus,
            contract_id: null,
            employing_company_id: null,
            payroll_cao_key: null,
          },
        }),
      });
      entities.PlanningShift.records.splice(1);
      entities.PlanningShift.records[0].required_security_pass_types = ["green"];
      entities.PlanningAssignment.records.length = 0;
      entities.PersonnelAbsence.records.length = 0;
      entities.PersonnelRestriction.records.length = 0;
      entities.PersonnelSecurityPass.records.push({
        id: "pass-company-b",
        personnel_id: "person-1",
        company_id: "company-b",
        pass_type: "green",
        status: "active",
        valid_from: "2026-01-01",
        valid_until: "2026-12-31",
      });

      const result = await backend.prefetchAssignmentEligibility(base44, {
        basis_token: `planning-unresolved-pass-${routingStatus}`,
        candidates: [candidate()],
      });

      expect(result.results[0]).toMatchObject({
        routing_draft_assignment_allowed: true,
        draft_assignment_allowed: false,
        draft_assignment_blocking_codes: expect.arrayContaining(["security_pass_blocked"]),
      });
    },
  );

  it("blokkeert company-scoped pasbewijs wanneer de werkgever binnen een nachtdienst wisselt", async () => {
    const { base44, entities } = setup({
      invoke: async (_name, payload) => ({
        data: {
          service_date: payload.service_date,
          decision_status: "assignable",
          planning_assignment_allowed: true,
          draft_assignment_allowed: true,
          employment_routing_status: "resolved",
          contract_id: payload.service_date === "2026-08-24" ? "contract-b" : "contract-c",
          employing_company_id: payload.service_date === "2026-08-24" ? "company-b" : "company-c",
          payroll_cao_key: "cao_particuliere_beveiliging",
        },
      }),
    });
    entities.PlanningShift.records.splice(1);
    Object.assign(entities.PlanningShift.records[0], {
      start_time: "22:00",
      end_date: "2026-08-25",
      end_time: "02:00",
      required_security_pass_types: ["green"],
    });
    entities.PlanningAssignment.records.length = 0;
    entities.PersonnelAbsence.records.length = 0;
    entities.PersonnelRestriction.records.length = 0;
    entities.PersonnelSecurityPass.records.push(...["company-b", "company-c"].map(companyId => ({
      id: `pass-${companyId}`,
      personnel_id: "person-1",
      company_id: companyId,
      pass_type: "green",
      status: "active",
      valid_from: "2026-01-01",
      valid_until: "2026-12-31",
    })));

    const result = await backend.prefetchAssignmentEligibility(base44, {
      basis_token: "planning-multiday-employer-pass",
      candidates: [candidate({
        start_time: "22:00",
        end_date: "2026-08-25",
        end_time: "02:00",
      })],
    });

    expect(result.results[0]).toMatchObject({
      draft_assignment_allowed: false,
      employment_routing_status: "ambiguous",
      draft_assignment_blocking_codes: expect.arrayContaining(["security_pass_blocked"]),
    });
  });

  it("warmt alle waarschuwingen read-only en dedupliceert dezelfde combinatie", async () => {
    const { base44, entities, invocationCount } = setup();
    const before = Object.fromEntries(Object.entries(entities).map(([name, client]) => [name, structuredClone(client.records)]));
    const result = await backend.prefetchAssignmentEligibility(base44, {
      basis_token: "planning-data-v12",
      candidates: [candidate(), candidate()],
    });

    expect(result).toMatchObject({
      ok: true,
      action: "prefetch_assignment_eligibility",
      basis_token: "planning-data-v12",
    });
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      candidate_key: "candidate-1",
      status: "ready",
      source: { kind: "shift", id: "shift-target", revision: 3 },
      has_critical_warnings: true,
    });
    expect(result.results[0].warning_codes).toEqual(expect.arrayContaining([
      "shift_overlap",
      "personnel_absence_leave",
      "personnel_restriction",
      "contract_cao_blocking_2026_08_24_1",
    ]));
    expect(result.results[0].source_revision_fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(invocationCount()).toBe(1);
    expect(Object.fromEntries(Object.entries(entities).map(([name, client]) => [name, client.records]))).toEqual(before);
  });

  it("markeert een stale bron per item en roept de CAO-resolver niet aan", async () => {
    const { base44, invocationCount } = setup();
    const result = await backend.prefetchAssignmentEligibility(base44, {
      basis_token: "planning-data-v13",
      candidates: [candidate({ expected_source_revision: 2 })],
    });

    expect(result.results[0]).toMatchObject({
      status: "stale",
      warning_codes: ["eligibility_source_revision_stale"],
    });
    expect(invocationCount()).toBe(0);
  });

  it("sluit alleen een gevalideerde eigen overlappende toewijzing uit bij dezelfde-medewerker-preview", async () => {
    const { base44, invocationCount } = setup();
    const result = await backend.prefetchAssignmentEligibility(base44, {
      basis_token: "planning-data-same-person-merge",
      candidates: [candidate({
        start_time: "10:00",
        end_time: "18:00",
        exclude_assignment_id: "assignment-overlap",
      })],
    });

    expect(result.results[0]).toMatchObject({
      status: "ready",
      has_critical_warnings: true,
    });
    expect(result.results[0].warning_codes).not.toContain("shift_overlap");
    expect(result.results[0].warning_codes).toEqual(expect.arrayContaining([
      "personnel_absence_leave",
      "personnel_restriction",
      "contract_cao_blocking_2026_08_24_1",
    ]));
    expect(invocationCount()).toBe(1);
  });

  it("faalt per combinatie gesloten voor een vreemde exclude_assignment_id", async () => {
    const { base44, entities, invocationCount } = setup();
    entities.PlanningAssignment.records[0].personnel_id = "person-other";
    const result = await backend.prefetchAssignmentEligibility(base44, {
      basis_token: "planning-data-invalid-exclusion",
      candidates: [candidate({ exclude_assignment_id: "assignment-overlap" })],
    });

    expect(result.results[0]).toMatchObject({
      status: "unavailable",
      has_critical_warnings: true,
      warning_codes: ["eligibility_invalid_exclude_assignment"],
    });
    expect(invocationCount()).toBe(0);
  });

  it("neemt beveiligingspas en een volgende-dagdienst mee in de servervoorcontrole", async () => {
    let resolverCalls = 0;
    const { base44, entities } = setup({
      invoke: async (_name, payload) => {
        resolverCalls += 1;
        return {
          data: {
            service_date: payload.service_date,
            decision_status: "assignable",
            planning_assignment_allowed: true,
            draft_assignment_allowed: true,
            employment_routing_status: "resolved",
            contract_id: "contract-company-1",
            employing_company_id: "company-1",
            payroll_cao_key: "cao_particuliere_beveiliging",
          },
        };
      },
    });
    entities.PlanningShift.records[0].required_security_pass_types = ["green"];
    entities.PlanningShift.records.push({
      id: "shift-next-day-rest",
      revision: 1,
      status: "draft",
      service_date: "2026-08-25",
      start_time: "02:00",
      end_time: "06:00",
    });
    entities.PlanningAssignment.records.push({
      id: "assignment-next-day-rest",
      revision: 1,
      personnel_id: "person-1",
      shift_id: "shift-next-day-rest",
      status: "draft",
    });
    entities.PersonnelSecurityPass.records.push({
      id: "pass-expired",
      personnel_id: "person-1",
      company_id: "company-1",
      pass_type: "green",
      status: "expired",
      valid_until: "2026-08-23",
    });

    const result = await backend.prefetchAssignmentEligibility(base44, {
      basis_token: "planning-data-pass-rest",
      candidates: [candidate()],
    });

    expect(result.results[0]).toMatchObject({ status: "ready", has_critical_warnings: true });
    expect(result.results[0].warning_codes).toEqual(expect.arrayContaining([
      "security_pass_expired",
      "insufficient_rest",
      "personnel_restriction",
    ]));
    const initialFingerprint = result.results[0].source_revision_fingerprint;
    const restShift = entities.PlanningShift.records.find(item => item.id === "shift-next-day-rest");
    restShift.start_time = "03:00";
    restShift.revision = 2;
    const afterRestChange = await backend.prefetchAssignmentEligibility(base44, {
      basis_token: "planning-data-pass-rest-shift-change",
      candidates: [candidate()],
    });
    expect(afterRestChange.results[0].source_revision_fingerprint).not.toBe(initialFingerprint);

    entities.PersonnelSecurityPass.records[0].valid_until = "2026-08-22";
    entities.PersonnelSecurityPass.records[0].revision = 2;
    const afterPassChange = await backend.prefetchAssignmentEligibility(base44, {
      basis_token: "planning-data-pass-rest-pass-change",
      candidates: [candidate()],
    });
    expect(afterPassChange.results[0].source_revision_fingerprint)
      .not.toBe(afterRestChange.results[0].source_revision_fingerprint);
    expect(resolverCalls).toBe(3);
  });

  it("begrensst parallelle resolvercalls tot zes en isoleert een mislukte combinatie", async () => {
    let active = 0;
    let maximumActive = 0;
    const people = Array.from({ length: 7 }, (_, index) => ({
      id: `person-${index + 1}`,
      revision: 1,
      status: "active",
    }));
    const { base44 } = setup({
      personnel: people,
      invoke: async (_name, payload) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise(resolve => setTimeout(resolve, 5));
        active -= 1;
        if (payload.personnel_id === "person-7") throw new Error("resolver tijdelijk niet beschikbaar");
        return { data: { decision_status: "assignable", contract_id: `contract-${payload.personnel_id}` } };
      },
    });
    const result = await backend.prefetchAssignmentEligibility(base44, {
      basis_token: "planning-data-v14",
      candidates: people.map((person, index) => candidate({
        candidate_key: `candidate-${index + 1}`,
        personnel_id: person.id,
      })),
    });

    expect(maximumActive).toBe(6);
    expect(result.results.filter(item => item.status === "ready")).toHaveLength(6);
    expect(result.results.find(item => item.personnel_id === "person-7")).toMatchObject({
      status: "unavailable",
      warning_codes: ["assignment_validation_unavailable_2026_08_24"],
    });
  });

  it("weigert een te grote batch vóór een resolvercall", async () => {
    const { base44, invocationCount } = setup();
    await expect(backend.prefetchAssignmentEligibility(base44, {
      basis_token: "planning-data-v15",
      candidates: Array.from({ length: 49 }, (_, index) => candidate({ candidate_key: `candidate-${index}` })),
    })).rejects.toMatchObject({ status: 413 });
    expect(invocationCount()).toBe(0);
  });
});
