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
      releaseWarningAddressMutation,
      reserveWarningAddressMutation
    };`);
  const compiled = await transform(testableSource, {
    format: "esm",
    loader: "ts",
    target: "es2022",
  });
  backend = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString("base64")}`);
});

const clone = value => structuredClone(value);

describe("customerPlatformApi waarschuwingsadresconsistentie", () => {
  it("laat bij twee gelijktijdige waarschuwingsadresclaims precies een schrijver toe", async () => {
    let state = {
      id: "object-1",
      customer_id: "customer-1",
      status: "active",
      version: 7,
      warning_address_mutation_lock: null,
    };
    const objectEntity = {
      get: vi.fn(async id => id === state.id ? clone(state) : null),
      updateMany: vi.fn(async (query, update) => {
        const legacyVersionMatches = query.$or?.some(condition => (
          Object.hasOwn(condition, "warning_address_mutation_lock_version")
          && state.warning_address_mutation_lock_version == null
        ));
        const persistedVersionMatches = query.warning_address_mutation_lock_version === state.warning_address_mutation_lock_version;
        if (query.id !== state.id || (!legacyVersionMatches && !persistedVersionMatches)) {
          return { success: true, updated: 0 };
        }
        state = {
          ...state,
          ...(update.$set || {}),
          warning_address_mutation_lock_version: Number(
            update.$set?.warning_address_mutation_lock_version
              ?? state.warning_address_mutation_lock_version
              ?? 0,
          ) + Number(update.$inc?.warning_address_mutation_lock_version || 0),
        };
        return { success: true, updated: 1 };
      }),
    };
    const base44 = { asServiceRole: { entities: { SurveillanceObject: objectEntity } } };
    const user = { id: "admin-1" };

    const outcomes = await Promise.allSettled([
      backend.reserveWarningAddressMutation(base44, user, "object-1", "upsert_warning_availability_overrides", "key-a", "fingerprint-a", "target-a"),
      backend.reserveWarningAddressMutation(base44, user, "object-1", "delete_warning_availability_override", "key-b", "fingerprint-b", "target-b"),
    ]);

    expect(outcomes.filter(outcome => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(outcome => outcome.status === "rejected")).toHaveLength(1);
    expect(outcomes.find(outcome => outcome.status === "rejected").reason).toMatchObject({
      status: 409,
      details: expect.objectContaining({ retryable: true }),
    });
    expect(state.version).toBe(7);
    expect(state.warning_address_mutation_lock).toMatchObject({
      actor_id: "admin-1",
      action: expect.stringMatching(/^(upsert_warning_availability_overrides|delete_warning_availability_override)$/),
      request_fingerprint: expect.stringMatching(/^fingerprint-[ab]$/),
      mutation_target: expect.stringMatching(/^target-[ab]$/),
    });

    const reservation = outcomes.find(outcome => outcome.status === "fulfilled").value;
    await backend.releaseWarningAddressMutation(base44, reservation);
    expect(state.warning_address_mutation_lock).toBeNull();
  });
});
