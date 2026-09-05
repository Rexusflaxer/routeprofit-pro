import fs from "node:fs";
import path from "node:path";
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from "node:util";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = fs.readFileSync(
  path.join(root, "base44/functions/resolvePersonnelContractForService/entry.ts"),
  "utf8",
);
let backend;
let handler;

beforeAll(async () => {
  globalThis.TextEncoder = NodeTextEncoder;
  globalThis.TextDecoder = NodeTextDecoder;
  globalThis.Uint8Array = new NodeTextEncoder().encode("").constructor;
  globalThis.Deno = { serve: candidate => { handler = candidate; } };
  const { transform } = await import("esbuild");
  const compiled = await transform(source.replace(
    /^import \{ createClientFromRequest \} from 'npm:@base44\/sdk@[^']+';$/m,
    "const createClientFromRequest = () => globalThis.__personnelContractBase44;",
  ), { format: "esm", loader: "ts", target: "es2022" });
  backend = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString("base64")}`);
});

function contract(allowedTaskTypes) {
  return {
    allowed_task_types: allowedTaskTypes,
    allowed_function_types: ["objectbeveiliger"],
    allowed_cao_function_groups: ["objectbeveiliger_receptionist"],
    allowed_cao_function_levels: ["b"],
    allowed_security_role_statuses: ["beveiliger"],
  };
}

function context(requiredTaskTypes) {
  return {
    required_task_types: requiredTaskTypes,
    function_type: "objectbeveiliger",
    cao_function_group: "objectbeveiliger_receptionist",
    cao_function_level: "b",
    security_role_status: "beveiliger",
    contract_assignment_policy: "strict_contract_match",
  };
}

function scopedContract({
  id,
  companyId,
  caoKey = "cao_particuliere_beveiliging",
  allowedTaskTypes,
  startDate = "2026-01-01",
  endDate = "2026-12-31",
}) {
  return {
    id,
    personnel_id: "personnel-1",
    company_id: companyId,
    cao_key: caoKey,
    allowed_task_types: allowedTaskTypes,
    contract_start_date: startDate,
    contract_end_date: endDate,
    document_status: "active",
    legal_validation_status: "compliant",
    is_current: true,
  };
}

function setResolverBase44({ contracts = [], personnel = {}, qualifications = [] } = {}) {
  globalThis.__personnelContractBase44 = {
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
}

function resolverRequest(serviceContext) {
  return new Request("https://example.test/functions/resolvePersonnelContractForService", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      personnel_id: "personnel-1",
      service_date: "2026-09-05",
      service_context: {
        service_date: "2026-09-05",
        required_task_types: ["reception"],
        contract_assignment_policy: "strict_contract_match",
        ...serviceContext,
      },
    }),
  });
}

describe("arbeidscontract-taakscope in de backend", () => {
  it.each([
    ["Objectbeveiliging", "object_security"],
    ["Brand- & sluitronde", "fire_closing_round"],
    ["Externe sluitronde", "external_closing_round"],
    ["Externe controleronde", "external_control_round"],
    ["Openingsronde", "opening_round"],
    ["Mobiele controleronde", "mobile_control_round"],
    ["Receptiedienst", "reception"],
    ["Sluitbegeleiding", "closing_assistance"],
    ["Toegangscontrole", "access_control"],
    ["Brandwacht", "fire_watch"],
    ["Portier / concierge", "concierge"],
    ["other:definition-42", "other:definition-42"],
  ])("normaliseert veilig %s naar %s", (label, expected) => {
    expect(backend.canonicalTaskTypeKey(label)).toBe(expected);
  });

  it("houdt onbekende taaklabels fail-closed", () => {
    expect(backend.canonicalTaskTypeKey("vrije niet-gecatalogiseerde dienst")).toBeNull();
    expect(backend.canonicalTaskTypeKey("other:vrije tekst")).toBeNull();
    expect(backend.canonicalTaskTypeKey("other:<script>")).toBeNull();
  });

  it("accepteert alleen canonieke taakkeys en vereist een stabiele scope voor overig", () => {
    expect(backend.canonicalTaskTypeKey("reception")).toBe("reception");
    expect(backend.canonicalTaskTypeKey("Receptiedienst")).toBe("reception");
    expect(backend.canonicalTaskTypeKey("Brand- en sluitronde")).toBe("fire_closing_round");
    expect(backend.canonicalTaskTypeKey("Brand- & sluitronde")).toBe("fire_closing_round");
    expect(backend.canonicalTaskTypeKey("other:definition-42")).toBe("other:definition-42");
    expect(backend.canonicalTaskTypeKey("other")).toBeNull();
    expect(backend.canonicalTaskTypeKey("zelf_verzonnen")).toBeNull();
  });

  it("laat een specifieke maatwerk-taaksleutel de generieke waarde other vervangen", () => {
    const requested = backend.requiredCanonicalTaskTypeKeys({
      task_type_key: "other:definition-42",
      task_type: "other",
      required_task_types: ["other", "other:definition-42"],
    });
    const match = backend.evaluateTaskTypeMatch(
      contract(["other:definition-42"]),
      {
        task_type_key: "other:definition-42",
        task_type: "other",
        required_task_types: ["other", "other:definition-42"],
      },
    );

    expect(requested).toEqual({
      task_type_keys: ["other:definition-42"],
      invalid_task_type_keys: [],
    });
    expect(match).toMatchObject({
      matched: true,
      requested_task_type_keys: ["other:definition-42"],
      invalid_requested_task_type_keys: [],
    });
  });

  it("kiest het arbeidscontract op medewerker, volledige periode en taaksoort, niet op verkopend bedrijf of dienst-CAO", () => {
    const employerBContract = scopedContract({
      id: "contract-employer-b",
      companyId: "employer-b",
      caoKey: "cao_particuliere_beveiliging",
      allowedTaskTypes: ["reception"],
    });
    const result = backend.resolveTaskScopedContractCandidates({
      contracts: [
        scopedContract({
          id: "contract-selling-a",
          companyId: "selling-a",
          caoKey: "cao_evenementen_horecabeveiliging",
          allowedTaskTypes: ["fire_closing_round"],
        }),
        employerBContract,
      ],
      serviceContext: {
        service_date: "2026-09-05",
        covered_service_dates: ["2026-09-05"],
        required_task_types: ["reception"],
        company_id: "selling-a",
        service_responsible_company_id: "selling-a",
        cao_key: "cao_evenementen_horecabeveiliging",
      },
    });

    expect(result.selection_status).toBe("resolved");
    expect(result.selected_contract).toBe(employerBContract);
    expect(result.contract_candidates.map(item => item.id)).toEqual(["contract-employer-b"]);
  });

  it("vereist dat hetzelfde contract alle canonieke segmenttaaksoorten dekt", () => {
    const result = backend.resolveTaskScopedContractCandidates({
      contracts: [
        scopedContract({
          id: "contract-reception",
          companyId: "employer-a",
          allowedTaskTypes: ["reception"],
        }),
        scopedContract({
          id: "contract-round",
          companyId: "employer-b",
          allowedTaskTypes: ["fire_closing_round"],
        }),
      ],
      serviceContext: {
        service_date: "2026-09-05",
        required_task_types: ["reception", "fire_closing_round"],
      },
    });

    expect(result.selection_status).toBe("missing_contract");
    expect(result.selected_contract).toBeNull();
    expect(result.contract_candidates).toEqual([]);
  });

  it("wijst een contract af wanneer het niet de volledige meerdagse dienstperiode dekt", () => {
    const result = backend.resolveTaskScopedContractCandidates({
      contracts: [scopedContract({
        id: "contract-ending-too-early",
        companyId: "employer-a",
        allowedTaskTypes: ["reception"],
        endDate: "2026-09-05",
      })],
      serviceContext: {
        service_date: "2026-09-05",
        covered_service_dates: ["2026-09-05", "2026-09-06"],
        required_task_types: ["reception"],
      },
    });

    expect(result.selection_status).toBe("missing_contract");
    expect(result.selected_contract).toBeNull();
  });

  it("laat een expliciet bedrijf of CAO geen twee overlappende arbeidsroutes ontwarren", () => {
    const result = backend.resolveTaskScopedContractCandidates({
      contracts: [
        scopedContract({ id: "contract-a", companyId: "employer-a", allowedTaskTypes: ["reception"] }),
        scopedContract({ id: "contract-b", companyId: "employer-b", allowedTaskTypes: ["reception"] }),
      ],
      serviceContext: {
        service_date: "2026-09-05",
        required_task_types: ["reception"],
        company_id: "employer-a",
        cao_key: "cao_particuliere_beveiliging",
      },
    });

    expect(result.selection_status).toBe("ambiguous");
    expect(result.selected_contract).toBeNull();
    expect(result.contract_candidates.map(item => item.id)).toEqual(["contract-a", "contract-b"]);
  });

  it("houdt een zuiver ontbrekende arbeidsroute zonder extra inzetvereisten als zodanig herkenbaar", async () => {
    setResolverBase44();

    const response = await handler(resolverRequest({
      performs_security_work: false,
      security_work_percentage: 0,
      security_role_status: "not_applicable",
    }));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result).toMatchObject({
      employment_routing_status: "missing_contract",
      contract_id: null,
      function_match: null,
      security_scope_match: null,
      wpbr_permission_check: { required: false, status: "not_required" },
      qualification_check: { required: false, status: "not_required", matched: true },
    });
  });

  it("evalueert expliciete functie- en kwalificatie-eisen ook zonder arbeidscontract", async () => {
    setResolverBase44();

    const response = await handler(resolverRequest({
      function_type: "planning",
      performs_security_work: false,
      security_work_percentage: 0,
      security_role_status: "not_applicable",
      required_qualification_types: ["bhv"],
    }));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result).toMatchObject({
      employment_routing_status: "missing_contract",
      function_match: {
        required: true,
        status: "not_proven",
        matched: false,
        manual_review_required: true,
      },
      qualification_check: {
        required: true,
        status: "blocked",
        matched: false,
      },
    });
    expect(result.function_match.missing_proof_checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "function_type", requested: "planning" }),
    ]));
    expect(result.qualification_check.blocking_reasons).toEqual(expect.arrayContaining([
      expect.stringContaining("Expliciet vereist kwalificatietype bhv"),
    ]));
  });

  it("evalueert beveiligingsscope en WPBR bij een ambigue arbeidsroute fail-closed", async () => {
    setResolverBase44({
      contracts: [
        scopedContract({ id: "contract-a", companyId: "employer-a", allowedTaskTypes: ["reception"] }),
        scopedContract({ id: "contract-b", companyId: "employer-b", allowedTaskTypes: ["reception"] }),
      ],
      personnel: {
        wpbr_status: "approved",
        wpbr_permission_number: "WPBR-123",
        wpbr_authority: "Justis",
        wpbr_permission_valid_from: "2026-01-01",
        wpbr_permission_valid_until: "2026-12-31",
      },
    });

    const response = await handler(resolverRequest({
      performs_security_work: true,
      security_work_percentage: 100,
    }));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result).toMatchObject({
      employment_routing_status: "ambiguous",
      contract_id: null,
      security_scope_match: {
        required: true,
        status: "not_proven",
        matched: false,
        manual_review_required: true,
      },
      wpbr_permission_check: {
        required: true,
        status: "compliant",
        planning_allowed: true,
      },
    });
  });

  it("voert bedrijfscontroles pas uit voor de werkgever uit het unieke taakcontract", async () => {
    const companyChecks = [];
    const employerContract = {
      ...scopedContract({
        id: "contract-employer-b",
        companyId: "employer-b",
        caoKey: "cao_evenementen_horecabeveiliging",
        allowedTaskTypes: ["Receptiedienst"],
      }),
      contract_context_status: "compliant",
      cao_contract_rule_status: "not_applicable",
      contract_final_allowed: true,
      planning_allowed: true,
      payroll_final_allowed: false,
      allowed_function_types: ["planning"],
      performs_security_work: false,
      allowed_security_role_statuses: ["not_applicable"],
    };
    globalThis.__personnelContractBase44 = {
      auth: { me: async () => ({ id: "admin-1", role: "admin" }) },
      entities: {
        Personnel: { get: async () => ({ id: "personnel-1", name: "Medewerker", status: "active" }) },
        Task: { get: async () => null },
        Route: { get: async () => null },
        SurveillanceObject: { get: async () => null },
      },
      asServiceRole: {
        entities: {
          PersonnelContract: {
            filter: async () => [
              scopedContract({
                id: "contract-selling-a-wrong-task",
                companyId: "selling-a",
                allowedTaskTypes: ["fire_closing_round"],
              }),
              employerContract,
            ],
          },
          PersonnelCompanyAssignment: {
            filter: async () => [
              { id: "assignment-selling-a", company_id: "selling-a", assignment_status: "active", available_for_planning: true },
              { id: "assignment-employer-b", company_id: "employer-b", assignment_status: "active", available_for_planning: true },
            ],
          },
          PersonnelQualification: { filter: async () => [] },
          CompanyWpbrLicense: {
            filter: async query => {
              companyChecks.push(["CompanyWpbrLicense.filter", query]);
              return [];
            },
          },
          Company: {
            get: async id => {
              companyChecks.push(["Company.get", id]);
              return { id, name: "Employer B" };
            },
          },
          CompanyCaoAssignment: {
            filter: async query => {
              companyChecks.push(["CompanyCaoAssignment.filter", query]);
              return [];
            },
          },
          CAOConfiguration: { filter: async () => [] },
        },
        functions: { invoke: async () => ({}) },
      },
    };
    const response = await handler(new Request("https://example.test/functions/resolvePersonnelContractForService", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        personnel_id: "personnel-1",
        service_date: "2026-09-05",
        company_id: "selling-a",
        cao_key: "cao_particuliere_beveiliging",
        service_context: {
          service_date: "2026-09-05",
          required_task_types: ["reception"],
          function_type: "planning",
          performs_security_work: false,
          security_work_percentage: 0,
          security_role_status: "not_applicable",
          service_responsible_company_id: "selling-a",
          selling_company_id: "selling-a",
          company_id: "selling-a",
          cao_key: "cao_particuliere_beveiliging",
        },
      }),
    }));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result).toMatchObject({
      contract_id: "contract-employer-b",
      company_id: "employer-b",
      employing_company_id: "employer-b",
      payroll_cao_key: "cao_evenementen_horecabeveiliging",
      service_responsible_company_id: "selling-a",
      selling_company_id: "selling-a",
      company_assignment_id: "assignment-employer-b",
    });
    expect(companyChecks).toEqual([
      ["CompanyWpbrLicense.filter", { company_id: "employer-b" }],
      ["Company.get", "employer-b"],
      ["CompanyCaoAssignment.filter", { company_id: "employer-b" }],
    ]);
  });

  it("vereist dat één contract alle taaksoorten van een samengestelde dienst toestaat", () => {
    expect(backend.evaluateFunctionMatch(
      contract(["reception", "fire_closing_round"]),
      context(["reception", "fire_closing_round"]),
    ).matched).toBe(true);

    const mismatch = backend.evaluateFunctionMatch(
      contract(["reception"]),
      context(["reception", "fire_closing_round"]),
    );
    expect(mismatch.matched).toBe(false);
    expect(mismatch.blocking_checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "task_type", requested: "fire_closing_round" }),
    ]));
  });

  it("gebruikt dezelfde beperkte Nederlandse aliassen in de latere functiecontrole", () => {
    const result = backend.evaluateFunctionMatch(
      contract(["Receptiedienst", "Brand- & sluitronde"]),
      context(["reception", "fire_closing_round"]),
    );

    expect(result.matched).toBe(true);
    expect(result.blocking_checks).toEqual([]);
  });

  it("accepteert een ontbrekende taakscope niet stil in strict mode", () => {
    const result = backend.evaluateFunctionMatch(
      contract([]),
      context(["reception"]),
    );

    expect(result.matched).toBe(false);
    expect(result.manual_review_required).toBe(true);
    expect(result.missing_proof_checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "task_type", requested: "reception" }),
    ]));
  });
});
