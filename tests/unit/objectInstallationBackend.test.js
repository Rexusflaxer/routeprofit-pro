import fs from "node:fs";
import path from "node:path";
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from "node:util";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { AJAX_CONTROL_DEVICE_OPTIONS } from "@/components/objects/objectInstallationManuals";

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
      releaseObjectInstallationMutation,
      reserveObjectInstallationMutation,
      normalizedInstallationData,
      safeExplicitLogbookChanges
    };`);
  const compiled = await transform(testableSource, {
    format: "esm",
    loader: "ts",
    target: "es2022",
  });
  backend = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString("base64")}`);
});

const clone = value => structuredClone(value);

describe("customerPlatformApi installatieconsistentie", () => {
  const installationData = overrides => ({
    installation_type: "alarm_system",
    name: "Hoofdcentrale",
    brand: "Ajax Systems",
    monitoring_connected: false,
    lifecycle_status: "active",
    operational_status: "operational",
    ...overrides,
  });

  it("leidt alle Ajax-handleidingvelden server-side af uit een bekende paneelsleutel", () => {
    for (const option of AJAX_CONTROL_DEVICE_OPTIONS) {
      const result = backend.normalizedInstallationData(installationData({
        control_device_key: option.value,
        control_device_name: "Vervalste naam",
        manual_key: "client:mag:dit:niet:bepalen",
        manual_version: "999",
      }));
      expect(result).toMatchObject({
        brand: "Ajax Systems",
        control_device_key: option.value,
        control_device_name: option.label,
        manual_key: option.manualKey,
        manual_version: option.manualVersion,
      });
    }
  });

  it("weigert een onbekend Ajax-paneel en wist handleidingvelden bij andere merken", () => {
    expect(() => backend.normalizedInstallationData(installationData({ control_device_key: "onbekend-paneel" }))).toThrow(/Ajax-bedienpaneel/);
    expect(backend.normalizedInstallationData(installationData({
      brand: "Honeywell",
      control_device_key: "keypad-jeweller",
      manual_key: "ajax:keypad-jeweller:nl",
    }))).toMatchObject({
      control_device_key: null,
      control_device_name: null,
      manual_key: null,
      manual_version: null,
    });
  });

  it("maakt paneel- en handleidingwijzigingen zichtbaar zonder interne sleutels te tonen", () => {
    expect(backend.safeExplicitLogbookChanges([
      { field: "control_device_key", label: "Bedienpaneelsleutel", before: "oud", after: "nieuw" },
      { field: "control_device_name", label: "Bedienpaneel", before: "KeyPad", after: "KeyPad Plus" },
      { field: "manual_key", label: "Handleiding", before: "intern-oud", after: "intern-nieuw" },
      { field: "manual_version", label: "Handleidingversie", before: "2026.08.1", after: "2026.09.1" },
    ])).toEqual([
      { field: "control_device_name", label: "Bedienpaneel", before: "KeyPad", after: "KeyPad Plus" },
      { field: "manual_version", label: "Handleidingversie", before: "2026.08.1", after: "2026.09.1" },
    ]);
  });

  it("laat bij twee gelijktijdige installatieclaims precies een schrijver toe", async () => {
    let state = {
      id: "object-1",
      customer_id: "customer-1",
      status: "active",
      version: 7,
      installation_mutation_lock: null,
    };
    const objectEntity = {
      get: vi.fn(async id => id === state.id ? clone(state) : null),
      updateMany: vi.fn(async (query, update) => {
        const legacyVersionMatches = query.$or?.some(condition => (
          Object.hasOwn(condition, "installation_mutation_lock_version")
          && state.installation_mutation_lock_version == null
        ));
        const persistedVersionMatches = query.installation_mutation_lock_version === state.installation_mutation_lock_version;
        if (query.id !== state.id || (!legacyVersionMatches && !persistedVersionMatches)) {
          return { success: true, updated: 0 };
        }
        state = {
          ...state,
          ...(update.$set || {}),
          installation_mutation_lock_version: Number(
            update.$set?.installation_mutation_lock_version
              ?? state.installation_mutation_lock_version
              ?? 0,
          ) + Number(update.$inc?.installation_mutation_lock_version || 0),
        };
        return { success: true, updated: 1 };
      }),
    };
    const base44 = { asServiceRole: { entities: { SurveillanceObject: objectEntity } } };
    const user = { id: "admin-1" };

    const outcomes = await Promise.allSettled([
      backend.reserveObjectInstallationMutation(base44, user, "object-1", "key-a", "fingerprint-a", "target-a"),
      backend.reserveObjectInstallationMutation(base44, user, "object-1", "key-b", "fingerprint-b", "target-b"),
    ]);

    expect(outcomes.filter(outcome => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(outcome => outcome.status === "rejected")).toHaveLength(1);
    expect(outcomes.find(outcome => outcome.status === "rejected").reason).toMatchObject({
      status: 409,
      details: expect.objectContaining({ retryable: true }),
    });
    expect(state.version).toBe(7);
    expect(state.installation_mutation_lock).toMatchObject({
      actor_id: "admin-1",
      request_fingerprint: expect.stringMatching(/^fingerprint-[ab]$/),
      mutation_target: expect.stringMatching(/^target-[ab]$/),
    });

    const reservation = outcomes.find(outcome => outcome.status === "fulfilled").value;
    await backend.releaseObjectInstallationMutation(base44, reservation);
    expect(state.installation_mutation_lock).toBeNull();
    await expect(backend.reserveObjectInstallationMutation(
      base44,
      user,
      "object-1",
      "key-c",
      "fingerprint-c",
      "target-c",
    )).resolves.toMatchObject({ object_id: "object-1" });
  });
});
