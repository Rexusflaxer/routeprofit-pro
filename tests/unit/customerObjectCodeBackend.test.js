import fs from "node:fs";
import path from "node:path";
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from "node:util";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it, vi } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const entryPath = path.join(root, "base44/functions/customerPlatformApi/entry.ts");
const customerSchemaPath = path.join(root, "base44/entities/Customer.jsonc");
const schemaPath = path.join(root, "base44/entities/SurveillanceObject.jsonc");
const source = fs.readFileSync(entryPath, "utf8");

let backend;

beforeAll(async () => {
  globalThis.TextEncoder = NodeTextEncoder;
  globalThis.TextDecoder = NodeTextDecoder;
  globalThis.Uint8Array = new NodeTextEncoder().encode("").constructor;
  const { transform } = await import("esbuild");
  const testableSource = source
    .replace(
      /^import \{ createClientFromRequest \} from 'npm:@base44\/sdk@[^']+';$/m,
      "const createClientFromRequest = () => ({});",
    )
    .concat(`\nexport {
      canonicalObjectCode,
      assertGlobalObjectCodeMutation,
      handleSearchCustomerObjects,
      normalizedExternalObjectCode,
      objectCodeExists,
      objectIdentityChanges,
      objectIdentityPatch,
      releaseGlobalObjectCodeMutation,
      renewGlobalObjectCodeMutation,
      reserveGlobalObjectCodeMutation,
      safeObjectMutationSummary
    };`);
  const compiled = await transform(testableSource, {
    format: "esm",
    loader: "ts",
    target: "es2022",
  });
  backend = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString("base64")}`);
});

function object(overrides = {}) {
  return {
    id: "object-self",
    customer_id: "customer-1",
    object_code: "OBJ-001",
    object_code_normalized: "OBJ-001",
    external_object_code: null,
    external_object_code_normalized: null,
    name: "Distributiecentrum",
    address: "Reactorweg 1, Utrecht",
    object_type: "industrial_logistics",
    status: "active",
    geocoding_status: "unverified",
    latitude: null,
    longitude: null,
    version: 3,
    ...overrides,
  };
}

describe("customerPlatformApi objectcodes", () => {
  it("maakt de interne code canoniek en bewaart de externe code als niet-unieke referentie", () => {
    expect(backend.canonicalObjectCode("  obj 004/a_b.2 ", true)).toBe("OBJ-004/A_B.2");
    expect(() => backend.canonicalObjectCode("extern#42", true)).toThrow("ongeldige tekens");

    const patch = backend.objectIdentityPatch({
      object_code: " obj 004 ",
      external_object_code: "  Meldkamer  42-a  ",
    }, object());

    expect(patch).toMatchObject({
      object_code: "OBJ-004",
      object_code_normalized: "OBJ-004",
      external_object_code: "Meldkamer  42-a",
      external_object_code_normalized: "MELDKAMER 42-A",
    });
  });

  it("vindt legacycodes hoofdletterongevoelig, behandelt spaties als koppeltekens en sluit het eigen object uit", async () => {
    const filter = vi.fn().mockResolvedValue([
      object(),
      object({ id: "object-other", object_code: "obj 001", object_code_normalized: null }),
    ]);
    const base44 = { asServiceRole: { entities: { SurveillanceObject: { filter } } } };

    await expect(backend.objectCodeExists(base44, "OBJ-001", "object-self"))
      .resolves.toMatchObject({ id: "object-other" });
    expect(filter).toHaveBeenCalledWith({
      $or: [
        { object_code_normalized: "OBJ-001" },
        { object_code: { $regex: "^OBJ(?:-|\\s+)001$", $options: "i" } },
      ],
    }, "+created_date", 100);
  });

  it("weigert ook NFKC-equivalente legacycodes zonder normalized veld", async () => {
    const filter = vi.fn()
      .mockResolvedValueOnce([]);
    const list = vi.fn().mockResolvedValueOnce([
      object({ id: "object-fullwidth", object_code: "ＯＢＪ ００１", object_code_normalized: null }),
    ]);
    const base44 = { asServiceRole: { entities: { SurveillanceObject: { filter, list } } } };

    await expect(backend.objectCodeExists(base44, "OBJ-001"))
      .resolves.toMatchObject({ id: "object-fullwidth" });
    expect(list).toHaveBeenCalledWith(
      "+created_date",
      5_000,
      0,
      ["id", "object_code", "object_code_normalized"],
    );
  });

  it("neemt beide codes op in veilige DTO en objectlogboek", () => {
    const before = object();
    const after = object({ object_code: "OBJ-002", external_object_code: "Partner 77" });
    expect(backend.safeObjectMutationSummary(after, [
      "object_code",
      "object_code_normalized",
      "external_object_code",
      "external_object_code_normalized",
    ])).toMatchObject({
      object_code: "OBJ-002",
      external_object_code: "Partner 77",
      changed_fields: ["external_object_code", "object_code"],
    });
    expect(backend.objectIdentityChanges(before, after, ["object_code", "external_object_code"]))
      .toEqual([
        { field: "object_code", label: "Objectcode", before: "OBJ-001", after: "OBJ-002" },
        { field: "external_object_code", label: "Externe objectcode", before: null, after: "Partner 77" },
      ]);
  });

  it("routeert externe-codezoekactie en bewaakt update vóór en na de CAS-write", () => {
    expect(source).toContain("'search_customer_objects'");
    expect(source).toContain("action === 'search_customer_objects'");
    expect(source).toContain("external_object_code: { $regex: literalRegex");
    expect(source).toContain("external_object_code_normalized: { $regex: normalizedRegex");

    const start = source.indexOf("async function handleUpdateCustomerObjectIdentity");
    const end = source.indexOf("async function handleUpdateCustomerObjectOperations", start);
    const updateSource = source.slice(start, end);
    const preflight = updateSource.indexOf("objectCodeExists(base44, patch.object_code, object.id, objectCodeReservation)");
    const reservation = updateSource.indexOf("reserveGlobalObjectCodeMutation");
    const casWrite = updateSource.indexOf("const updated = await casUpdate");
    const fenceCheck = updateSource.indexOf("assertGlobalObjectCodeMutation");
    const postflight = updateSource.indexOf("objectCodeExists(base44, updated.object_code, updated.id, objectCodeReservation)");
    const rollback = updateSource.indexOf("rollbackRejectedObjectCodeMutation");
    expect(preflight).toBeGreaterThan(-1);
    expect(reservation).toBeGreaterThan(-1);
    expect(preflight).toBeGreaterThan(reservation);
    expect(casWrite).toBeGreaterThan(preflight);
    expect(fenceCheck).toBeGreaterThan(preflight);
    expect(casWrite).toBeGreaterThan(fenceCheck);
    expect(postflight).toBeGreaterThan(casWrite);
    expect(rollback).toBeGreaterThan(postflight);
    expect(updateSource).toContain("releaseGlobalObjectCodeMutation");
  });

  it("houdt de globale reservering tijdens de definitieve createcheck en write vast", () => {
    const start = source.indexOf("async function handleCreateCustomerObject");
    const end = source.indexOf("async function handleUpdateCustomerObjectIdentity", start);
    const createSource = source.slice(start, end);
    const declaration = createSource.indexOf("let objectCodeReservation");
    const reservation = createSource.indexOf("objectCodeReservation = await reserveGlobalObjectCodeMutation");
    const protectedPreflight = createSource.indexOf("objectCodeExists(base44, objectCode, '', objectCodeReservation)");
    const fenceCheck = createSource.indexOf("assertGlobalObjectCodeMutation(base44, objectCodeReservation)");
    const createWrite = createSource.indexOf("getEntity(base44, 'SurveillanceObject').create");

    expect(declaration).toBeGreaterThan(-1);
    expect(reservation).toBeGreaterThan(declaration);
    expect(protectedPreflight).toBeGreaterThan(reservation);
    expect(fenceCheck).toBeGreaterThan(protectedPreflight);
    expect(createWrite).toBeGreaterThan(fenceCheck);
    expect(createSource).toContain("releaseGlobalObjectCodeMutation");
  });

  it("laat bij twee gelijktijdige globale reserveringen precies één schrijver toe", async () => {
    let state = {
      id: "customer-coordinator",
      version: 1,
      created_date: "2026-01-01T00:00:00.000Z",
      object_code_mutation_lock: null,
    };
    const customerEntity = {
      list: vi.fn(async () => [{ ...state }]),
      get: vi.fn(async id => id === state.id ? { ...state } : null),
      updateMany: vi.fn(async (query, update) => {
        if (query.id !== state.id || query.version !== state.version) {
          return { success: true, updated: 0 };
        }
        state = {
          ...state,
          ...(update.$set || {}),
          version: state.version + Number(update.$inc?.version || 0),
        };
        return { success: true, updated: 1 };
      }),
    };
    const base44 = { asServiceRole: { entities: { Customer: customerEntity } } };
    const user = { id: "admin-1" };

    const outcomes = await Promise.allSettled([
      backend.reserveGlobalObjectCodeMutation(base44, user, "key-a", "object:a"),
      backend.reserveGlobalObjectCodeMutation(base44, user, "key-b", "object:b"),
    ]);

    expect(outcomes.filter(outcome => outcome.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find(outcome => outcome.status === "rejected");
    expect(rejected.reason).toMatchObject({ status: 409, details: expect.objectContaining({ retryable: true }) });
    const reservation = outcomes.find(outcome => outcome.status === "fulfilled").value;
    await expect(backend.assertGlobalObjectCodeMutation(base44, reservation)).resolves.toMatchObject({
      id: "customer-coordinator",
    });
    const versionBeforeRenewal = state.version;
    await backend.renewGlobalObjectCodeMutation(base44, reservation);
    expect(state.version).toBe(versionBeforeRenewal + 1);
    await backend.releaseGlobalObjectCodeMutation(base44, reservation);
    expect(state.object_code_mutation_lock).toBeNull();
  });

  it("legt de schema-afspraken vast", () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
    // Legacy-objecten worden additief gemigreerd; alle nieuwe writes vereisen de
    // code in de API/UI zonder bestaande records bij schema-publicatie te breken.
    expect(schema.required).not.toContain("object_code");
    expect(schema.properties.object_code.maxLength).toBe(50);
    expect(schema.properties.external_object_code.maxLength).toBe(120);
    expect(schema.properties.external_object_code_normalized.maxLength).toBe(120);
    const customerSchema = JSON.parse(fs.readFileSync(customerSchemaPath, "utf8"));
    expect(customerSchema.properties.object_code_mutation_lock.type).toEqual(["object", "null"]);
  });
});
