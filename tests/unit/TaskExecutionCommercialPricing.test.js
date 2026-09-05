import fs from "node:fs";
import path from "node:path";
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from "node:util";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it, vi } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const resolvers = [];
const backendModules = new Map();

async function loadResolver(relativePath) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  const { transform } = await import("esbuild");
  const compiled = await transform(source.replace(
    /^import \{ createClientFromRequest \} from 'npm:@base44\/sdk@[^']+';$/m,
    "const createClientFromRequest = () => ({});",
  ), { format: "esm", loader: "ts", target: "es2022" });
  return import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString("base64")}`);
}

beforeAll(async () => {
  globalThis.TextEncoder = NodeTextEncoder;
  globalThis.TextDecoder = NodeTextDecoder;
  globalThis.Uint8Array = new NodeTextEncoder().encode("").constructor;
  const [customerPlatform, automation] = await Promise.all([
    loadResolver("base44/functions/customerPlatformApi/entry.ts"),
    loadResolver("base44/functions/commercialAutomation/entry.ts"),
  ]);
  resolvers.push(
    ["customerPlatformApi", customerPlatform.findExecutionPricing],
    ["commercialAutomation", automation.findExecutionPricing],
  );
  backendModules.set("customerPlatformApi", customerPlatform);
  backendModules.set("commercialAutomation", automation);
});

function execution(overrides = {}) {
  return {
    id: "execution-1",
    route_execution_id: "route-execution-1",
    original_task_id: "task-1",
    object_id: "object-1",
    task_type: "Receptiedienst",
    task_type_key: "reception",
    status: "completed",
    customer_billable: true,
    financial_review_status: "approved",
    customer_id: "customer-1",
    selling_company_id: "company-a",
    customer_account_id: "account-1",
    ...overrides,
  };
}

function contract(overrides = {}) {
  return {
    id: "contract-reception",
    company_id: "company-a",
    customer_id: "customer-1",
    customer_account_id: "account-1",
    status: "active",
    start_date: "2026-01-01",
    end_date: "2026-12-31",
    currency: "EUR",
    ...overrides,
  };
}

function line(overrides = {}) {
  return {
    id: "line-reception",
    contract_id: "contract-reception",
    company_id: "company-a",
    customer_id: "customer-1",
    customer_account_id: "account-1",
    task_type_key: "reception",
    service_code: null,
    scope_type: "object",
    object_id: "object-1",
    collective_id: null,
    billing_model: "per_hour",
    status: "active",
    valid_from: "2026-01-01",
    valid_until: "2026-12-31",
    ...overrides,
  };
}

function rate(overrides = {}) {
  return {
    id: "rate-1",
    contract_id: "contract-reception",
    contract_line_id: "line-reception",
    company_id: "company-a",
    customer_id: "customer-1",
    customer_account_id: "account-1",
    unit: "hour",
    amount_cents: 3500,
    currency: "EUR",
    status: "active",
    valid_from: "2026-01-01",
    valid_until: "2026-12-31",
    ...overrides,
  };
}

function frozenCommercialSnapshot(overrides = {}) {
  return {
    schema_version: 1,
    status: "resolved",
    task_type_key: "reception",
    customer_id: "customer-1",
    customer_account_id: "account-1",
    selling_company_id: "company-a",
    customer_contract_id: "contract-reception",
    customer_contract_line_id: "line-reception",
    object_id: "object-1",
    service_date: "2026-09-05",
    customer_billable: true,
    customer_contract_version: 1,
    customer_contract_line_version: 1,
    ...overrides,
  };
}

function matches(record, query) {
  return Object.entries(query || {}).every(([field, expected]) => {
    if (expected && typeof expected === "object" && "$in" in expected) {
      return expected.$in.includes(record[field]);
    }
    return record[field] === expected;
  });
}

function base44With(overrides = {}) {
  const records = {
    RouteExecution: [{ id: "route-execution-1", service_date: "2026-09-05" }],
    Task: [{ id: "task-1", task_type: "Receptiedienst", task_type_key: "reception", object_id: "object-1" }],
    SurveillanceObject: [{ id: "object-1", customer_id: "customer-1" }],
    CustomerAccount: [{ id: "account-1", customer_id: "customer-1", company_id: "company-a", status: "active", finance_hold: false, currency: "EUR" }],
    CustomerContract: [contract()],
    CustomerContractLine: [line()],
    CustomerContractRate: [rate()],
    Collectief: [],
    ...overrides,
  };
  const entities = Object.fromEntries(Object.entries(records).map(([name, items]) => [name, {
    get: vi.fn(async id => items.find(item => String(item.id) === String(id)) || null),
    filter: vi.fn(async query => items.filter(item => matches(item, query))),
  }]));
  return { base44: { asServiceRole: { entities } }, entities };
}

describe.each([
  ["customerPlatformApi", () => resolvers.find(([name]) => name === "customerPlatformApi")[1]],
  ["commercialAutomation", () => resolvers.find(([name]) => name === "commercialAutomation")[1]],
])("%s TaskExecution-prijsroutering", (_name, resolverFactory) => {
  it("kiest eerst de canonieke taakregel en accepteert meerdere taakgescheiden hoofdcontracten", async () => {
    const receptionContract = contract();
    const roundContract = contract({ id: "contract-round" });
    const receptionLine = line();
    const roundLine = line({
      id: "line-round",
      contract_id: "contract-round",
      task_type_key: "fire_closing_round",
    });
    const { base44, entities } = base44With({
      CustomerContract: [receptionContract, roundContract],
      CustomerContractLine: [receptionLine, roundLine],
    });

    const result = await resolverFactory()(base44, execution({
      selling_company_id: null,
      customer_account_id: null,
    }));

    expect(result.blocked).toBeNull();
    expect(result.context).toMatchObject({
      task_type_key: "reception",
      company_id: "company-a",
      customer_account_id: "account-1",
      contract: { id: "contract-reception" },
      line: { id: "line-reception" },
      rate: { id: "rate-1" },
    });
    expect(entities.CustomerContract.get).toHaveBeenCalledWith("contract-reception");
    expect(entities.CustomerContract.filter).not.toHaveBeenCalled();
  });

  it.each(["ended", "superseded"])(
    "behoudt een volledig bevroren historische route wanneer het hoofdcontract later %s is",
    async status => {
      const historicalContract = contract({ status, version: 2 });
      const historicalLine = line({ status: "ended", version: 2 });
      const historicalRate = rate({ status: "ended", version: 2 });
      const { base44 } = base44With({
        CustomerContract: [historicalContract],
        CustomerContractLine: [historicalLine],
        CustomerContractRate: [historicalRate],
      });
      const frozenExecution = execution({
        commercial_routing_status: "resolved",
        customer_contract_id: historicalContract.id,
        customer_contract_line_id: historicalLine.id,
        customer_contract_rate_id: historicalRate.id,
        commercial_routing_snapshot: frozenCommercialSnapshot(),
      });

      const result = await resolverFactory()(base44, frozenExecution);

      expect(result.blocked).toBeNull();
      expect(result.context.contract.status).toBe(status);
      expect(result.context.line.status).toBe("ended");
    },
  );

  it("faalt gesloten bij meervoudige taakregel of een expliciete contractmismatch", async () => {
    const secondLine = line({ id: "line-reception-2", contract_id: "contract-reception-2" });
    const { base44 } = base44With({
      CustomerContract: [contract(), contract({ id: "contract-reception-2" })],
      CustomerContractLine: [line(), secondLine],
    });
    const ambiguous = await resolverFactory()(base44, execution());
    expect(ambiguous.blocked?.[0]).toBe("overlapping_contract_line");

    const mismatch = await resolverFactory()(base44, execution({
      commercial_routing_status: "resolved",
      customer_contract_id: "contract-other",
      customer_contract_line_id: "line-reception",
      commercial_routing_snapshot: frozenCommercialSnapshot({ customer_contract_id: "contract-other" }),
    }));
    expect(mismatch.blocked?.[0]).toBe("contract_line_mismatch");
  });

  it("gebruikt alleen veilige legacy-aliases, inclusief Portier / concierge", async () => {
    const conciergeContract = contract({ id: "contract-concierge" });
    const conciergeLine = line({
      id: "line-concierge",
      contract_id: "contract-concierge",
      task_type_key: null,
      service_code: "Portier / concierge",
    });
    const conciergeRate = rate({
      id: "rate-concierge",
      contract_id: "contract-concierge",
      contract_line_id: "line-concierge",
    });
    const { base44 } = base44With({
      Task: [{ id: "task-1", task_type: "Portier / concierge", object_id: "object-1" }],
      CustomerContract: [conciergeContract],
      CustomerContractLine: [conciergeLine],
      CustomerContractRate: [conciergeRate],
    });

    const valid = await resolverFactory()(base44, execution({ task_type: "Portier / concierge", task_type_key: null }));
    expect(valid.blocked).toBeNull();
    expect(valid.context.task_type_key).toBe("concierge");

    const invalid = await resolverFactory()(base44, execution({ task_type: "KLANT-SKU-42", task_type_key: null }));
    expect(invalid.blocked?.[0]).toBe("invalid_task_type_key");
  });

  it.each([
    ["Objectbeveiliging", "object_security"],
    ["Brand- en sluitronde", "fire_closing_round"],
    ["Brand sluitronde", "fire_closing_round"],
    ["Externe sluitronde", "external_closing_round"],
    ["Externe controleronde", "external_control_round"],
    ["Openingsronde", "opening_round"],
    ["Mobiele controleronde", "mobile_control_round"],
    ["Receptie", "reception"],
    ["Receptiedienst", "reception"],
    ["Sluitbegeleiding", "closing_assistance"],
    ["Toegangscontrole", "access_control"],
    ["Brandwacht", "fire_watch"],
    ["Portier", "concierge"],
    ["Portier / concierge", "concierge"],
    ["Concierge", "concierge"],
  ])("houdt de veilige commerciële legacytabel gelijk voor %s", (legacy, expected) => {
    const backend = resolvers.find(([name]) => name === _name)[1];
    const moduleRecord = backendModules.get(_name);
    expect(moduleRecord.canonicalContractLineTaskTypeKey({ task_type_key: null, service_code: legacy })).toBe(expected);
    expect(backend).toBeTypeOf("function");
  });

  it("weigert onbekende expliciete sleutels en tegenstrijdige denormalisatie", async () => {
    const { base44 } = base44With();
    const invalidKey = await resolverFactory()(base44, execution({ task_type_key: "customer_free_text" }));
    expect(invalidKey.blocked?.[0]).toBe("invalid_task_type_key");

    const mismatchLine = line({ company_id: "company-b" });
    const { base44: mismatchedBase44 } = base44With({ CustomerContractLine: [mismatchLine] });
    const mismatch = await resolverFactory()(mismatchedBase44, execution({
      commercial_routing_status: "resolved",
      customer_contract_id: "contract-reception",
      customer_contract_line_id: "line-reception",
      commercial_routing_snapshot: frozenCommercialSnapshot(),
    }));
    expect(mismatch.blocked?.[0]).toBe("contract_line_context_mismatch");

    const wrongSeller = await resolverFactory()(base44, execution({ selling_company_id: "company-b" }));
    expect(wrongSeller.blocked?.[0]).toBe("contract_line_context_mismatch");
  });

  it("laat een ongerelateerde onveilige SKU-regel nooit als wildcard matchen", async () => {
    const unsafeUnrelatedLine = line({
      id: "line-unsafe-sku",
      contract_id: "contract-unsafe",
      task_type_key: null,
      service_code: "KLANT-SKU-42",
    });
    const { base44 } = base44With({
      CustomerContract: [contract(), contract({ id: "contract-unsafe" })],
      CustomerContractLine: [unsafeUnrelatedLine, line()],
    });
    const result = await resolverFactory()(base44, execution({
      selling_company_id: null,
      customer_account_id: null,
    }));
    expect(result.blocked).toBeNull();
    expect(result.context.line.id).toBe("line-reception");
  });

  it("blokkeert een stale of onbewezen resolved uitvoeringsroute vóór prijsroutering", async () => {
    const { base44 } = base44With();
    const stale = await resolverFactory()(base44, execution({
      commercial_routing_status: "stale",
      commercial_routing_snapshot: { schema_version: 1, status: "stale" },
    }));
    expect(stale.blocked?.[0]).toBe("commercial_route_not_resolved");

    const unproven = await resolverFactory()(base44, execution({
      commercial_routing_status: "resolved",
      customer_contract_id: "contract-reception",
      customer_contract_line_id: "line-reception",
    }));
    expect(unproven.blocked?.[0]).toBe("commercial_route_snapshot_invalid");
  });

  it("accepteert beëindigde tarieven alleen via een volledig bevroren route", async () => {
    const { base44 } = base44With({ CustomerContractRate: [rate({ status: "ended" })] });
    const dynamic = await resolverFactory()(base44, execution());
    expect(dynamic.blocked?.[0]).toBe("missing_rate");

    const frozen = await resolverFactory()(base44, execution({
      commercial_routing_status: "resolved",
      customer_contract_id: "contract-reception",
      customer_contract_line_id: "line-reception",
      customer_contract_rate_id: "rate-1",
      commercial_routing_snapshot: frozenCommercialSnapshot(),
    }));
    expect(frozen.blocked).toBeNull();
  });
});
