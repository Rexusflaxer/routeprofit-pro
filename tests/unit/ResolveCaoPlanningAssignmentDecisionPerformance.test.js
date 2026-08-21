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
    contract_id: "contract-1",
    selected_contract: {
      id: "contract-1",
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
      contract_id: "contract-1",
      cao_key: "cao_particuliere_beveiliging",
    });
    expect(calls).toEqual(["resolvePersonnelContractForService"]);
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
      cao_key: "cao_onbekend",
      cao_runtime_status: "blocked_unknown_cao_key",
      planning_context_status: "manual_review_required",
    });
    expect(result.manual_review_reasons).toContain(
      "Dienst gebruikt cao_onbekend; automatische planning/payroll-runtime is hiervoor nog niet lokaal geverifieerd.",
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
      cao_key: caoKey,
      cao_runtime_status: "known_cao_runtime_not_implemented",
      planning_context_status: "manual_review_required",
    });
    expect(calls).toEqual(["resolvePersonnelContractForService"]);
  });
});
