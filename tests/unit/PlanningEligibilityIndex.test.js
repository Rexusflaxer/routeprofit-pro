import { describe, expect, it, vi } from "vitest";
import {
  batchPlanningEligibilityCandidates,
  buildOccurrenceEligibilityShift,
  buildPlanningEligibilityObjectShiftContext,
  buildPlanningEligibilityPrefetchCandidate,
  createPlanningEligibilityIndex,
  planningEligibilityCandidateKey,
} from "@/components/planning/planningEligibilityIndex";

const NOW = Date.parse("2026-08-22T10:00:00.000Z");

const person = { id: "person-1", name: "Ada Agent", status: "active" };
const shift = {
  id: "shift-1",
  revision: 3,
  name: "Receptiedienst",
  service_date: "2026-08-24",
  start_time: "06:30",
  end_time: "15:30",
  company_id: "company-1",
  object_id: "object-1",
  required_qualification_types: ["beveiliger_2"],
};
const contract = {
  id: "contract-1",
  personnel_id: person.id,
  company_id: "company-1",
  document_status: "active",
  contract_start_date: "2025-01-01",
  contract_hours_per_week: 36,
};
const qualification = {
  id: "qualification-1",
  personnel_id: person.id,
  company_id: "company-1",
  qualification_type: "beveiliger_2",
  verification_status: "verified",
  valid_from: "2025-01-01",
};
const pass = {
  id: "pass-1",
  personnel_id: person.id,
  company_id: "company-1",
  pass_type: "green",
  status: "active",
  valid_from: "2025-01-01",
};

function readyDependencies(overrides = {}) {
  return Object.fromEntries([
    "personnel",
    "shifts",
    "assignments",
    "absences",
    "qualifications",
    "securityPasses",
    "restrictions",
    "contracts",
    "objects",
  ].map(name => [name, {
    status: "success",
    hasData: true,
    updatedAt: NOW - 1_000,
    version: `${name}-1`,
    ...(overrides[name] || {}),
  }]));
}

function indexOptions(overrides = {}) {
  return {
    personnel: [person],
    shifts: [shift],
    assignments: [],
    absences: [],
    qualifications: [qualification],
    securityPasses: [pass],
    restrictions: [],
    contracts: [contract],
    dependencies: readyDependencies(),
    requireServerDecision: false,
    now: NOW,
    ...overrides,
  };
}

describe("visible-range planning eligibility index", () => {
  it("projecteert alle autoritatieve objectdefaults in dezelfde occurrence-context", () => {
    const context = buildPlanningEligibilityObjectShiftContext({
      object: {
        id: "object-1",
        customer_id: "customer-1",
        default_operating_company_id: "company-1",
        cao_key: "cao-pb",
        default_service_function_type: "receptionist",
        default_cao_function_group: "B",
        default_cao_function_level: "2",
        default_security_role_status: "beveiliger",
        default_required_qualification_types: ["beveiliger_2"],
        default_required_qualification_groups: ["base_security"],
        default_required_security_pass_types: ["green"],
        contract_assignment_policy: "strict_contract_match",
        default_performs_security_work: true,
        default_security_work_percentage: 75,
        default_works_event_or_hospitality_security: true,
        default_event_hospitality_cao_applies: true,
        default_works_airport_schiphol: true,
        default_works_cash_value_logistics: true,
        default_customer_billable: false,
        default_counts_toward_required_staffing: false,
      },
      occurrence: {
        object_id: "object-1",
        customer_id: "customer-occurrence",
        timezone: "Europe/Amsterdam",
      },
    });

    expect(context).toEqual({
      company_id: "company-1",
      customer_id: "customer-occurrence",
      object_id: "object-1",
      cao_key: "cao-pb",
      service_function_type: "receptionist",
      required_cao_function_group: "B",
      required_cao_function_level: "2",
      required_security_role_status: "beveiliger",
      required_qualification_types: ["beveiliger_2"],
      required_qualification_groups: ["base_security"],
      required_security_pass_types: ["green"],
      contract_assignment_policy: "strict_contract_match",
      performs_security_work: true,
      security_work_percentage: 75,
      works_event_or_hospitality_security: true,
      event_hospitality_cao_applies: true,
      works_airport_schiphol: true,
      works_cash_value_logistics: true,
      customer_billable: false,
      counts_toward_required_staffing: false,
      timezone: "Europe/Amsterdam",
    });
  });

  it("geeft direct een lokaal, actueel en groen verdict wanneer alle bronnen bekend zijn", () => {
    const index = createPlanningEligibilityIndex(indexOptions());
    const result = index.queryShift({ personnelId: person.id, shift });

    expect(index.status).toBe("ready");
    expect(result.status).toBe("ready");
    expect(result.isClear).toBe(true);
    expect(result.displayWarnings).toEqual([]);
    expect(result.serverFinalAuthority).toBe(true);
  });

  it("toont ontbrekende of ladende data nooit als veilig", () => {
    const index = createPlanningEligibilityIndex(indexOptions({
      dependencies: readyDependencies({
        assignments: { status: "loading", hasData: false, updatedAt: null, version: "" },
      }),
    }));
    const result = index.queryShift({ personnelId: person.id, shift });

    expect(result.status).toBe("checking");
    expect(result.isClear).toBe(false);
    expect(result.displayWarnings).toContainEqual(expect.objectContaining({
      code: "eligibility_check_pending",
    }));
  });

  it("markeert een oude bron en een oude serverbeslissing expliciet als stale", () => {
    const dependencies = readyDependencies({
      contracts: { updatedAt: NOW - 10 * 60_000 },
    });
    const localIndex = createPlanningEligibilityIndex(indexOptions({
      dependencies,
      maxAgeMs: 60_000,
    }));
    expect(localIndex.queryShift({ personnelId: person.id, shift })).toEqual(expect.objectContaining({
      status: "stale",
      isClear: false,
    }));

    const freshIndex = createPlanningEligibilityIndex(indexOptions({ requireServerDecision: true }));
    const candidateKey = planningEligibilityCandidateKey({ personnelId: person.id, shift });
    const remoteIndex = createPlanningEligibilityIndex(indexOptions({
      requireServerDecision: true,
      serverDecisions: [{
        candidate_key: candidateKey,
        status: "ready",
        basis_token: `${freshIndex.basisToken}-old`,
        warnings: [],
      }],
    }));
    const remoteResult = remoteIndex.queryShift({ personnelId: person.id, shift });
    expect(remoteResult.status).toBe("stale");
    expect(remoteResult.displayWarnings.map(item => item.code)).toContain("eligibility_server_stale");
  });

  it("toont bekende lokale conflicten al terwijl de servervoorcontrole nog loopt", () => {
    const overlappingShift = {
      ...shift,
      id: "shift-existing",
      start_time: "08:00",
      end_time: "12:00",
    };
    const index = createPlanningEligibilityIndex(indexOptions({
      shifts: [shift, overlappingShift],
      assignments: [{
        id: "assignment-existing",
        planning_shift_id: overlappingShift.id,
        personnel_id: person.id,
        status: "draft",
      }],
      requireServerDecision: true,
    }));
    const result = index.queryShift({ personnelId: person.id, shift });

    expect(result.status).toBe("checking");
    expect(result.hasCritical).toBe(true);
    expect(result.warnings.map(item => item.code)).toContain("double_booking");
    expect(result.displayWarnings.map(item => item.code)).toContain("eligibility_server_checking");
  });

  it("neemt alleen een serververdict met dezelfde databasis mee", () => {
    const bootstrap = createPlanningEligibilityIndex(indexOptions({ requireServerDecision: true }));
    const candidateKey = planningEligibilityCandidateKey({ personnelId: person.id, shift });
    const index = createPlanningEligibilityIndex(indexOptions({
      requireServerDecision: true,
      serverDecisions: [{
        candidate_key: candidateKey,
        status: "ready",
        basis_token: bootstrap.basisToken,
        expires_at: new Date(NOW + 60_000).toISOString(),
        warning_snapshot: [{
          code: "cao_manual_review",
          severity: "warning",
          title: "CAO-controle",
          detail: "Handmatige beoordeling nodig.",
        }],
      }],
    }));
    const result = index.queryShift({ personnelId: person.id, shift });

    expect(result.status).toBe("ready");
    expect(result.isClear).toBe(false);
    expect(result.warnings.map(item => item.code)).toContain("cao_manual_review");
  });

  it("accepteert een serververdict zonder expliciete databasis nooit als actueel", () => {
    const candidateKey = planningEligibilityCandidateKey({ personnelId: person.id, shift });
    const index = createPlanningEligibilityIndex(indexOptions({
      requireServerDecision: true,
      serverDecisions: [{ candidate_key: candidateKey, status: "ready", warnings: [] }],
    }));

    expect(index.queryShift({ personnelId: person.id, shift })).toEqual(expect.objectContaining({
      status: "stale",
      isClear: false,
    }));
  });

  it("laat een verlopen serververdict zonder index-herbouw direct van groen naar stale gaan", () => {
    let clock = NOW;
    const bootstrap = createPlanningEligibilityIndex(indexOptions({
      requireServerDecision: true,
      now: () => clock,
    }));
    const candidateKey = planningEligibilityCandidateKey({ personnelId: person.id, shift });
    const index = createPlanningEligibilityIndex(indexOptions({
      requireServerDecision: true,
      now: () => clock,
      serverDecisions: [{
        candidate_key: candidateKey,
        status: "ready",
        basis_token: bootstrap.basisToken,
        expires_at: new Date(NOW + 1_000).toISOString(),
        warning_snapshot: [],
      }],
    }));

    expect(index.queryShift({ personnelId: person.id, shift }).isClear).toBe(true);
    clock += 2_000;
    expect(index.queryShift({ personnelId: person.id, shift })).toEqual(expect.objectContaining({
      status: "stale",
      isClear: false,
    }));
  });

  it("behoudt al bekende serverwaarschuwingen wanneer de warme controle tijdelijk stale of unavailable is", () => {
    const candidateKey = planningEligibilityCandidateKey({ personnelId: person.id, shift });
    const warning = {
      code: "cao_manual_review",
      severity: "warning",
      title: "CAO-controle",
      detail: "Handmatige beoordeling nodig.",
    };
    const index = createPlanningEligibilityIndex(indexOptions({
      requireServerDecision: true,
      serverDecisions: [{
        candidate_key: candidateKey,
        status: "unavailable",
        warning_snapshot: [warning],
      }],
    }));

    const result = index.queryShift({ personnelId: person.id, shift });
    expect(result.status).toBe("unavailable");
    expect(result.warnings).toContainEqual(warning);
    expect(result.displayWarnings.map(item => item.code)).toContain("cao_manual_review");
    expect(result.displayWarnings.map(item => item.code)).toContain("eligibility_server_unavailable");
  });

  it("bouwt voor een open occurrence dezelfde previewdienst die drag-hover controleert", () => {
    const occurrence = {
      id: "occurrence-1",
      revision: 2,
      object_task_definition_id: "definition-1",
      company_id: "company-1",
      customer_id: "customer-1",
      object_id: "object-1",
      service_date: "2026-08-24",
      end_date: "2026-08-24",
      window_start_time: "06:30",
      window_end_time: "18:00",
      task_name_snapshot: "Receptie",
    };
    const preview = buildOccurrenceEligibilityShift({
      occurrence,
      serviceDate: "2026-08-24",
      startTime: "06:30",
      endTime: "12:00",
      shiftContext: { required_qualification_types: ["beveiliger_2"] },
    });
    expect(preview).toEqual(expect.objectContaining({
      service_date: "2026-08-24",
      start_time: "06:30",
      end_time: "12:00",
      object_id: "object-1",
      required_qualification_types: ["beveiliger_2"],
    }));

    const index = createPlanningEligibilityIndex(indexOptions());
    expect(index.queryOccurrence({
      personnelId: person.id,
      occurrence,
      serviceDate: "2026-08-24",
      startTime: "06:30",
      endTime: "12:00",
      shiftContext: { required_qualification_types: ["beveiliger_2"] },
    }).status).toBe("ready");
  });

  it("memoized herhaald hoveren zonder waarschuwingen opnieuw uit te rekenen", () => {
    const evaluateWarnings = vi.fn(() => []);
    const index = createPlanningEligibilityIndex(indexOptions({ evaluateWarnings }));

    index.prewarm([{ personnelId: person.id, shift }]);
    for (let indexValue = 0; indexValue < 1_000; indexValue += 1) {
      index.queryShift({ personnelId: person.id, shift });
    }

    expect(evaluateWarnings).toHaveBeenCalledTimes(1);
    expect(index.stats).toEqual({ evaluations: 1, cacheHits: 1_000 });
  });

  it("bouwt een union-prefetch op de autoritatieve survivor en bindt de uitsluiting aan de candidate key", () => {
    const survivor = { ...shift, id: "shift-survivor", revision: 7 };
    const union = { ...survivor, end_time: "18:00" };
    const candidate = buildPlanningEligibilityPrefetchCandidate({
      kind: "shift",
      source: survivor,
      shift: union,
      personnelId: person.id,
      excludeAssignmentId: "assignment-survivor",
    });

    expect(candidate).toEqual(expect.objectContaining({
      source_id: "shift-survivor",
      expected_source_revision: 7,
      end_time: "18:00",
      exclude_assignment_id: "assignment-survivor",
    }));
    expect(candidate.candidate_key).toContain(encodeURIComponent("exclude:assignment-survivor"));
    expect(candidate._local).toEqual(expect.objectContaining({
      excludeAssignmentId: "assignment-survivor",
    }));
  });

  it("laat een impliciete einddatum weg zodat de server een nachtdienst naar de volgende dag projecteert", () => {
    const overnightShift = {
      ...shift,
      id: "shift-overnight",
      service_date: "2026-08-24",
      end_date: null,
      start_time: "22:00",
      end_time: "06:00",
    };
    const candidate = buildPlanningEligibilityPrefetchCandidate({
      source: overnightShift,
      shift: overnightShift,
      personnelId: person.id,
    });

    expect(candidate).toEqual(expect.objectContaining({
      service_date: "2026-08-24",
      start_time: "22:00",
      end_time: "06:00",
    }));
    expect(candidate).not.toHaveProperty("end_date");
  });

  it("batcht voorafcontroles ook op medewerkers, bronnen en maximaal veertien serverdatums", () => {
    const candidates = Array.from({ length: 50 }, (_, index) => {
      const day = String(1 + (index % 25)).padStart(2, "0");
      return {
        candidate_key: `candidate-${index}`,
        personnel_id: `person-${index % 23}`,
        source_kind: "shift",
        source_id: `shift-${index % 30}`,
        service_date: `2026-08-${day}`,
        end_date: `2026-08-${day}`,
      };
    });
    const batches = batchPlanningEligibilityCandidates(candidates);

    expect(batches.flat()).toEqual(candidates);
    expect(batches.length).toBeGreaterThan(1);
    batches.forEach(batch => {
      expect(batch.length).toBeLessThanOrEqual(48);
      expect(new Set(batch.map(item => item.personnel_id)).size).toBeLessThanOrEqual(20);
      expect(new Set(batch.map(item => `${item.source_kind}:${item.source_id}`)).size).toBeLessThanOrEqual(28);
      const dates = new Set();
      batch.forEach(item => {
        const date = new Date(`${item.service_date}T00:00:00.000Z`);
        dates.add(item.service_date);
        dates.add(new Date(date.getTime() - 86_400_000).toISOString().slice(0, 10));
        dates.add(new Date(date.getTime() + 86_400_000).toISOString().slice(0, 10));
      });
      expect(dates.size).toBeLessThanOrEqual(14);
    });
  });

  it("splitst verspreide datums volgens dezelfde vorige-en-volgende-daggrens als de server", () => {
    const candidates = [1, 4, 7, 10, 13, 16, 19].map(day => ({
      candidate_key: `candidate-${day}`,
      personnel_id: "person-1",
      source_kind: "shift",
      source_id: `shift-${day}`,
      service_date: `2026-08-${String(day).padStart(2, "0")}`,
      end_date: `2026-08-${String(day).padStart(2, "0")}`,
    }));

    const batches = batchPlanningEligibilityCandidates(candidates);

    expect(batches.length).toBeGreaterThan(1);
    expect(batches.flat()).toEqual(candidates);
    batches.forEach(batch => {
      const serverDates = new Set();
      batch.forEach(item => {
        const date = new Date(`${item.service_date}T00:00:00.000Z`);
        [-1, 0, 1].forEach(offset => serverDates.add(
          new Date(date.getTime() + offset * 86_400_000).toISOString().slice(0, 10),
        ));
      });
      expect(serverDates.size).toBeLessThanOrEqual(14);
    });
  });

  it.each([
    ["customer_id", "customer-2"],
    ["cao_key", "cao-company"],
    ["service_function_type", "mobiele_surveillance"],
    ["required_cao_function_group", "B"],
    ["required_cao_function_level", "2"],
    ["required_security_role_status", "leidinggevende"],
    ["required_qualification_types", ["centralist"]],
    ["required_qualification_groups", ["advanced_security"]],
    ["required_security_pass_types", ["airport"]],
    ["contract_assignment_policy", "strict_contract_match"],
    ["performs_security_work", false],
    ["security_work_percentage", 75],
    ["works_event_or_hospitality_security", true],
    ["event_hospitality_cao_applies", true],
    ["works_airport_schiphol", true],
    ["works_cash_value_logistics", true],
    ["customer_billable", false],
    ["counts_toward_required_staffing", false],
    ["timezone", "UTC"],
  ])("bindt routingveld %s aan de eligibility-candidate", (field, value) => {
    const baseline = planningEligibilityCandidateKey({ personnelId: person.id, shift });
    const changed = planningEligibilityCandidateKey({
      personnelId: person.id,
      shift: { ...shift, [field]: value },
    });

    expect(changed).not.toBe(baseline);
  });
});
