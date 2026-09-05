import fs from "node:fs";
import path from "node:path";
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from "node:util";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = fs.readFileSync(
  path.join(root, "base44/functions/managePersonnelContract/entry.ts"),
  "utf8",
);
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

function committedContract(overrides = {}) {
  return {
    id: "contract-existing",
    company_id: "company-b",
    contract_start_date: "2026-01-01",
    contract_end_date: "2026-12-31",
    document_status: "active",
    allowed_task_types: ["reception"],
    allowed_function_types: ["objectbeveiliger"],
    ...overrides,
  };
}

describe("unieke arbeidsroute per taaksoort", () => {
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
    expect(backend.canonicalTaskTypeKey("vrije niet-gecatalogiseerde dienst")).toBe("");
    expect(backend.canonicalTaskTypeKey("other:vrije tekst")).toBe("");
    expect(backend.canonicalTaskTypeKey("other:<script>")).toBe("");
  });

  it("vereist minimaal één concrete taaksoort voordat een contract definitief kan worden", () => {
    expect(backend.requiredContext({
      personnel_id: "person-1",
      company_id: "company-a",
      cao_key: "cao_particuliere_beveiliging",
      contract_start_date: "2026-01-01",
      duration_type: "indefinite",
      contract_form: "onbepaalde_tijd",
      function_type: "objectbeveiliger",
      probation_agreed: false,
      allowed_task_types: [],
    })).toContain("allowed_task_types");
  });

  it("blokkeert dezelfde taaksoort bij twee werkgevers in een overlappende periode", () => {
    const result = backend.evaluateFunctionConflicts(
      committedContract({ id: "contract-new", company_id: "company-a" }),
      [committedContract()],
      new Map(),
    );

    expect(result.status).toBe("blocked");
    expect(result.conflicts).toEqual([
      expect.objectContaining({
        type: "duplicate_task_type_across_companies",
        duplicate_task_type_keys: ["reception"],
      }),
    ]);
  });

  it("staat dezelfde functie bij verschillende werkgevers toe als de taaksoorten uniek zijn", () => {
    const result = backend.evaluateFunctionConflicts(
      committedContract({
        id: "contract-new",
        company_id: "company-a",
        allowed_task_types: ["fire_closing_round"],
      }),
      [committedContract()],
      new Map(),
    );

    expect(result.status).toBe("unique");
    expect(result.conflicts).toEqual([]);
  });

  it("normaliseert bekende Nederlandse taaklabels naar dezelfde routesleutel", () => {
    expect(backend.contractTaskTypeKeys({
      allowed_task_types: ["Receptiedienst", "reception", "Brand- en sluitronde", "oude vrije dienstcode"],
    })).toEqual(["reception", "fire_closing_round"]);
  });
});
