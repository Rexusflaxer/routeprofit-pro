import fs from "node:fs";
import path from "node:path";
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from "node:util";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = fs.readFileSync(
  path.join(root, "base44/functions/applyCaoContractRules/entry.ts"),
  "utf8",
);
let backend;

beforeAll(async () => {
  globalThis.TextEncoder = NodeTextEncoder;
  globalThis.TextDecoder = NodeTextDecoder;
  globalThis.Uint8Array = new NodeTextEncoder().encode("").constructor;
  const body = source
    .replace(/^import \{ createClientFromRequest \} from 'npm:@base44\/sdk@[^']+';$/m, "")
    .split("\nDeno.serve")[0]
    .concat("\nexport { canonicalContractTaskTypeKey, collectContractTaskScopeTokens, evaluateDuplicateFunctionScope };\n");
  const { transform } = await import("esbuild");
  const compiled = await transform(body, { format: "esm", loader: "ts", target: "es2022" });
  backend = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString("base64")}`);
});

function contract(overrides = {}) {
  return {
    id: "other-contract",
    personnel_id: "personnel-1",
    company_id: "company-b",
    contract_start_date: "2026-01-01",
    contract_end_date: "2026-12-31",
    is_current: true,
    allowed_function_types: ["objectbeveiliger"],
    allowed_task_types: ["reception"],
    ...overrides,
  };
}

function base44WithContracts(contracts) {
  return {
    asServiceRole: {
      entities: {
        PersonnelContract: {
          filter: async () => contracts,
        },
      },
    },
  };
}

async function evaluate(candidate, others) {
  return backend.evaluateDuplicateFunctionScope(base44WithContracts(others), {
    personnelId: "personnel-1",
    currentContractId: "candidate",
    contractStartDate: "2026-01-01",
    contractEndDate: "2026-12-31",
    contractScope: contract({ id: "candidate", company_id: "company-a", ...candidate }),
  });
}

describe("CAO-contractregels volgen de taaksoort-routering", () => {
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
    expect(backend.canonicalContractTaskTypeKey(label)).toBe(expected);
  });

  it("houdt onbekende taaklabels fail-closed", () => {
    expect(backend.canonicalContractTaskTypeKey("vrije niet-gecatalogiseerde dienst")).toBeNull();
    expect(backend.canonicalContractTaskTypeKey("other:vrije tekst")).toBeNull();
    expect(backend.canonicalContractTaskTypeKey("other:<script>")).toBeNull();
  });

  it("staat dezelfde functie bij twee werkgevers toe wanneer de taaksoorten verschillen", async () => {
    const result = await evaluate(
      { allowed_task_types: ["fire_closing_round"] },
      [contract({ allowed_task_types: ["reception"] })],
    );

    expect(result.status).toBe("unique");
    expect(result.conflicts).toEqual([]);
  });

  it("blokkeert dezelfde taaksoort bij twee werkgevers in een overlappende periode", async () => {
    const result = await evaluate(
      { allowed_task_types: ["reception"] },
      [contract({ allowed_task_types: ["Receptiedienst"] })],
    );

    expect(result.status).toBe("blocked_duplicate_active_task_route");
    expect(result.conflicts).toEqual([
      expect.objectContaining({
        type: "duplicate_task_type_across_companies",
        duplicate_task_type_keys: ["reception"],
      }),
    ]);
  });

  it("houdt twee overlappende contracten bij dezelfde werkgever geblokkeerd", async () => {
    const result = await evaluate(
      { company_id: "company-a", allowed_task_types: ["fire_closing_round"] },
      [contract({ company_id: "company-a", allowed_task_types: ["reception"] })],
    );

    expect(result.status).toBe("blocked_duplicate_active_task_route");
    expect(result.conflicts[0]).toEqual(expect.objectContaining({
      type: "overlapping_contract_same_company",
      same_company: true,
    }));
  });

  it("accepteert alleen canonieke of stabiele maatwerk-taaksleutels", () => {
    expect(backend.collectContractTaskScopeTokens({
      allowed_task_types: ["Receptiedienst", "reception", "other:definition-42", "vrije tekst", "other"],
    })).toEqual(["reception", "other:definition-42"]);
  });
});
