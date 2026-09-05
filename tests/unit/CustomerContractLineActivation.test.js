import fs from "node:fs";
import path from "node:path";
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from "node:util";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = fs.readFileSync(path.join(root, "base44/functions/customerPlatformApi/entry.ts"), "utf8");
const collectivePageSource = fs.readFileSync(path.join(root, "src/pages/Collectief.jsx"), "utf8");
let validateActivation;
let validateContractActivation;
let createCollective;
let deleteCollective;
let updateCollective;
let backendModule;

beforeAll(async () => {
  globalThis.TextEncoder = NodeTextEncoder;
  globalThis.TextDecoder = NodeTextDecoder;
  globalThis.Uint8Array = new NodeTextEncoder().encode("").constructor;
  const { transform } = await import("esbuild");
  const compiled = await transform(source.replace(
    /^import \{ createClientFromRequest \} from 'npm:@base44\/sdk@[^']+';$/m,
    "const createClientFromRequest = () => ({});",
  ), { format: "esm", loader: "ts", target: "es2022" });
  backendModule = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString("base64")}`);
  validateActivation = backendModule.validateContractLineActivationUniqueness;
  validateContractActivation = backendModule.validateCustomerContractActivationUniqueness;
  createCollective = backendModule.handleCreateCollective;
  deleteCollective = backendModule.handleDeleteCollective;
  updateCollective = backendModule.handleUpdateCollective;
});

function contract(overrides = {}) {
  return {
    id: "contract-a",
    company_id: "company-a",
    customer_id: "customer-1",
    customer_account_id: "account-1",
    status: "approved",
    start_date: "2026-01-01",
    end_date: "2026-12-31",
    ...overrides,
  };
}

function line(overrides = {}) {
  return {
    id: "line-a",
    contract_id: "contract-a",
    company_id: "company-a",
    customer_id: "customer-1",
    customer_account_id: "account-1",
    task_type_key: "reception",
    service_code: null,
    scope_type: "object",
    object_id: "object-1",
    collective_id: null,
    status: "draft",
    valid_from: null,
    valid_until: null,
    ...overrides,
  };
}

const objects = [
  { id: "object-1", customer_id: "customer-1" },
  { id: "object-2", customer_id: "customer-1" },
];

function matchesFilter(record, filter) {
  return Object.entries(filter || {}).every(([key, expected]) => {
    if (key === "$or") return expected.some(candidate => matchesFilter(record, candidate));
    if (expected && typeof expected === "object" && !Array.isArray(expected)) {
      if (Object.prototype.hasOwnProperty.call(expected, "$exists")) {
        return Object.prototype.hasOwnProperty.call(record, key) === expected.$exists;
      }
      if (Array.isArray(expected.$in)) {
        return Array.isArray(record[key])
          ? record[key].some(value => expected.$in.includes(value))
          : expected.$in.includes(record[key]);
      }
    }
    return record[key] === expected;
  });
}

function entity(initial) {
  const records = structuredClone(initial);
  return {
    records,
    async get(id) {
      const found = records.find(record => record.id === id);
      return found ? structuredClone(found) : null;
    },
    async filter(filter, _sort, limit = 1000) {
      return records
        .filter(record => matchesFilter(record, filter))
        .slice(0, limit)
        .map(record => structuredClone(record));
    },
    async list(_sort, limit = 1000, offset = 0) {
      return records.slice(offset, offset + limit).map(record => structuredClone(record));
    },
    async create(data) {
      const created = { id: data.id || `created-${records.length + 1}`, ...structuredClone(data) };
      records.push(created);
      return structuredClone(created);
    },
    async delete(id) {
      const index = records.findIndex(record => record.id === id);
      if (index >= 0) records.splice(index, 1);
      return { success: index >= 0 };
    },
    async updateMany(filter, update) {
      const matches = records.filter(record => matchesFilter(record, filter));
      for (const record of matches) {
        Object.assign(record, structuredClone(update.$set || {}));
        for (const [key, increment] of Object.entries(update.$inc || {})) {
          record[key] = Number(record[key] || 0) + Number(increment);
        }
      }
      return { success: true, updated: matches.length };
    },
  };
}

function collectiveRoutingBackend() {
  const entities = {
    Customer: entity([
      { id: "customer-1", name: "Klant 1" },
      { id: "customer-2", name: "Klant 2" },
    ]),
    Collectief: entity([{
      id: "collective-1",
      customer_id: "customer-1",
      name: "Collectief Noord",
      collectief_type: "bedrijventerrein",
      object_ids: ["object-1"],
      version: 1,
    }]),
    SurveillanceObject: entity([
      ...objects,
      { id: "object-3", customer_id: "customer-1" },
      { id: "object-foreign", customer_id: "customer-2" },
    ]),
    CustomerContract: entity([
      contract(),
      contract({
        id: "contract-b",
        company_id: "company-b",
        customer_account_id: "account-b",
        status: "active",
      }),
    ]),
    CustomerContractLine: entity([
      line({
        id: "line-collective",
        scope_type: "collective",
        object_id: null,
        collective_id: "collective-1",
        status: "active",
        valid_from: "2026-01-01",
        valid_until: "2026-12-31",
      }),
      line({
        id: "line-object-b",
        contract_id: "contract-b",
        company_id: "company-b",
        customer_account_id: "account-b",
        object_id: "object-2",
        status: "active",
        valid_from: "2026-01-01",
        valid_until: "2026-12-31",
      }),
    ]),
    CustomerQuoteLine: entity([]),
    Task: entity([]),
  };
  return { base44: { asServiceRole: { entities } }, entities };
}

describe("CustomerContractLine activatie-uniciteit", () => {
  it("laat status nooit via het inhoudelijke updatepad wijzigen", () => {
    expect(backendModule.CONTRACT_LINE_PATCH_FIELDS).not.toContain("status");
  });

  it("migreert alleen een bekende legacy dienstcode en bevriest de effectieve periode", () => {
    expect(validateActivation(
      line({ task_type_key: null, service_code: "Receptiedienst" }),
      contract(),
      [],
      [contract()],
      objects,
      [],
    )).toEqual({
      task_type_key: "reception",
      valid_from: "2026-01-01",
      valid_until: "2026-12-31",
    });
  });

  it("canonicaliseert de cataloguswaarde Portier / concierge veilig", () => {
    expect(validateActivation(
      line({ task_type_key: null, service_code: "Portier / concierge" }),
      contract(),
      [],
      [contract()],
      objects,
      [],
    )).toMatchObject({ task_type_key: "concierge" });
  });

  it("blokkeert objectoverlap voor dezelfde taaksoort over contracten en bedrijven", () => {
    const otherContract = contract({ id: "contract-b", company_id: "company-b" });
    const active = line({
      id: "line-b",
      contract_id: "contract-b",
      company_id: "company-b",
      status: "active",
      valid_from: "2026-06-01",
      valid_until: "2026-09-30",
    });

    expect(() => validateActivation(
      line({ valid_from: "2026-09-30" }),
      contract(),
      [active],
      [contract(), otherContract],
      objects,
      [],
    )).toThrowError(expect.objectContaining({
      status: 409,
      details: expect.objectContaining({
        code: "CONTRACT_LINE_ROUTING_OVERLAP",
        conflicting_contract_line_id: "line-b",
        overlapping_object_ids: ["object-1"],
      }),
    }));
  });

  it("expandeert collectiefscope en ziet overlap met een objectspecifieke regel", () => {
    const collectiveLine = line({
      id: "line-collective",
      scope_type: "collective",
      object_id: null,
      collective_id: "collective-1",
      status: "active",
      valid_from: "2026-01-01",
      valid_until: "2026-12-31",
    });

    expect(() => validateActivation(
      line(),
      contract(),
      [collectiveLine],
      [contract()],
      objects,
      [{ id: "collective-1", customer_id: "customer-1", object_ids: ["object-1", "object-2"] }],
    )).toThrowError(expect.objectContaining({
      details: expect.objectContaining({ code: "CONTRACT_LINE_ROUTING_OVERLAP" }),
    }));
  });

  it("expandeert klantbrede scope naar alle concrete klantobjecten", () => {
    expect(() => validateActivation(
      line({ scope_type: "customer", object_id: null }),
      contract(),
      [line({ id: "line-object-2", object_id: "object-2", status: "active" })],
      [contract()],
      objects,
      [],
    )).toThrowError(expect.objectContaining({
      details: expect.objectContaining({
        code: "CONTRACT_LINE_ROUTING_OVERLAP",
        overlapping_object_ids: ["object-2"],
      }),
    }));
  });

  it("staat dezelfde taaksoort toe voor niet-overlappende objecten", () => {
    expect(validateActivation(
      line(),
      contract(),
      [line({ id: "line-b", object_id: "object-2", status: "active" })],
      [contract()],
      objects,
      [],
    )).toMatchObject({ task_type_key: "reception" });
  });

  it.each(["ended", "superseded", "archived"])(
    "negeert een actieve regel onder een definitief %s hoofdcontract",
    parentStatus => {
      const historicalContract = contract({
        id: "contract-history",
        company_id: "company-history",
        customer_account_id: "account-history",
        status: parentStatus,
      });
      const historicalLine = line({
        id: "line-history",
        contract_id: historicalContract.id,
        company_id: historicalContract.company_id,
        customer_account_id: historicalContract.customer_account_id,
        status: "active",
      });

      expect(validateActivation(
        line(),
        contract(),
        [historicalLine],
        [contract(), historicalContract],
        objects,
        [],
      )).toMatchObject({ task_type_key: "reception" });
    },
  );

  it.each(["approved", "sent_for_signature", "signed", "active", "suspended"])(
    "reserveert routes van een %s hoofdcontract",
    parentStatus => {
      const reservingContract = contract({
        id: "contract-reserving",
        company_id: "company-reserving",
        customer_account_id: "account-reserving",
        status: parentStatus,
      });
      const reservingLine = line({
        id: "line-reserving",
        contract_id: reservingContract.id,
        company_id: reservingContract.company_id,
        customer_account_id: reservingContract.customer_account_id,
        status: "active",
      });

      expect(() => validateActivation(
        line(),
        contract(),
        [reservingLine],
        [contract(), reservingContract],
        objects,
        [],
      )).toThrowError(expect.objectContaining({
        details: expect.objectContaining({ code: "CONTRACT_LINE_ROUTING_OVERLAP" }),
      }));
    },
  );

  it.each(["signed", "suspended"])(
    "hercontroleert alle actieve regels bij contractactivatie vanuit %s",
    targetStatus => {
      const targetContract = contract({ status: targetStatus });
      const competingContract = contract({
        id: "contract-active",
        company_id: "company-active",
        customer_account_id: "account-active",
        status: "active",
      });
      const targetLine = line({ status: "active" });
      const competingLine = line({
        id: "line-active",
        contract_id: competingContract.id,
        company_id: competingContract.company_id,
        customer_account_id: competingContract.customer_account_id,
        status: "active",
      });

      expect(() => validateContractActivation(
        targetContract,
        [targetLine],
        [targetLine, competingLine],
        [targetContract, competingContract],
        objects,
        [],
      )).toThrowError(expect.objectContaining({
        details: expect.objectContaining({
          code: "CONTRACT_LINE_ROUTING_OVERLAP",
          conflicting_contract_line_id: "line-active",
        }),
      }));
    },
  );

  it.each([
    [line({ task_type_key: null, service_code: "KLANT-SKU-42" }), [], "CONTRACT_LINE_TASK_TYPE_UNKNOWN"],
    [line({ scope_type: "collective", object_id: null, collective_id: "collective-empty" }), [
      { id: "collective-empty", customer_id: "customer-1", object_ids: [] },
    ], "CONTRACT_LINE_SCOPE_INVALID"],
    [line({ scope_type: "unknown", object_id: null }), [], "CONTRACT_LINE_SCOPE_INVALID"],
    [line({ valid_from: "2025-12-31" }), [], "CONTRACT_LINE_PERIOD_OUTSIDE_CONTRACT"],
  ])("faalt gesloten voor onbekende taaksoort, lege scope of ongeldige periode", (target, collectives, code) => {
    expect(() => validateActivation(target, contract(), [], [contract()], objects, collectives))
      .toThrowError(expect.objectContaining({ status: 409, details: expect.objectContaining({ code }) }));
  });
});

describe("Collectiefmutatie onder klantcontract-routinglock", () => {
  it("schrijft collectieven nooit meer rechtstreeks vanuit de browser", () => {
    expect(collectivePageSource).not.toContain("base44.entities.Collectief.create");
    expect(collectivePageSource).not.toContain("base44.entities.Collectief.update");
    expect(collectivePageSource).not.toContain("base44.entities.Collectief.delete");
    expect(collectivePageSource).toContain('action: "create_collective"');
    expect(collectivePageSource).toContain('action: "update_collective"');
    expect(collectivePageSource).toContain('action: "delete_collective"');
  });

  it("valideert klant en objecten ook bij idempotente server-side aanmaak", async () => {
    const { base44, entities } = collectiveRoutingBackend();
    const user = { id: "admin-1", role: "admin" };
    const data = {
      customer_id: "customer-1",
      name: "Collectief Zuid",
      collectief_type: "bedrijventerrein",
      object_ids: ["object-foreign"],
    };

    await expect(createCollective(
      base44,
      user,
      { customer_id: "customer-1", data },
      0,
      "collective-create-invalid",
      "fingerprint-create-invalid",
    )).rejects.toMatchObject({
      status: 409,
      details: expect.objectContaining({
        code: "COLLECTIVE_OBJECT_CUSTOMER_MISMATCH",
        object_ids: ["object-foreign"],
      }),
    });

    const created = await createCollective(
      base44,
      user,
      {
        customer_id: "customer-1",
        data: { ...data, object_ids: ["object-3"] },
      },
      0,
      "collective-create-safe",
      "fingerprint-create-safe",
    );
    expect(created.collective).toMatchObject({
      customer_id: "customer-1",
      object_ids: ["object-3"],
      version: 1,
      idempotency_key: "collective-create-safe",
    });

    const replay = await createCollective(
      base44,
      user,
      {
        customer_id: "customer-1",
        data: { ...data, object_ids: ["object-3"] },
      },
      0,
      "collective-create-safe",
      "fingerprint-create-safe",
    );
    expect(replay).toMatchObject({ replayed: true, recovered_partial_creation: true });
    expect(entities.Collectief.records.filter(item => item.idempotency_key === "collective-create-safe")).toHaveLength(1);
  });

  it("verwijdert geen collectief zolang contract-, offerte-, taak- of hiërarchiereferenties bestaan", async () => {
    const { base44, entities } = collectiveRoutingBackend();
    const user = { id: "admin-1", role: "admin" };
    const request = {
      collective_id: "collective-1",
      customer_id: "customer-1",
    };

    await expect(deleteCollective(
      base44,
      user,
      request,
      1,
      "collective-delete-referenced",
      "fingerprint-delete-referenced",
    )).rejects.toMatchObject({
      status: 409,
      details: expect.objectContaining({
        code: "COLLECTIVE_STILL_REFERENCED",
        references: expect.arrayContaining([
          expect.objectContaining({ entity: "CustomerContractLine", field: "collective_id" }),
        ]),
      }),
    });
    expect(entities.Collectief.records.some(item => item.id === "collective-1")).toBe(true);

    entities.CustomerContractLine.records.length = 0;
    entities.Task.records.push({
      id: "task-parent",
      collectief_id: null,
      selected_sub_collectief_ids: ["collective-1"],
    });
    await expect(deleteCollective(
      base44,
      user,
      request,
      1,
      "collective-delete-task-ref",
      "fingerprint-delete-task-ref",
    )).rejects.toMatchObject({
      status: 409,
      details: expect.objectContaining({
        references: expect.arrayContaining([
          expect.objectContaining({ entity: "Task", field: "selected_sub_collectief_ids" }),
        ]),
      }),
    });

    entities.Task.records.length = 0;
    const result = await deleteCollective(
      base44,
      user,
      request,
      1,
      "collective-delete-safe",
      "fingerprint-delete-safe",
    );
    expect(result).toMatchObject({ deleted: true, resource_id: "collective-1" });
    expect(entities.Collectief.records.some(item => item.id === "collective-1")).toBe(false);
  });

  it("blokkeert nieuwe ambiguïteit vóór de write en laat een veilige scopewijziging wel slagen", async () => {
    const { base44, entities } = collectiveRoutingBackend();
    const user = { id: "admin-1", role: "admin" };

    await expect(updateCollective(
      base44,
      user,
      {
        collective_id: "collective-1",
        customer_id: "customer-1",
        data: { object_ids: ["object-1", "object-2"] },
      },
      1,
      "collective-overlap",
      "fingerprint-overlap",
    )).rejects.toMatchObject({
      status: 409,
      details: expect.objectContaining({
        code: "CONTRACT_LINE_ROUTING_OVERLAP",
        conflicting_contract_line_id: "line-object-b",
        overlapping_object_ids: ["object-2"],
      }),
    });
    expect(entities.Collectief.records[0]).toMatchObject({
      object_ids: ["object-1"],
      version: 1,
    });

    await expect(updateCollective(
      base44,
      user,
      {
        collective_id: "collective-1",
        customer_id: "customer-1",
        data: { object_ids: ["object-1", "object-foreign"] },
      },
      1,
      "collective-cross-customer",
      "fingerprint-cross-customer",
    )).rejects.toMatchObject({
      status: 409,
      details: expect.objectContaining({
        code: "COLLECTIVE_OBJECT_CUSTOMER_MISMATCH",
        object_ids: ["object-foreign"],
      }),
    });
    expect(entities.Collectief.records[0]).toMatchObject({
      object_ids: ["object-1"],
      version: 1,
    });

    const result = await updateCollective(
      base44,
      user,
      {
        collective_id: "collective-1",
        customer_id: "customer-1",
        data: { object_ids: ["object-1", "object-3"] },
      },
      1,
      "collective-safe",
      "fingerprint-safe",
    );

    expect(result.collective).toMatchObject({
      object_ids: ["object-1", "object-3"],
      version: 2,
    });
    expect(entities.Customer.records[0].third_party_organization_mutation_lock).toBeNull();
  });

  it("weigert onbekende of klantvreemde object-ID's ook zonder actieve contractregel", async () => {
    const { base44, entities } = collectiveRoutingBackend();
    entities.CustomerContractLine.records.length = 0;

    await expect(updateCollective(
      base44,
      { id: "admin-1", role: "admin" },
      {
        collective_id: "collective-1",
        customer_id: "customer-1",
        data: { object_ids: ["object-1", "object-foreign", "object-missing"] },
      },
      1,
      "collective-invalid-object-context",
      "fingerprint-invalid-object-context",
    )).rejects.toMatchObject({
      status: 409,
      details: expect.objectContaining({
        code: "COLLECTIVE_OBJECT_CUSTOMER_MISMATCH",
        object_ids: ["object-foreign", "object-missing"],
      }),
    });
    expect(entities.Collectief.records[0]).toMatchObject({ object_ids: ["object-1"], version: 1 });
  });

  it("laat een klantwissel met een actieve refererende collectiefregel niet als lege scope passeren", async () => {
    const { base44, entities } = collectiveRoutingBackend();

    await expect(updateCollective(
      base44,
      { id: "admin-1", role: "admin" },
      {
        collective_id: "collective-1",
        customer_id: "customer-2",
        data: { customer_id: "customer-2", object_ids: ["object-foreign"] },
      },
      1,
      "collective-customer-move",
      "fingerprint-customer-move",
    )).rejects.toMatchObject({
      status: 409,
      details: expect.objectContaining({ code: "CONTRACT_LINE_SCOPE_INVALID" }),
    });
    expect(entities.Collectief.records[0]).toMatchObject({ customer_id: "customer-1", version: 1 });
  });

  it("deelt de globale routing-lock met contractregelactivatie", async () => {
    const { base44, entities } = collectiveRoutingBackend();
    entities.Customer.records[0].third_party_organization_mutation_lock = {
      owner_token: "contract-activation-owner",
      key_hash: "contract-activation-key",
      actor_id: "other-admin",
      request_fingerprint: "contract-activation-fingerprint",
      mutation_target: "contract-line-routing:customer-1",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    };
    entities.Customer.records[0].third_party_organization_mutation_lock_version = 4;

    await expect(updateCollective(
      base44,
      { id: "admin-1", role: "admin" },
      {
        collective_id: "collective-1",
        customer_id: "customer-1",
        data: { object_ids: ["object-1", "object-3"] },
      },
      1,
      "collective-shared-lock",
      "fingerprint-shared-lock",
    )).rejects.toMatchObject({ status: 409, details: expect.objectContaining({ retryable: true }) });
    expect(entities.Collectief.records[0]).toMatchObject({ object_ids: ["object-1"], version: 1 });
  });
});
