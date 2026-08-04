import fs from "node:fs";
import path from "node:path";
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from "node:util";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it, vi } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const entryPath = path.join(root, "base44/functions/customerPlatformApi/entry.ts");
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
      handleCreateObjectKey,
      handleListObjectKeys,
      objectKeyCreationBindingMatches,
      releaseObjectKeyMutation,
      reserveObjectKeyMutation
    };`);
  const compiled = await transform(testableSource, {
    format: "esm",
    loader: "ts",
    target: "es2022",
  });
  backend = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString("base64")}`);
});

const clone = value => structuredClone(value);

describe("customerPlatformApi sleutelconsistentie", () => {
  it("laat bij twee gelijktijdige objectgebonden sleutelclaims precies één schrijver toe", async () => {
    let state = {
      id: "object-1",
      customer_id: "customer-1",
      status: "active",
      version: 7,
      object_key_mutation_lock: null,
    };
    const objectEntity = {
      get: vi.fn(async id => id === state.id ? clone(state) : null),
      updateMany: vi.fn(async (query, update) => {
        const legacyVersionMatches = query.$or?.some(condition => (
          Object.hasOwn(condition, "object_key_mutation_lock_version")
          && state.object_key_mutation_lock_version == null
        ));
        const persistedVersionMatches = query.object_key_mutation_lock_version === state.object_key_mutation_lock_version;
        if (query.id !== state.id || (!legacyVersionMatches && !persistedVersionMatches)) {
          return { success: true, updated: 0 };
        }
        state = {
          ...state,
          ...(update.$set || {}),
          object_key_mutation_lock_version: Number(
            update.$set?.object_key_mutation_lock_version
              ?? state.object_key_mutation_lock_version
              ?? 0,
          ) + Number(update.$inc?.object_key_mutation_lock_version || 0),
        };
        return { success: true, updated: 1 };
      }),
    };
    const base44 = { asServiceRole: { entities: { SurveillanceObject: objectEntity } } };
    const user = { id: "admin-1" };

    const outcomes = await Promise.allSettled([
      backend.reserveObjectKeyMutation(base44, user, "object-1", "key-a", "fingerprint-a", "target-a"),
      backend.reserveObjectKeyMutation(base44, user, "object-1", "key-b", "fingerprint-b", "target-b"),
    ]);

    expect(outcomes.filter(outcome => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(outcome => outcome.status === "rejected")).toHaveLength(1);
    expect(outcomes.find(outcome => outcome.status === "rejected").reason).toMatchObject({
      status: 409,
      details: expect.objectContaining({ retryable: true }),
    });
    expect(state.version).toBe(7);
    expect(state.object_key_mutation_lock).toMatchObject({
      actor_id: "admin-1",
      request_fingerprint: expect.stringMatching(/^fingerprint-[ab]$/),
      mutation_target: expect.stringMatching(/^target-[ab]$/),
    });

    const reservation = outcomes.find(outcome => outcome.status === "fulfilled").value;
    await backend.releaseObjectKeyMutation(base44, reservation);
    expect(state.object_key_mutation_lock).toBeNull();
    await expect(backend.reserveObjectKeyMutation(
      base44,
      user,
      "object-1",
      "key-c",
      "fingerprint-c",
      "target-c",
    )).resolves.toMatchObject({ object_id: "object-1" });
  });

  it("bindt partial-create recovery aan fingerprint, actor en target", () => {
    const record = {
      creation_request_fingerprint: "fingerprint-1",
      creation_actor_user_id: "admin-1",
      creation_mutation_target: "create_object_key|customer_id:customer-1|object_id:object-1",
    };
    expect(backend.objectKeyCreationBindingMatches(
      record,
      { id: "admin-1" },
      "fingerprint-1",
      "create_object_key|customer_id:customer-1|object_id:object-1",
    )).toBe(true);
    expect(backend.objectKeyCreationBindingMatches(record, { id: "admin-2" }, "fingerprint-1", record.creation_mutation_target)).toBe(false);
    expect(backend.objectKeyCreationBindingMatches(record, { id: "admin-1" }, "fingerprint-2", record.creation_mutation_target)).toBe(false);
    expect(backend.objectKeyCreationBindingMatches(record, { id: "admin-1" }, "fingerprint-1", "other-target")).toBe(false);
  });

  it("weigert een volledige create-replay met een gewijzigde fingerprint", async () => {
    const assignment = {
      id: "assignment-1",
      customer_id: "customer-1",
      object_id: "object-1",
      key_id: "key-1",
      key_set_id: "set-1",
      status: "active",
      version: 1,
      creation_request_fingerprint: "original-fingerprint",
      creation_actor_user_id: "admin-1",
      creation_mutation_target: "key-target",
    };
    const base44 = {
      asServiceRole: {
        entities: {
          Customer: { get: vi.fn(async () => ({ id: "customer-1", status: "active" })) },
          SurveillanceObject: { get: vi.fn(async () => ({ id: "object-1", customer_id: "customer-1", status: "active" })) },
          ObjectKeyAssignment: { filter: vi.fn(async () => [assignment]) },
        },
      },
    };

    await expect(backend.handleCreateObjectKey(
      base44,
      { id: "admin-1" },
      {
        customer_id: "customer-1",
        object_id: "object-1",
        data: { key_type: "key", brand: "DOM", key_set_id: "set-1" },
      },
      0,
      "create-key-1",
      "changed-fingerprint",
      "key-target",
    )).rejects.toMatchObject({ status: 409 });
  });

  it("weigert een create-replay die naar een andere sleutelset wordt gestuurd", async () => {
    const target = "key-target";
    const fingerprint = "original-fingerprint";
    const assignment = {
      id: "assignment-1",
      customer_id: "customer-1",
      object_id: "object-1",
      key_id: "key-1",
      key_set_id: "set-1",
      status: "active",
      version: 1,
      creation_request_fingerprint: fingerprint,
      creation_actor_user_id: "admin-1",
      creation_mutation_target: target,
    };
    const key = {
      id: "key-1",
      owner_customer_id: "customer-1",
      key_type: "key",
      brand: "DOM",
      serial_number: null,
      status: "in_storage",
      version: 1,
      creation_idempotency_key: "create-key-1:key",
      creation_request_fingerprint: fingerprint,
      creation_actor_user_id: "admin-1",
      creation_mutation_target: target,
      creation_key_set_id: "set-1",
    };
    const set = {
      id: "set-1",
      customer_id: "customer-1",
      object_id: "object-1",
      set_number: 1,
      display_label: "Sleutelset 1",
      key_number: "WE-001",
      status: "active",
      version: 1,
    };
    const base44 = {
      asServiceRole: {
        entities: {
          Customer: { get: vi.fn(async () => ({ id: "customer-1", status: "active" })) },
          SurveillanceObject: { get: vi.fn(async () => ({ id: "object-1", customer_id: "customer-1", status: "active" })) },
          ObjectKeyAssignment: { filter: vi.fn(async () => [assignment]) },
          ObjectKey: { get: vi.fn(async () => key) },
          ObjectKeySet: { get: vi.fn(async () => set) },
        },
      },
    };

    await expect(backend.handleCreateObjectKey(
      base44,
      { id: "admin-1" },
      {
        customer_id: "customer-1",
        object_id: "object-1",
        data: { key_type: "key", brand: "DOM", key_set_id: "set-other" },
      },
      0,
      "create-key-1",
      fingerprint,
      target,
    )).rejects.toMatchObject({ status: 409 });
  });

  it("houdt actieve lege sleutelsets beschikbaar voor de wizard", async () => {
    const emptySet = {
      id: "set-empty",
      customer_id: "customer-1",
      object_id: "object-1",
      set_number: 4,
      display_label: "Sleutelset 4",
      key_number: "WE-004",
      status: "active",
      version: 2,
    };
    const base44 = {
      asServiceRole: {
        entities: {
          Customer: { get: vi.fn(async () => ({ id: "customer-1", status: "active" })) },
          SurveillanceObject: { get: vi.fn(async () => ({ id: "object-1", customer_id: "customer-1", status: "active" })) },
          ObjectKeySet: { filter: vi.fn(async () => [emptySet]) },
          ObjectKeyAssignment: { filter: vi.fn(async () => []) },
        },
      },
    };

    const result = await backend.handleListObjectKeys(base44, {
      customer_id: "customer-1",
      object_id: "object-1",
    });
    expect(result.sets).toEqual([expect.objectContaining({ id: "set-empty", keys: [] })]);
  });
});
