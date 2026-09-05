import fs from "node:fs";
import path from "node:path";
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from "node:util";
import { fileURLToPath } from "node:url";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = fs.readFileSync(
  path.join(root, "base44/functions/resolveCaoPlanningAssignmentDecision/entry.ts"),
  "utf8",
);

let handler;
let calls;

const readyServiceContext = {
  personnel_id: "personnel-1",
  object_id: "object-1",
  company_id: "company-1",
  service_date: "2026-08-17",
  cao_key: "cao_particuliere_beveiliging",
};

const readyServiceContextValidation = {
  success: true,
  service_context: readyServiceContext,
  service_context_readiness: {
    status: "planning_context_ready",
    ready: true,
    blocking_reasons: [],
    manual_review_reasons: [],
    warnings: [],
    source_rule_ids: ["context-rule"],
  },
  planning_contract_context: {
    ...readyServiceContext,
    readiness_source_rule_ids: ["context-rule"],
  },
};

function contractResolution({ includeReadiness = true } = {}) {
  return {
    success: true,
    status: "resolved",
    planning_allowed: true,
    payroll_final_allowed: true,
    manual_review_required: false,
    blocking_reasons: [],
    manual_review_reasons: [],
    warnings: [],
    personnel_id: "personnel-1",
    company_id: "company-1",
    employing_company_id: "company-1",
    payroll_cao_key: "cao_particuliere_beveiliging",
    employment_routing_status: "resolved",
    contract_id: "contract-1",
    contract_candidate_ids: ["contract-1"],
    selected_contract: {
      id: "contract-1",
      company_id: "company-1",
      cao_key: "cao_particuliere_beveiliging",
      cao_configuration_id: "cao-config-1",
    },
    cao_key: "cao_particuliere_beveiliging",
    cao_configuration_id: "cao-config-1",
    service_context: readyServiceContext,
    ...(includeReadiness ? {
      service_context_readiness: readyServiceContextValidation.service_context_readiness,
    } : {}),
  };
}

function request(body = {}) {
  return new Request("https://example.test/functions/resolveCaoPlanningAssignmentDecision", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      personnel_id: "personnel-1",
      object_id: "object-1",
      company_id: "company-1",
      service_date: "2026-08-17",
      cao_key: "cao_particuliere_beveiliging",
      planning_interactive_fast_path: true,
      service_context: readyServiceContext,
      ...body,
    }),
  });
}

beforeAll(async () => {
  globalThis.TextEncoder = NodeTextEncoder;
  globalThis.TextDecoder = NodeTextDecoder;
  globalThis.Uint8Array = new NodeTextEncoder().encode("").constructor;
  globalThis.Deno = { serve: candidate => { handler = candidate; } };
  const { transform } = await import("esbuild");
  const compiled = await transform(source.replace(
    /^import \{ createClientFromRequest \} from 'npm:@base44\/sdk@[^']+';$/m,
    "const createClientFromRequest = () => globalThis.__caoDecisionBase44;",
  ), { format: "esm", loader: "ts", target: "es2022" });
  await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString("base64")}`);
});

beforeEach(() => {
  calls = [];
  globalThis.__caoDecisionBase44 = {
    auth: { me: async () => ({ id: "admin-1", role: "admin" }) },
    asServiceRole: {
      functions: {
        invoke: async (name) => {
          calls.push(name);
          if (name === "resolvePersonnelContractForService") {
            return { data: contractResolution() };
          }
          if (name === "validateTaskPlanningContext") {
            return { data: readyServiceContextValidation };
          }
          if (name === "resolveCaoRuntimeReadiness") {
            return {
              data: {
                status: "all_requested_cao_runtimes_supported",
                cao_readiness: [{
                  cao_key: "cao_particuliere_beveiliging",
                  known_cao: true,
                  label: "CAO Particuliere Beveiliging",
                  status: "local_payroll_runtime_supported",
                  local_runtime_stage: "implemented_verified_foundation",
                  source_monitoring_status: "required",
                  source_families: ["main_cao_pdf"],
                  source_monitoring_contract: [{ family_key: "main_cao_pdf" }],
                  source_monitoring_summary: { family_count: 1 },
                  payroll_final_allowed_by_static_runtime: true,
                  planning_final_allowed_by_static_runtime: true,
                  manual_review_required: false,
                  blocking_reasons: [],
                  runtime_surfaces: [{ surface_key: "planning_assignment_decision", supported: true }],
                }],
              },
            };
          }
          throw new Error(`Onverwachte functiecall: ${name}`);
        },
      },
    },
  };
});

describe("resolveCaoPlanningAssignmentDecision interactieve call-waves", () => {
  it("hergebruikt contract-readiness en doet precies één geneste functiecall", async () => {
    const response = await handler(request());
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result).toMatchObject({
      decision_status: "assignable",
      planning_assignment_allowed: true,
      draft_assignment_allowed: true,
      employment_routing_status: "resolved",
      payroll_final_allowed: false,
      contract_id: "contract-1",
      employing_company_id: "company-1",
      payroll_cao_key: "cao_particuliere_beveiliging",
      cao_key: "cao_particuliere_beveiliging",
    });
    expect(calls).toEqual(["resolvePersonnelContractForService"]);
  });

  it("houdt verkopend dienstbedrijf en dienst-CAO buiten de loonroute", async () => {
    const sellingServiceContext = {
      ...readyServiceContext,
      company_id: "selling-company-a",
      service_responsible_company_id: "selling-company-a",
      cao_key: "cao_evenementen_horecabeveiliging",
    };
    globalThis.__caoDecisionBase44.asServiceRole.functions.invoke = async (name) => {
      calls.push(name);
      if (name !== "resolvePersonnelContractForService") {
        throw new Error(`Onverwachte functiecall: ${name}`);
      }
      return {
        data: {
          ...contractResolution(),
          company_id: "employer-company-b",
          employing_company_id: "employer-company-b",
          payroll_cao_key: "cao_particuliere_beveiliging",
          cao_key: "cao_particuliere_beveiliging",
          selected_contract: {
            ...contractResolution().selected_contract,
            company_id: "employer-company-b",
            cao_key: "cao_particuliere_beveiliging",
          },
          service_context: sellingServiceContext,
        },
      };
    };

    const response = await handler(request({
      company_id: "selling-company-a",
      cao_key: "cao_evenementen_horecabeveiliging",
      service_context: sellingServiceContext,
    }));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result).toMatchObject({
      decision_status: "assignable",
      planning_assignment_allowed: true,
      payroll_final_allowed: false,
      employment_routing_status: "resolved",
      employing_company_id: "employer-company-b",
      payroll_cao_key: "cao_particuliere_beveiliging",
      cao_key: "cao_particuliere_beveiliging",
    });
    expect(result.blocking_reasons.some(reason => reason.includes("CAO-conflict"))).toBe(false);
    expect(calls).toEqual(["resolvePersonnelContractForService"]);
  });

  it("behoudt de unieke arbeidsroute wanneer een kwalificatiecontrole de inzet blokkeert", async () => {
    globalThis.__caoDecisionBase44.asServiceRole.functions.invoke = async (name) => {
      calls.push(name);
      if (name !== "resolvePersonnelContractForService") {
        throw new Error(`Onverwachte functiecall: ${name}`);
      }
      return {
        data: {
          ...contractResolution(),
          success: false,
          status: "blocked",
          planning_allowed: false,
          payroll_final_allowed: false,
          manual_review_required: true,
          employment_routing_status: "blocked",
          blocking_reasons: ["Vereist kwalificatiebewijs ontbreekt."],
          qualification_check: {
            status: "blocked",
            matched: false,
            blocking_reasons: ["Vereist kwalificatiebewijs ontbreekt."],
          },
        },
      };
    };

    const response = await handler(request());
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result).toMatchObject({
      decision_status: "blocked",
      planning_assignment_allowed: false,
      draft_assignment_allowed: false,
      payroll_final_allowed: false,
      employment_routing_status: "resolved",
      contract_id: "contract-1",
      employing_company_id: "company-1",
      payroll_cao_key: "cao_particuliere_beveiliging",
    });
    expect(result.blocking_reasons).toContain("Vereist kwalificatiebewijs ontbreekt.");
    expect(calls).toEqual(["resolvePersonnelContractForService"]);
  });

  it("laat een werkelijk ambigue arbeidsroute fail-closed zonder route-ID's", async () => {
    globalThis.__caoDecisionBase44.asServiceRole.functions.invoke = async (name) => {
      calls.push(name);
      if (name !== "resolvePersonnelContractForService") {
        throw new Error(`Onverwachte functiecall: ${name}`);
      }
      return {
        data: {
          ...contractResolution(),
          success: false,
          status: "blocked",
          planning_allowed: false,
          payroll_final_allowed: false,
          manual_review_required: true,
          employment_routing_status: "ambiguous",
          company_id: null,
          employing_company_id: null,
          payroll_cao_key: null,
          contract_id: null,
          contract_candidate_ids: ["contract-1", "contract-2"],
          selected_contract: null,
          blocking_reasons: ["Meerdere arbeidscontracten dekken deze dienst."],
        },
      };
    };

    const response = await handler(request());
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result).toMatchObject({
      decision_status: "blocked",
      planning_assignment_allowed: false,
      draft_assignment_allowed: true,
      employment_routing_status: "ambiguous",
      contract_id: null,
      employing_company_id: null,
      payroll_cao_key: null,
    });
    expect(calls).toEqual(["resolvePersonnelContractForService"]);
  });

  it("laat uitsluitend een zuiver ontbrekende arbeidsroute in concept toe", async () => {
    globalThis.__caoDecisionBase44.asServiceRole.functions.invoke = async (name) => {
      calls.push(name);
      if (name !== "resolvePersonnelContractForService") {
        throw new Error(`Onverwachte functiecall: ${name}`);
      }
      return {
        data: {
          ...contractResolution(),
          success: false,
          status: "blocked",
          planning_allowed: false,
          payroll_final_allowed: false,
          manual_review_required: true,
          employment_routing_status: "missing_contract",
          company_id: null,
          employing_company_id: null,
          payroll_cao_key: null,
          contract_id: null,
          contract_candidate_ids: [],
          selected_contract: null,
          cao_key: null,
          cao_configuration_id: null,
          blocking_reasons: ["Geen actief arbeidscontract dekt deze taaksoort."],
        },
      };
    };

    const response = await handler(request());
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result).toMatchObject({
      decision_status: "blocked",
      planning_assignment_allowed: false,
      draft_assignment_allowed: true,
      employment_routing_status: "missing_contract",
      contract_id: null,
      employing_company_id: null,
      payroll_cao_key: null,
    });
  });

  it("behandelt de CAO van taak of verkopend bedrijf niet als loonruntime bij een ontbrekende arbeidsroute", async () => {
    globalThis.__caoDecisionBase44.asServiceRole.functions.invoke = async (name) => {
      calls.push(name);
      if (name !== "resolvePersonnelContractForService") {
        throw new Error(`Onverwachte functiecall: ${name}`);
      }
      return {
        data: {
          ...contractResolution(),
          success: false,
          status: "blocked",
          planning_allowed: false,
          payroll_final_allowed: false,
          manual_review_required: true,
          employment_routing_status: "missing_contract",
          company_id: null,
          employing_company_id: null,
          payroll_cao_key: null,
          contract_id: null,
          contract_candidate_ids: [],
          selected_contract: null,
          cao_key: null,
          cao_configuration_id: null,
          service_context: {
            ...readyServiceContext,
            company_id: "selling-company-a",
            selling_company_id: "selling-company-a",
            cao_key: "cao_evenementen_horecabeveiliging",
          },
          blocking_reasons: ["Geen actief arbeidscontract dekt deze taaksoort."],
        },
      };
    };

    const response = await handler(request({
      company_id: "selling-company-a",
      cao_key: "cao_evenementen_horecabeveiliging",
      service_context: {
        ...readyServiceContext,
        company_id: "selling-company-a",
        selling_company_id: "selling-company-a",
        cao_key: "cao_evenementen_horecabeveiliging",
      },
    }));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result).toMatchObject({
      decision_status: "blocked",
      planning_assignment_allowed: false,
      draft_assignment_allowed: true,
      employment_routing_status: "missing_contract",
      contract_id: null,
      employing_company_id: null,
      payroll_cao_key: null,
      cao_key: "cao_evenementen_horecabeveiliging",
    });
  });

  it("laat een contextblokkade niet meelopen met de ontbrekende-contractuitzondering", async () => {
    globalThis.__caoDecisionBase44.asServiceRole.functions.invoke = async (name) => {
      calls.push(name);
      if (name !== "resolvePersonnelContractForService") {
        throw new Error(`Onverwachte functiecall: ${name}`);
      }
      return {
        data: {
          ...contractResolution(),
          success: false,
          status: "blocked",
          planning_allowed: false,
          payroll_final_allowed: false,
          manual_review_required: true,
          employment_routing_status: "missing_contract",
          company_id: null,
          employing_company_id: null,
          payroll_cao_key: null,
          contract_id: null,
          contract_candidate_ids: [],
          selected_contract: null,
          cao_key: null,
          cao_configuration_id: null,
          blocking_reasons: ["Dienst mist een canonieke task_type_key."],
          service_context_readiness: {
            ...readyServiceContextValidation.service_context_readiness,
            status: "blocked",
            ready: false,
            blocking_reasons: ["Dienst mist een canonieke task_type_key."],
          },
        },
      };
    };

    const response = await handler(request());
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.draft_assignment_allowed).toBe(false);
    expect(result.blocking_reasons).toContain("Dienst mist een canonieke task_type_key.");
  });

  it("laat een kwalificatieblokkade niet meelopen met een ontbrekende arbeidsroute", async () => {
    globalThis.__caoDecisionBase44.asServiceRole.functions.invoke = async (name) => {
      calls.push(name);
      if (name !== "resolvePersonnelContractForService") {
        throw new Error(`Onverwachte functiecall: ${name}`);
      }
      return {
        data: {
          ...contractResolution(),
          success: false,
          status: "blocked",
          planning_allowed: false,
          payroll_final_allowed: false,
          manual_review_required: true,
          employment_routing_status: "missing_contract",
          company_id: null,
          employing_company_id: null,
          payroll_cao_key: null,
          contract_id: null,
          contract_candidate_ids: [],
          selected_contract: null,
          cao_key: null,
          cao_configuration_id: null,
          blocking_reasons: ["Vereist kwalificatiebewijs ontbreekt."],
          qualification_check: {
            status: "blocked",
            matched: false,
            blocking_reasons: ["Vereist kwalificatiebewijs ontbreekt."],
          },
        },
      };
    };

    const response = await handler(request());
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.draft_assignment_allowed).toBe(false);
    expect(result.blocking_reasons).toContain("Vereist kwalificatiebewijs ontbreekt.");
  });

  it("accepteert aantoonbaar geslaagde vereiste WPBR-controle bij de route-uitzondering", async () => {
    globalThis.__caoDecisionBase44.asServiceRole.functions.invoke = async (name) => {
      calls.push(name);
      if (name !== "resolvePersonnelContractForService") {
        throw new Error(`Onverwachte functiecall: ${name}`);
      }
      return {
        data: {
          ...contractResolution(),
          success: false,
          status: "blocked",
          planning_allowed: false,
          payroll_final_allowed: false,
          manual_review_required: true,
          employment_routing_status: "ambiguous",
          company_id: null,
          employing_company_id: null,
          payroll_cao_key: null,
          contract_id: null,
          contract_candidate_ids: ["contract-1", "contract-2"],
          selected_contract: null,
          cao_key: null,
          cao_configuration_id: null,
          blocking_reasons: ["Meerdere arbeidscontracten dekken deze dienst."],
          wpbr_permission_check: {
            required: true,
            status: "compliant",
            planning_allowed: true,
            blocking_reasons: [],
            manual_review_reasons: [],
          },
        },
      };
    };

    const response = await handler(request());
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result).toMatchObject({
      decision_status: "blocked",
      planning_assignment_allowed: false,
      draft_assignment_allowed: true,
      employment_routing_status: "ambiguous",
    });
  });

  it("laat een roosterblokkade ook niet als conceptuitzondering passeren", async () => {
    const response = await handler(request({
      require_schedule_validation: true,
      schedule_validation: {
        status: "blocked",
        calculation_status: "blocked",
        planning_allowed: false,
        payroll_final_allowed: false,
        blocking_reasons: ["Dubbele boeking in de loonperiode."],
        manual_review_reasons: [],
        warnings: [],
      },
    }));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result).toMatchObject({
      decision_status: "blocked",
      planning_assignment_allowed: false,
      draft_assignment_allowed: false,
    });
    expect(result.blocking_reasons).toContain("Dubbele boeking in de loonperiode.");
  });

  it("behoudt de expliciete persist-call voor opgeslagen taakcontext", async () => {
    const response = await handler(request({ save_task_planning_context: true }));

    expect(response.status).toBe(200);
    expect(calls).toEqual([
      "validateTaskPlanningContext",
      "resolvePersonnelContractForService",
      "resolveCaoRuntimeReadiness",
    ]);
  });

  it("behoudt zonder expliciete fast-path de volledige publieke runtime-response", async () => {
    const response = await handler(request({ planning_interactive_fast_path: undefined }));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(calls).toEqual([
      "validateTaskPlanningContext",
      "resolvePersonnelContractForService",
      "resolveCaoRuntimeReadiness",
    ]);
    expect(result.cao_runtime_readiness).toMatchObject({
      known_cao: true,
      label: "CAO Particuliere Beveiliging",
      local_runtime_stage: "implemented_verified_foundation",
      source_monitoring_status: "required",
      source_monitoring_summary: { family_count: 1 },
    });
  });

  it("valt bij een oudere contractresolver fail-safe terug op contextvalidatie", async () => {
    globalThis.__caoDecisionBase44.asServiceRole.functions.invoke = async (name) => {
      calls.push(name);
      if (name === "resolvePersonnelContractForService") {
        return { data: contractResolution({ includeReadiness: false }) };
      }
      if (name === "validateTaskPlanningContext") {
        return { data: readyServiceContextValidation };
      }
      throw new Error(`Onverwachte functiecall: ${name}`);
    };

    const response = await handler(request());
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.planning_assignment_allowed).toBe(true);
    expect(calls).toEqual([
      "resolvePersonnelContractForService",
      "validateTaskPlanningContext",
    ]);
  });

  it("blijft bij een niet-ondersteunde CAO fail-closed zonder extra runtimecall", async () => {
    globalThis.__caoDecisionBase44.asServiceRole.functions.invoke = async (name) => {
      calls.push(name);
      if (name !== "resolvePersonnelContractForService") {
        throw new Error(`Onverwachte functiecall: ${name}`);
      }
      return {
        data: {
          ...contractResolution(),
          cao_key: "cao_onbekend",
          payroll_cao_key: "cao_onbekend",
          selected_contract: {
            ...contractResolution().selected_contract,
            cao_key: "cao_onbekend",
          },
          service_context: {
            ...readyServiceContext,
            cao_key: "cao_onbekend",
          },
        },
      };
    };

    const response = await handler(request({
      cao_key: "cao_onbekend",
      service_context: { ...readyServiceContext, cao_key: "cao_onbekend" },
    }));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result).toMatchObject({
      decision_status: "blocked",
      planning_assignment_allowed: false,
      draft_assignment_allowed: false,
      employment_routing_status: "resolved",
      contract_id: "contract-1",
      employing_company_id: "company-1",
      payroll_cao_key: "cao_onbekend",
      cao_key: "cao_onbekend",
      cao_runtime_status: "blocked_unknown_cao_key",
      planning_context_status: "manual_review_required",
    });
    expect(result.manual_review_reasons).toContain(
      "Arbeidscontract gebruikt cao_onbekend; automatische planning/payroll-runtime is hiervoor nog niet lokaal geverifieerd.",
    );
    expect(calls).toEqual(["resolvePersonnelContractForService"]);
  });

  it("onderscheidt een bekende maar nog niet ondersteunde beveiligings-CAO", async () => {
    const caoKey = "cao_evenementen_horecabeveiliging";
    globalThis.__caoDecisionBase44.asServiceRole.functions.invoke = async (name) => {
      calls.push(name);
      if (name !== "resolvePersonnelContractForService") {
        throw new Error(`Onverwachte functiecall: ${name}`);
      }
      return {
        data: {
          ...contractResolution(),
          cao_key: caoKey,
          payroll_cao_key: caoKey,
          selected_contract: { ...contractResolution().selected_contract, cao_key: caoKey },
          service_context: { ...readyServiceContext, cao_key: caoKey },
        },
      };
    };

    const response = await handler(request({
      cao_key: caoKey,
      service_context: { ...readyServiceContext, cao_key: caoKey },
    }));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result).toMatchObject({
      decision_status: "blocked",
      planning_assignment_allowed: false,
      draft_assignment_allowed: false,
      employment_routing_status: "resolved",
      contract_id: "contract-1",
      employing_company_id: "company-1",
      payroll_cao_key: caoKey,
      cao_key: caoKey,
      cao_runtime_status: "known_cao_runtime_not_implemented",
      planning_context_status: "manual_review_required",
    });
    expect(calls).toEqual(["resolvePersonnelContractForService"]);
  });
});
