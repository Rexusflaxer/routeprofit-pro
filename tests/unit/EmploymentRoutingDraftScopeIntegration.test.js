import fs from "node:fs";
import path from "node:path";
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from "node:util";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let contractResolverHandler;
let assignmentDecisionHandler;

async function loadFunctionHandler(relativePath, clientGlobalName) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  let capturedHandler = null;
  globalThis.Deno = { serve: candidate => { capturedHandler = candidate; } };
  const { transform } = await import("esbuild");
  const compiled = await transform(source.replace(
    /^import \{ createClientFromRequest \} from 'npm:@base44\/sdk@[^']+';$/m,
    `const createClientFromRequest = () => globalThis.${clientGlobalName};`,
  ), { format: "esm", loader: "ts", target: "es2022" });
  await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString("base64")}`);
  return capturedHandler;
}

beforeAll(async () => {
  globalThis.TextEncoder = NodeTextEncoder;
  globalThis.TextDecoder = NodeTextDecoder;
  globalThis.Uint8Array = new NodeTextEncoder().encode("").constructor;
  contractResolverHandler = await loadFunctionHandler(
    "base44/functions/resolvePersonnelContractForService/entry.ts",
    "__employmentDraftContractBase44",
  );
  assignmentDecisionHandler = await loadFunctionHandler(
    "base44/functions/resolveCaoPlanningAssignmentDecision/entry.ts",
    "__employmentDraftDecisionBase44",
  );
});

const securityReceptionContext = {
  personnel_id: "personnel-1",
  service_date: "2026-09-05",
  required_task_types: ["reception"],
  task_type: "reception",
  function_type: "objectbeveiliger",
  cao_function_group: "objectbeveiliger_receptionist",
  cao_function_level: "a",
  security_role_status: "beveiliger",
  performs_security_work: true,
  security_work_percentage: 100,
  cao_key: "cao_particuliere_beveiliging",
  contract_assignment_policy: "strict_contract_match",
};

const validWpbr = {
  wpbr_status: "approved",
  wpbr_permission_number: "WPBR-123",
  wpbr_authority: "Justis",
  wpbr_permission_valid_from: "2026-01-01",
  wpbr_permission_valid_until: "2026-12-31",
};

const validSecurityQualification = {
  id: "qualification-security-1",
  qualification_type: "mbo_beveiliger",
  verification_status: "verified",
  valid_from: "2026-01-01",
  valid_until: "2026-12-31",
};

const ambiguousReceptionContracts = ["contract-a", "contract-b"].map((id, index) => ({
  id,
  personnel_id: "personnel-1",
  company_id: `employer-${index + 1}`,
  cao_key: "cao_particuliere_beveiliging",
  allowed_task_types: ["reception"],
  contract_start_date: "2026-01-01",
  contract_end_date: "2026-12-31",
  document_status: "active",
  legal_validation_status: "compliant",
  is_current: true,
}));

async function resolveAndDecide({
  contracts = [],
  personnel = {},
  qualifications = [],
  serviceContext = securityReceptionContext,
} = {}) {
  globalThis.__employmentDraftContractBase44 = {
    auth: { me: async () => ({ id: "admin-1", role: "admin" }) },
    entities: {
      Personnel: {
        get: async () => ({ id: "personnel-1", name: "Medewerker", status: "active", ...personnel }),
      },
      Task: { get: async () => null },
      Route: { get: async () => null },
      SurveillanceObject: { get: async () => null },
    },
    asServiceRole: {
      entities: {
        PersonnelContract: { filter: async () => contracts },
        PersonnelCompanyAssignment: { filter: async () => [] },
        PersonnelQualification: { filter: async () => qualifications },
      },
    },
  };

  const resolverResponse = await contractResolverHandler(new Request(
    "https://example.test/functions/resolvePersonnelContractForService",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        personnel_id: "personnel-1",
        service_date: "2026-09-05",
        service_context: serviceContext,
      }),
    },
  ));
  const contractResolution = await resolverResponse.json();

  globalThis.__employmentDraftDecisionBase44 = {
    auth: { me: async () => ({ id: "admin-1", role: "admin" }) },
    asServiceRole: {
      functions: {
        invoke: async name => {
          if (name !== "resolvePersonnelContractForService") {
            throw new Error(`Onverwachte functiecall: ${name}`);
          }
          return { data: contractResolution };
        },
      },
    },
  };

  const decisionResponse = await assignmentDecisionHandler(new Request(
    "https://example.test/functions/resolveCaoPlanningAssignmentDecision",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        personnel_id: "personnel-1",
        service_date: "2026-09-05",
        cao_key: "cao_particuliere_beveiliging",
        planning_interactive_fast_path: true,
        service_context: serviceContext,
      }),
    },
  ));

  return {
    resolverResponse,
    contractResolution,
    decisionResponse,
    decision: await decisionResponse.json(),
  };
}

describe("conceptuitzondering voor ontbrekende arbeidscontractroute", () => {
  it("laat een beveiligde receptiedienst met geldige medewerkerbewijzen in concept toe", async () => {
    const result = await resolveAndDecide({
      personnel: validWpbr,
      qualifications: [validSecurityQualification],
    });

    expect(result.resolverResponse.status).toBe(200);
    expect(result.contractResolution).toMatchObject({
      employment_routing_status: "missing_contract",
      contract_id: null,
      function_match: {
        status: "not_proven",
        resolution_dependency: "employment_contract_route",
        unresolved_due_to_employment_route: true,
      },
      security_scope_match: {
        status: "not_proven",
        resolution_dependency: "employment_contract_route",
        unresolved_due_to_employment_route: true,
      },
      qualification_check: { required: true, status: "compliant", matched: true },
      wpbr_permission_check: { required: true, status: "compliant", planning_allowed: true },
    });
    expect(result.decisionResponse.status).toBe(200);
    expect(result.decision).toMatchObject({
      decision_status: "blocked",
      planning_assignment_allowed: false,
      draft_assignment_allowed: true,
      employment_routing_status: "missing_contract",
      contract_id: null,
      employing_company_id: null,
      payroll_cao_key: null,
    });
  });

  it("laat dezelfde aantoonbaar veilige inzet ook bij een ambigue arbeidsroute in concept toe", async () => {
    const result = await resolveAndDecide({
      contracts: ambiguousReceptionContracts,
      personnel: validWpbr,
      qualifications: [validSecurityQualification],
    });

    expect(result.contractResolution).toMatchObject({
      employment_routing_status: "ambiguous",
      contract_id: null,
      contract_candidate_ids: ["contract-a", "contract-b"],
      function_match: {
        status: "not_proven",
        unresolved_due_to_employment_route: true,
      },
      security_scope_match: {
        status: "not_proven",
        unresolved_due_to_employment_route: true,
      },
      qualification_check: { required: true, status: "compliant", matched: true },
      wpbr_permission_check: { required: true, status: "compliant", planning_allowed: true },
    });
    expect(result.decision).toMatchObject({
      planning_assignment_allowed: false,
      draft_assignment_allowed: true,
      employment_routing_status: "ambiguous",
      contract_id: null,
      employing_company_id: null,
      payroll_cao_key: null,
    });
  });

  it("houdt een ontbrekend vereist kwalificatiebewijs ook in concept hard geblokkeerd", async () => {
    const result = await resolveAndDecide({ personnel: validWpbr, qualifications: [] });

    expect(result.contractResolution.qualification_check).toMatchObject({
      required: true,
      status: "blocked",
      matched: false,
    });
    expect(result.decision).toMatchObject({
      planning_assignment_allowed: false,
      draft_assignment_allowed: false,
      employment_routing_status: "missing_contract",
    });
  });

  it("houdt ontbrekende vereiste WPBR-toestemming ook in concept hard geblokkeerd", async () => {
    const result = await resolveAndDecide({
      personnel: {},
      qualifications: [validSecurityQualification],
    });

    expect(result.contractResolution.wpbr_permission_check).toMatchObject({
      required: true,
      status: "manual_review_required",
      planning_allowed: false,
    });
    expect(result.decision).toMatchObject({
      planning_assignment_allowed: false,
      draft_assignment_allowed: false,
      employment_routing_status: "missing_contract",
    });
  });

  it("behandelt tegenstrijdige beveiligingssignalen niet als uitsluitend route-afhankelijk", async () => {
    const result = await resolveAndDecide({
      personnel: validWpbr,
      qualifications: [validSecurityQualification],
      serviceContext: {
        ...securityReceptionContext,
        performs_security_work: false,
        security_work_percentage: 0,
      },
    });

    expect(result.contractResolution.security_scope_match).toMatchObject({
      status: "manual_review_required",
      resolution_dependency: "service_context",
      unresolved_due_to_employment_route: false,
    });
    expect(result.decision).toMatchObject({
      planning_assignment_allowed: false,
      draft_assignment_allowed: false,
      employment_routing_status: "missing_contract",
    });
  });
});
