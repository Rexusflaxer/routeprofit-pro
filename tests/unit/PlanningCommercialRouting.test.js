import fs from "node:fs";
import path from "node:path";
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from "node:util";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = fs.readFileSync(path.join(root, "base44/functions/planningApi/entry.ts"), "utf8");
let resolveCommercialPlanningRoute;
let commercialRoutingEvidenceStatus;
let commercialRoutingServiceContext;

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
  const backend = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString("base64")}`);
  resolveCommercialPlanningRoute = backend.resolveCommercialPlanningRoute;
  commercialRoutingEvidenceStatus = backend.commercialRoutingEvidenceStatus;
  commercialRoutingServiceContext = backend.commercialRoutingServiceContext;
});

function occurrence(overrides = {}) {
  return {
    customer_id: "customer-1",
    object_id: "object-1",
    task_type: "reception",
    task_type_key: "reception",
    service_date: "2026-09-05",
    ...overrides,
  };
}

function contract(overrides = {}) {
  return {
    id: "contract-a",
    version: 3,
    company_id: "company-a",
    customer_id: "customer-1",
    customer_account_id: "account-a",
    status: "active",
    start_date: "2026-01-01",
    end_date: null,
    ...overrides,
  };
}

function line(overrides = {}) {
  return {
    id: "line-a",
    version: 4,
    contract_id: "contract-a",
    company_id: "company-a",
    customer_id: "customer-1",
    customer_account_id: "account-a",
    task_type_key: "reception",
    scope_type: "object",
    object_id: "object-1",
    status: "active",
    valid_from: "2026-01-01",
    valid_until: null,
    ...overrides,
  };
}

describe("commercial planning routing", () => {
  it("markeert legacy IDs zonder actuele resolver-snapshot nooit als resolved", () => {
    const idsOnly = {
      selling_company_id: "company-a",
      customer_contract_id: "contract-a",
      customer_contract_line_id: "line-a",
      commercial_routing_status: "resolved",
      commercial_routing_snapshot: null,
    };
    const currentEvidence = {
      ...idsOnly,
      commercial_routing_snapshot: {
        schema_version: 1,
        status: "resolved",
        customer_billable: true,
      },
    };

    expect(commercialRoutingEvidenceStatus(idsOnly)).toBe("stale");
    expect(commercialRoutingEvidenceStatus(currentEvidence)).toBe("resolved");
    expect(commercialRoutingServiceContext([currentEvidence, idsOnly])).toEqual({
      commercial_routing_status: "manual_review_required",
      commercial_routing_statuses: ["resolved", "stale"],
      customer_billable: null,
    });
  });

  it("leidt contractregel, contract en verkopende BV af uit exact één objectspecifieke match", () => {
    const result = resolveCommercialPlanningRoute(
      occurrence(),
      [contract(), contract({
        id: "contract-b",
        company_id: "company-b",
        customer_account_id: "account-b",
      })],
      [line(), line({
        id: "line-b",
        contract_id: "contract-b",
        company_id: "company-b",
        customer_account_id: "account-b",
        task_type_key: "fire_closing_round",
      })],
    );

    expect(result).toMatchObject({
      commercial_routing_status: "resolved",
      selling_company_id: "company-a",
      customer_contract_id: "contract-a",
      customer_contract_line_id: "line-a",
      commercial_routing_snapshot: {
        customer_id: "customer-1",
        object_id: "object-1",
        task_type_key: "reception",
        service_date: "2026-09-05",
        customer_contract_version: 3,
        customer_contract_line_version: 4,
      },
    });
  });

  it("laat een ontbrekende route als zichtbare conceptstatus bestaan", () => {
    const result = resolveCommercialPlanningRoute(occurrence(), [contract()], []);

    expect(result).toMatchObject({
      commercial_routing_status: "missing_contract",
      selling_company_id: null,
      customer_contract_id: null,
      customer_contract_line_id: null,
      commercial_routing_snapshot: {
        reason: "no_matching_customer_contract_line",
        candidate_count: 0,
      },
    });
  });

  it("faalt gesloten wanneer twee bedrijven dezelfde klant-object-taak-datum dekken", () => {
    const result = resolveCommercialPlanningRoute(
      occurrence(),
      [contract(), contract({
        id: "contract-b",
        company_id: "company-b",
        customer_account_id: "account-b",
      })],
      [line(), line({
        id: "line-b",
        contract_id: "contract-b",
        company_id: "company-b",
        customer_account_id: "account-b",
      })],
    );

    expect(result).toMatchObject({
      commercial_routing_status: "ambiguous",
      selling_company_id: null,
      customer_contract_id: null,
      customer_contract_line_id: null,
      commercial_routing_snapshot: {
        reason: "multiple_matching_customer_contract_lines",
        candidate_count: 2,
      },
    });
    expect(result.commercial_routing_snapshot.candidates.map(item => item.customer_contract_line_id))
      .toEqual(["line-a", "line-b"]);
  });

  it("gebruikt inclusieve contract- en regeldata en negeert regels buiten object of datum", () => {
    const result = resolveCommercialPlanningRoute(
      occurrence({ service_date: "2026-09-05" }),
      [contract({ start_date: "2026-09-05", end_date: "2026-09-05" })],
      [
        line({ valid_from: "2026-09-05", valid_until: "2026-09-05" }),
        line({ id: "wrong-object", object_id: "object-2" }),
        line({ id: "expired", valid_until: "2026-09-04" }),
      ],
    );

    expect(result.commercial_routing_status).toBe("resolved");
    expect(result.customer_contract_line_id).toBe("line-a");
  });

  it("vereist dekking van de volledige occurrence tot en met end_date", () => {
    const result = resolveCommercialPlanningRoute(
      occurrence({ service_date: "2026-09-05", end_date: "2026-09-06" }),
      [contract({ end_date: "2026-09-05" })],
      [line({ valid_until: "2026-09-05" })],
    );

    expect(result.commercial_routing_status).toBe("missing_contract");
    expect(result.commercial_routing_snapshot).toMatchObject({
      service_date: "2026-09-05",
      end_date: "2026-09-06",
    });
  });

  it("behandelt een ontbrekende taaksoortsleutel niet als wildcard en ondersteunt klantbrede scope", () => {
    const missingKey = resolveCommercialPlanningRoute(
      occurrence(),
      [contract()],
      [line({ task_type_key: null })],
    );
    const customerWide = resolveCommercialPlanningRoute(
      occurrence(),
      [contract()],
      [line({ scope_type: "customer", object_id: null })],
    );

    expect(missingKey.commercial_routing_status).toBe("missing_contract");
    expect(customerWide.commercial_routing_status).toBe("resolved");
  });

  it("routeert een collectief alleen wanneer het object aantoonbaar lid is", () => {
    const collectiveLine = line({
      scope_type: "collective",
      object_id: null,
      collective_id: "collective-1",
    });
    const matching = resolveCommercialPlanningRoute(
      occurrence(),
      [contract()],
      [collectiveLine],
      [{ id: "collective-1", customer_id: "customer-1", object_ids: ["object-1"] }],
    );
    const outside = resolveCommercialPlanningRoute(
      occurrence(),
      [contract()],
      [collectiveLine],
      [{ id: "collective-1", customer_id: "customer-1", object_ids: ["object-2"] }],
    );

    expect(matching.commercial_routing_status).toBe("resolved");
    expect(outside.commercial_routing_status).toBe("missing_contract");
  });

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
  ])("routeert het bekende legacy service_code-label %s als %s", (serviceCode, taskTypeKey) => {
    const legacy = resolveCommercialPlanningRoute(
      occurrence({ task_type: taskTypeKey, task_type_key: taskTypeKey }),
      [contract()],
      [line({ task_type_key: null, service_code: serviceCode })],
    );

    expect(legacy.commercial_routing_status).toBe("resolved");
  });

  it("behandelt een willekeurige service_code nooit als planningstaak-wildcard", () => {
    const arbitrarySku = resolveCommercialPlanningRoute(
      occurrence(),
      [contract()],
      [line({ task_type_key: null, service_code: "KLANT-SKU-42" })],
    );

    expect(arbitrarySku.commercial_routing_status).toBe("missing_contract");
  });

  it("routeert een specifieke maatwerktaak maar niet de algemene waarde other", () => {
    const custom = resolveCommercialPlanningRoute(
      occurrence({ task_type: "other", task_type_key: "other:definition-1" }),
      [contract()],
      [line({ task_type_key: "other:definition-1" })],
    );
    const generic = resolveCommercialPlanningRoute(
      occurrence({ task_type: "other", task_type_key: "other" }),
      [contract()],
      [line({ task_type_key: "other" })],
    );

    expect(custom.commercial_routing_status).toBe("resolved");
    expect(generic.commercial_routing_status).toBe("manual_review_required");
  });

  it("houdt onbekende expliciete taaksoortsleutels fail-closed", () => {
    const invalidOccurrence = resolveCommercialPlanningRoute(
      occurrence({ task_type: "other", task_type_key: "vrije niet-gecatalogiseerde dienst" }),
      [contract()],
      [line({ task_type_key: "vrije niet-gecatalogiseerde dienst" })],
    );
    const invalidLine = resolveCommercialPlanningRoute(
      occurrence(),
      [contract()],
      [line({ task_type_key: "vrije niet-gecatalogiseerde dienst" })],
    );

    expect(invalidOccurrence).toMatchObject({
      commercial_routing_status: "manual_review_required",
      commercial_routing_snapshot: { reason: "invalid_commercial_route_context" },
    });
    expect(invalidLine.commercial_routing_status).toBe("missing_contract");
  });

  it("markeert tegenstrijdige contractregel-denormalisatie voor handmatige controle", () => {
    const result = resolveCommercialPlanningRoute(
      occurrence(),
      [contract()],
      [line({ company_id: "company-b" })],
    );

    expect(result).toMatchObject({
      commercial_routing_status: "manual_review_required",
      selling_company_id: null,
      commercial_routing_snapshot: {
        reason: "commercial_route_data_mismatch",
        candidate_count: 1,
      },
    });
  });
});
