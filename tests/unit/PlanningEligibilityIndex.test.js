import { describe, expect, it, vi } from "vitest";
import {
  batchPlanningEligibilityCandidates,
  buildOccurrenceEligibilityShift,
  buildPlanningEligibilityObjectShiftContext,
  buildPlanningEligibilityPrefetchCandidate,
  createPlanningEligibilityUrgentRequestGate,
  createPlanningEligibilityIndex,
  mergePlanningEligibilityServerDecisions,
  planningEligibilityCandidateKey,
  planningEligibilityOwnSourceRevisionMatches,
  planningEligibilitySourceSemanticsEqual,
  selectPlanningEligibilityRequestCandidates,
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
  task_type_key: "reception",
  required_qualification_types: ["beveiliger_2"],
};
const contract = {
  id: "contract-1",
  personnel_id: person.id,
  company_id: "company-1",
  document_status: "active",
  contract_start_date: "2025-01-01",
  contract_hours_per_week: 36,
  cao_key: "cao_particuliere_beveiliging",
  allowed_task_types: ["reception"],
  planning_allowed: true,
  contract_final_allowed: true,
  payroll_final_allowed: true,
  legal_validation_status: "compliant",
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
  it("bewaart begrensd eligibility-bewijs per basis tijdens een optimistische delete-overgang", () => {
    const expiresAt = new Date(NOW + 60_000).toISOString();
    const original = {
      candidate_key: "candidate-original",
      basis_token: "basis-before-delete",
      status: "ready",
      evaluated_at: new Date(NOW - 2_000).toISOString(),
      expires_at: expiresAt,
    };
    const optimistic = {
      candidate_key: "candidate-open-task",
      basis_token: "basis-optimistic-delete",
      status: "ready",
      evaluated_at: new Date(NOW - 1_000).toISOString(),
      expires_at: expiresAt,
    };

    const merged = mergePlanningEligibilityServerDecisions([original], [optimistic], { now: NOW });

    expect(merged).toEqual(expect.arrayContaining([original, optimistic]));
  });

  it("overschrijft alleen dezelfde candidate+basis en laat oud bewijs nooit als huidige basis gelden", () => {
    const expiresAt = new Date(NOW + 60_000).toISOString();
    const oldDecision = {
      candidate_key: "candidate-1",
      basis_token: "basis-1",
      status: "checking",
      evaluated_at: new Date(NOW - 5_000).toISOString(),
      expires_at: expiresAt,
    };
    const replacement = {
      ...oldDecision,
      status: "ready",
      evaluated_at: new Date(NOW - 1_000).toISOString(),
    };
    const otherBasis = {
      ...replacement,
      basis_token: "basis-2",
      status: "unavailable",
    };

    const merged = mergePlanningEligibilityServerDecisions(
      [oldDecision, otherBasis],
      [replacement],
      { now: NOW },
    );

    expect(merged).toHaveLength(2);
    expect(merged).toContain(replacement);
    expect(merged).toContain(otherBasis);
    expect(merged).not.toContain(oldDecision);
  });

  it("laat een laat oud antwoord een nieuwere beslissing voor dezelfde basis niet overschrijven", () => {
    const current = {
      candidate_key: "candidate-1",
      basis_token: "basis-1",
      status: "ready",
      evaluated_at: new Date(NOW - 1_000).toISOString(),
      expires_at: new Date(NOW + 60_000).toISOString(),
    };
    const lateOlderResponse = {
      ...current,
      status: "unavailable",
      evaluated_at: new Date(NOW - 50_000).toISOString(),
    };

    expect(mergePlanningEligibilityServerDecisions(
      [current],
      [lateOlderResponse],
      { now: NOW },
    )).toEqual([current]);
  });

  it("laat een latere revision-stale response fail-closed een oud ready-verdict verdringen", () => {
    const readyRevisionThree = {
      candidate_key: "candidate-semantic-shift",
      basis_token: "remote-facts-basis-1",
      status: "ready",
      source: { kind: "shift", id: "shift-1", revision: 3 },
      evaluated_at: new Date(NOW - 5_000).toISOString(),
      expires_at: new Date(NOW + 60_000).toISOString(),
      warning_snapshot: [],
    };
    const lateRevisionStale = {
      ...readyRevisionThree,
      status: "stale",
      source: { kind: "shift", id: "shift-1", revision: 4 },
      evaluated_at: new Date(NOW - 1_000).toISOString(),
      warning_snapshot: [{
        code: "eligibility_source_revision_stale",
        severity: "warning",
        message: "De dienstrevision is intussen technisch verhoogd.",
        source: "planningApi",
      }],
      warning_codes: ["eligibility_source_revision_stale"],
    };

    expect(mergePlanningEligibilityServerDecisions(
      [readyRevisionThree],
      [lateRevisionStale],
      { now: NOW },
    )).toEqual([lateRevisionStale]);
  });

  it("behoudt warm bewijs alleen wanneer de actuele bronrevision semantisch gelijk is bewezen", () => {
    const compositeKey = "remote-facts-basis-1\u0000candidate-semantic-shift";
    const ready = {
      candidate_key: "candidate-semantic-shift",
      basis_token: "remote-facts-basis-1",
      status: "ready",
      source: { kind: "shift", id: "shift-1", revision: 3 },
      evaluated_at: new Date(NOW - 5_000).toISOString(),
      expires_at: new Date(NOW + 60_000).toISOString(),
      warning_snapshot: [],
    };
    const stale = {
      ...ready,
      status: "stale",
      source: { kind: "shift", id: "shift-1", revision: 4 },
      evaluated_at: new Date(NOW - 1_000).toISOString(),
      warning_codes: ["eligibility_source_revision_stale"],
    };
    const beforeAck = { ...shift, id: "shift-1", revision: 3 };
    const technicalAck = { ...beforeAck, revision: 4 };
    const semanticEdit = { ...technicalAck, end_time: "16:00" };

    expect(planningEligibilitySourceSemanticsEqual(beforeAck, technicalAck)).toBe(true);
    expect(planningEligibilitySourceSemanticsEqual(beforeAck, semanticEdit)).toBe(false);
    expect(planningEligibilitySourceSemanticsEqual(beforeAck, {
      ...technicalAck,
      task_type_key: "mobile_control_round",
    })).toBe(false);
    expect(mergePlanningEligibilityServerDecisions([ready], [stale], {
      now: NOW,
      retainReadySourceRevisionKeys: new Set([compositeKey]),
    })).toEqual([ready]);
    expect(mergePlanningEligibilityServerDecisions([ready], [stale], {
      now: NOW,
      retainReadySourceRevisionKeys: new Set(),
    })).toEqual([stale]);
  });

  it("accepteert een revision-stale uitzondering alleen voor een aantoonbare eigen ACK", () => {
    const acknowledged = {
      revision: 4,
      source: { ...shift, id: "shift-1", revision: 4 },
    };
    const resultSource = { kind: "shift", id: "shift-1", revision: 4 };
    const currentSource = { ...shift, id: "shift-1", revision: 4 };

    expect(planningEligibilityOwnSourceRevisionMatches(
      acknowledged,
      resultSource,
      currentSource,
    )).toBe(true);
    expect(planningEligibilityOwnSourceRevisionMatches(
      acknowledged,
      { ...resultSource, revision: 5 },
      { ...currentSource, revision: 5 },
    )).toBe(false);
    expect(planningEligibilityOwnSourceRevisionMatches(
      acknowledged,
      resultSource,
      { ...currentSource, end_time: "16:00" },
    )).toBe(false);
  });

  it("herhaalt een mislukte hovercontrole niet maar laat een begrensde drop-retry wel toe", () => {
    const candidate = { candidate_key: "candidate-1" };
    const unavailable = [{
      candidate_key: "candidate-1",
      basis_token: "basis-1",
      status: "unavailable",
      evaluated_at: new Date(NOW).toISOString(),
      expires_at: new Date(NOW + 15_000).toISOString(),
    }];

    expect(selectPlanningEligibilityRequestCandidates({
      candidates: [candidate],
      decisions: unavailable,
      basisToken: "basis-1",
      now: NOW + 1,
    })).toMatchObject({ status: "cooldown", candidates: [] });

    expect(selectPlanningEligibilityRequestCandidates({
      candidates: [candidate],
      decisions: unavailable,
      basisToken: "basis-1",
      forceRetry: true,
      now: NOW + 1,
    })).toMatchObject({
      status: "started",
      candidates: [candidate],
      requestKeys: ["basis-1:candidate-1"],
    });
  });

  it("start geen tweede verzoek zolang exact dezelfde candidate al onderweg is", () => {
    expect(selectPlanningEligibilityRequestCandidates({
      candidates: [{ candidate_key: "candidate-1" }],
      basisToken: "basis-1",
      pendingRequestKeys: new Set(["basis-1:candidate-1"]),
      now: NOW,
    })).toMatchObject({ status: "pending", candidates: [] });
  });

  it("kiest bij dezelfde candidate altijd het bewijs van de actuele basis", () => {
    const withoutServer = createPlanningEligibilityIndex(indexOptions());
    const candidateKey = planningEligibilityCandidateKey({ personnelId: person.id, shift });
    const expiresAt = new Date(NOW + 60_000).toISOString();
    const currentBasisDecision = {
      candidate_key: candidateKey,
      basis_token: withoutServer.basisToken,
      status: "ready",
      evaluated_at: new Date(NOW - 1_000).toISOString(),
      expires_at: expiresAt,
      routing_draft_assignment_allowed: true,
      employment_routing_status: "resolved",
      warning_snapshot: [],
    };
    const oldBasisDecision = {
      ...currentBasisDecision,
      basis_token: "older-planning-basis",
      status: "unavailable",
      evaluated_at: new Date(NOW - 5_000).toISOString(),
    };
    const merged = mergePlanningEligibilityServerDecisions(
      [oldBasisDecision],
      [currentBasisDecision],
      { now: NOW },
    );
    const withServer = createPlanningEligibilityIndex(indexOptions({
      requireServerDecision: true,
      serverDecisions: merged,
    }));

    expect(withServer.queryShift({ personnelId: person.id, shift })).toMatchObject({
      basisToken: withoutServer.basisToken,
      status: "ready",
      isClear: true,
    });
  });

  it("verwijdert verlopen bewijs en begrenst zowel bases als totale cacheomvang", () => {
    const freshExpiry = new Date(NOW + 60_000).toISOString();
    const records = Array.from({ length: 8 }, (_, index) => ({
      candidate_key: `candidate-${index}`,
      basis_token: `basis-${index}`,
      status: "ready",
      evaluated_at: new Date(NOW - index * 1_000).toISOString(),
      expires_at: index === 7 ? new Date(NOW - 1).toISOString() : freshExpiry,
    }));

    const merged = mergePlanningEligibilityServerDecisions(records, [], {
      now: NOW,
      maxBasisTokens: 3,
      maxEntries: 2,
    });

    expect(merged).toHaveLength(2);
    expect(merged.every(item => item.expires_at === freshExpiry)).toBe(true);
    expect(new Set(merged.map(item => item.basis_token)).size).toBeLessThanOrEqual(3);
  });

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

  it("houdt een lokaal actueel verdict amber totdat expliciet serverbewijs beschikbaar is", () => {
    const index = createPlanningEligibilityIndex(indexOptions());
    const result = index.queryShift({ personnelId: person.id, shift });

    expect(index.status).toBe("ready");
    expect(result.status).toBe("ready");
    expect(result.isClear).toBe(false);
    expect(result.draftAssignmentAllowed).toBe(false);
    expect(result.displayWarnings).toEqual([]);
    expect(result.serverFinalAuthority).toBe(true);
  });

  it("toont lokaal het ontbrekende arbeidscontract maar wacht fail-closed op serverbewijs", () => {
    const index = createPlanningEligibilityIndex(indexOptions({
      contracts: [],
      securityPasses: [{ ...pass, company_id: null }],
    }));
    const result = index.queryShift({ personnelId: person.id, shift });

    expect(result.status).toBe("ready");
    expect(result.draftAssignmentAllowed).toBe(false);
    expect(result.hasCritical).toBe(false);
    expect(result.isClear).toBe(false);
    expect(result.warnings).toContainEqual(expect.objectContaining({
      code: "contract_missing",
      severity: "warning",
      title: "Arbeidscontract koppelen",
    }));
  });

  it.each([
    {
      label: "ontbrekende route",
      status: "missing_contract",
      code: "contract_missing",
      severity: "warning",
      contracts: [],
    },
    {
      label: "ambigue route",
      status: "ambiguous",
      code: "contract_ambiguous",
      severity: "critical",
      contracts: [{ ...contract, id: "contract-2" }, { ...contract, id: "contract-3" }],
    },
  ])("laat een warme $label alleen toe met expliciet resolverbewijs", ({ status, code, severity, contracts }) => {
    const bootstrap = createPlanningEligibilityIndex(indexOptions({
      contracts,
      securityPasses: [{ ...pass, company_id: null }],
      requireServerDecision: true,
    }));
    const candidateKey = planningEligibilityCandidateKey({ personnelId: person.id, shift });
    const index = createPlanningEligibilityIndex(indexOptions({
      contracts,
      securityPasses: [{ ...pass, company_id: null }],
      requireServerDecision: true,
      serverDecisions: [{
        candidate_key: candidateKey,
        basis_token: bootstrap.basisToken,
        status: "ready",
        evaluated_at: new Date(NOW - 1_000).toISOString(),
        expires_at: new Date(NOW + 60_000).toISOString(),
        routing_draft_assignment_allowed: true,
        employment_routing_status: status,
        employment_routing_codes: [code],
        warning_snapshot: [{ code, severity, message: `Actuele ${status}.` }],
      }],
    }));

    expect(index.queryShift({ personnelId: person.id, shift })).toMatchObject({
      status: "ready",
      draftAssignmentAllowed: true,
      routingDraftAssignmentAllowed: true,
      employmentRoutingStatus: status,
      employmentRoutingCodes: [code],
    });
  });

  it("houdt een koude cache en een legacy-ready antwoord zonder draftbewijs geblokkeerd", () => {
    const cold = createPlanningEligibilityIndex(indexOptions({ requireServerDecision: true }));
    const candidateKey = planningEligibilityCandidateKey({ personnelId: person.id, shift });
    expect(cold.queryShift({ personnelId: person.id, shift })).toMatchObject({
      status: "checking",
      draftAssignmentAllowed: false,
    });
    const legacyReady = createPlanningEligibilityIndex(indexOptions({
      requireServerDecision: true,
      serverDecisions: [{
        candidate_key: candidateKey,
        basis_token: cold.basisToken,
        status: "ready",
        evaluated_at: new Date(NOW - 1_000).toISOString(),
        expires_at: new Date(NOW + 60_000).toISOString(),
        employment_routing_status: "resolved",
        warning_snapshot: [],
      }],
    }));
    expect(legacyReady.queryShift({ personnelId: person.id, shift })).toMatchObject({
      status: "ready",
      draftAssignmentAllowed: false,
      routingDraftAssignmentAllowed: false,
    });
  });

  it("laat een laat ouder blokkeerantwoord een geldige missing-contractconceptactie niet terugdraaien", () => {
    const current = {
      candidate_key: "candidate-missing-contract",
      basis_token: "basis-missing-contract",
      status: "ready",
      evaluated_at: new Date(NOW - 1_000).toISOString(),
      expires_at: new Date(NOW + 60_000).toISOString(),
      routing_draft_assignment_allowed: true,
      employment_routing_status: "missing_contract",
      employment_routing_codes: ["contract_missing"],
    };
    const lateOlder = {
      ...current,
      evaluated_at: new Date(NOW - 30_000).toISOString(),
      routing_draft_assignment_allowed: false,
      employment_routing_status: "stale",
      employment_routing_codes: ["contract_routing_stale"],
    };

    expect(mergePlanningEligibilityServerDecisions([current], [lateOlder], { now: NOW }))
      .toEqual([current]);
  });

  it("accepteert lokaal de route naar een andere werkgever maar wacht op serverbewijs voor groen", () => {
    const index = createPlanningEligibilityIndex(indexOptions({
      contracts: [{ ...contract, company_id: "company-b" }],
      securityPasses: [{ ...pass, company_id: "company-b" }],
    }));
    const result = index.queryShift({ personnelId: person.id, shift });

    expect(result.status).toBe("ready");
    expect(result.isClear).toBe(false);
    expect(result.draftAssignmentAllowed).toBe(false);
    expect(result.warnings).toEqual([]);
  });

  it("houdt server-feiten warm wanneer alleen de optimistische planning wijzigt", () => {
    const before = createPlanningEligibilityIndex(indexOptions());
    const after = createPlanningEligibilityIndex(indexOptions({
      dependencies: readyDependencies({
        shifts: { version: "shifts-2" },
        assignments: { version: "assignments-2" },
      }),
    }));

    expect(after.basisToken).toBe(before.basisToken);
    expect(after.remoteFactsBasisToken).toBe(before.remoteFactsBasisToken);
    expect(after.scheduleBasisToken).not.toBe(before.scheduleBasisToken);
    expect(after.basisToken).not.toContain("shifts:");
    expect(after.basisToken).not.toContain("assignments:");
    expect(after.scheduleBasisToken).toContain("shifts:ready:shifts-2");
    expect(after.scheduleBasisToken).toContain("assignments:ready:assignments-2");
  });

  it("hergebruikt warme serverfeiten maar ziet een optimistische overlap, rust- en urenwaarschuwing direct", () => {
    const shortContract = { ...contract, contract_hours_per_week: 12 };
    const bootstrap = createPlanningEligibilityIndex(indexOptions({
      contracts: [shortContract],
      requireServerDecision: true,
    }));
    const candidateKey = planningEligibilityCandidateKey({ personnelId: person.id, shift });
    const warmDecision = {
      candidate_key: candidateKey,
      basis_token: bootstrap.basisToken,
      status: "ready",
      evaluated_at: new Date(NOW - 1_000).toISOString(),
      expires_at: new Date(NOW + 60_000).toISOString(),
      routing_draft_assignment_allowed: true,
      employment_routing_status: "resolved",
      warning_snapshot: [],
    };
    const before = createPlanningEligibilityIndex(indexOptions({
      contracts: [shortContract],
      requireServerDecision: true,
      serverDecisions: [warmDecision],
    }));
    expect(before.queryShift({ personnelId: person.id, shift })).toMatchObject({
      status: "ready",
      isClear: true,
    });

    const overlappingShift = {
      ...shift,
      id: "shift-optimistic-overlap",
      name: "Optimistische overlap",
      start_time: "08:00",
      end_time: "12:00",
    };
    const nearbyShift = {
      ...shift,
      id: "shift-optimistic-nearby",
      name: "Optimistische avonddienst",
      start_time: "20:00",
      end_time: "21:00",
    };
    const after = createPlanningEligibilityIndex(indexOptions({
      shifts: [shift, overlappingShift, nearbyShift],
      assignments: [overlappingShift, nearbyShift].map(item => ({
        id: `assignment-${item.id}`,
        planning_shift_id: item.id,
        personnel_id: person.id,
        status: "draft",
      })),
      contracts: [shortContract],
      dependencies: readyDependencies({
        shifts: { version: "shifts-optimistic-2" },
        assignments: { version: "assignments-optimistic-2" },
      }),
      requireServerDecision: true,
      serverDecisions: [warmDecision],
    }));
    const result = after.queryShift({ personnelId: person.id, shift });

    expect(after.basisToken).toBe(before.basisToken);
    expect(after.scheduleBasisToken).not.toBe(before.scheduleBasisToken);
    expect(result.status).toBe("ready");
    expect(result.routingDraftAssignmentAllowed).toBe(true);
    expect(result.draftAssignmentAllowed).toBe(false);
    expect(result.warnings.map(item => item.code)).toEqual(expect.arrayContaining([
      "double_booking",
      "insufficient_rest",
      "contract_hours_exceeded",
    ]));
  });

  it("verwijdert oude server-planningswaarschuwingen maar behoudt statische CAO-waarschuwingen", () => {
    const bootstrap = createPlanningEligibilityIndex(indexOptions({ requireServerDecision: true }));
    const candidateKey = planningEligibilityCandidateKey({ personnelId: person.id, shift });
    const caoWarning = {
      code: "cao_manual_review",
      severity: "warning",
      title: "CAO-controle",
      detail: "Handmatige beoordeling nodig.",
      source: "cao",
    };
    const index = createPlanningEligibilityIndex(indexOptions({
      requireServerDecision: true,
      serverDecisions: [{
        candidate_key: candidateKey,
        basis_token: bootstrap.basisToken,
        status: "ready",
        expires_at: new Date(NOW + 60_000).toISOString(),
        warning_snapshot: [
          {
            code: "legacy_planning_warning",
            severity: "warning",
            message: "Planning is intussen gewijzigd.",
            source: "planning",
          },
          { code: "shift_overlap", severity: "critical", message: "Oude overlap." },
          { code: "double_booking", severity: "critical", message: "Oude dubbele dienst." },
          { code: "insufficient_rest", severity: "warning", message: "Oude rustwaarschuwing." },
          { code: "contract_hours_exceeded", severity: "warning", message: "Oude urenwaarschuwing." },
          caoWarning,
        ],
      }],
    }));
    const result = index.queryShift({ personnelId: person.id, shift });

    expect(result.status).toBe("ready");
    expect(result.warnings).toEqual([caoWarning]);
    expect(result.displayWarnings.map(item => item.code)).toEqual(["cao_manual_review"]);
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
        routing_draft_assignment_allowed: true,
        employment_routing_status: "resolved",
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
      task_type_key: "reception",
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
      task_type_key: "reception",
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

  it("houdt dezelfde semantische dienstcandidate warm na alleen een technische revision-ACK", () => {
    const beforeAck = planningEligibilityCandidateKey({
      personnelId: person.id,
      shift: { ...shift, revision: 3 },
    });
    const afterAck = planningEligibilityCandidateKey({
      personnelId: person.id,
      shift: { ...shift, revision: 4 },
    });

    expect(afterAck).toBe(beforeAck);
    expect(planningEligibilityCandidateKey({
      personnelId: person.id,
      shift: { ...shift, revision: 4, start_time: "07:00" },
    })).not.toBe(beforeAck);
    expect(planningEligibilityCandidateKey({
      personnelId: person.id,
      shift: { ...shift, revision: 4, status: "cancelled" },
    })).not.toBe(beforeAck);
  });

  it("bindt een dienstcandidate ook aan routebeperkingen en expliciete pasvrijstelling", () => {
    const baseline = planningEligibilityCandidateKey({
      personnelId: person.id,
      shift: {
        ...shift,
        route_name_snapshot: "Route Noord",
        requires_security_pass: true,
        security_pass_required: true,
      },
    });

    expect(planningEligibilityCandidateKey({
      personnelId: person.id,
      shift: {
        ...shift,
        route_name_snapshot: "Route Zuid",
        requires_security_pass: true,
        security_pass_required: true,
      },
    })).not.toBe(baseline);
    expect(planningEligibilityCandidateKey({
      personnelId: person.id,
      shift: {
        ...shift,
        route_name_snapshot: "Route Noord",
        requires_security_pass: false,
        security_pass_required: false,
      },
    })).not.toBe(baseline);
  });

  it("begrensd snelle unieke hovercontroles en geeft een slot idempotent vrij", () => {
    const gate = createPlanningEligibilityUrgentRequestGate({ maxConcurrent: 2 });
    const releaseFirst = gate.acquire();
    const releaseSecond = gate.acquire();

    expect(releaseFirst).toEqual(expect.any(Function));
    expect(releaseSecond).toEqual(expect.any(Function));
    expect(gate.acquire()).toBeNull();
    expect(gate.getSnapshot()).toEqual({ active: 2, maximum: 2, available: 0 });

    expect(releaseFirst()).toBe(true);
    expect(releaseFirst()).toBe(false);
    const releaseLatest = gate.acquire();
    expect(releaseLatest).toEqual(expect.any(Function));
    expect(gate.getSnapshot()).toEqual({ active: 2, maximum: 2, available: 0 });

    releaseSecond();
    releaseLatest();
    expect(gate.getSnapshot()).toEqual({ active: 0, maximum: 2, available: 2 });

    const heldDropGate = createPlanningEligibilityUrgentRequestGate({ maxConcurrent: 1 });
    const releaseHeldDrop = heldDropGate.acquire();
    expect(releaseHeldDrop).toEqual(expect.any(Function));
    expect(heldDropGate.acquire()).toBeNull();
    releaseHeldDrop();
    expect(heldDropGate.getSnapshot()).toEqual({ active: 0, maximum: 1, available: 1 });
  });
});
