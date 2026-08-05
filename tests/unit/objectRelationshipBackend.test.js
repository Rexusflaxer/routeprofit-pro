import fs from "node:fs";
import path from "node:path";
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from "node:util";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it, vi } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const api = fs.readFileSync(path.join(root, "base44/functions/customerPlatformApi/entry.ts"), "utf8");
const workflow = fs.readFileSync(path.join(root, "src/components/objects/objectRelationshipWorkflow.js"), "utf8");
const relationshipSchema = JSON.parse(fs.readFileSync(path.join(root, "base44/entities/ObjectRelationship.jsonc"), "utf8"));
const organizationSchema = JSON.parse(fs.readFileSync(path.join(root, "base44/entities/ThirdPartyOrganization.jsonc"), "utf8"));
const customerSchema = JSON.parse(fs.readFileSync(path.join(root, "base44/entities/Customer.jsonc"), "utf8"));
const objectSchema = JSON.parse(fs.readFileSync(path.join(root, "base44/entities/SurveillanceObject.jsonc"), "utf8"));
let backend;

beforeAll(async () => {
  globalThis.TextEncoder = NodeTextEncoder;
  globalThis.TextDecoder = NodeTextDecoder;
  globalThis.Uint8Array = new NodeTextEncoder().encode("").constructor;
  const { transform } = await import("esbuild");
  const testableSource = api
    .replace(
      /^import \{ createClientFromRequest \} from 'npm:@base44\/sdk@[^']+';$/m,
      "const createClientFromRequest = () => ({});",
    )
    .concat(`\nexport {
      ensureThirdPartyOrganizationRelationType,
      handleObjectRelationshipMutation,
      normalizedObjectRelationshipData,
      objectRelationshipWebsite,
      releaseObjectRelationshipMutation,
      releaseThirdPartyOrganizationMutation,
      reserveObjectRelationshipMutation,
      reserveThirdPartyOrganizationMutation
    };`);
  const compiled = await transform(testableSource, { format: "esm", loader: "ts", target: "es2022" });
  backend = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString("base64")}`);
});

describe("geconsolideerde objectrelatie-backend", () => {
  const clone = value => structuredClone(value);

  it("biedt alle relatieacties via customerPlatformApi aan", () => {
    for (const action of [
      "list_object_relationships",
      "create_object_relationship",
      "update_object_relationship",
      "archive_object_relationship",
    ]) {
      expect(api).toContain(`'${action}'`);
    }
    expect(workflow).toContain("invokeCustomerPlatformRead");
    expect(workflow).toContain("invokeCustomerPlatformMutation");
    expect(workflow).not.toContain("objectRelationshipsApi");
    expect(fs.existsSync(path.join(root, "base44/functions/objectRelationshipsApi/entry.ts"))).toBe(false);
  });

  it("gebruikt centrale scope, CAS en crashherstel", () => {
    expect(api).toMatch(/handleUpdateObjectRelationship[\s\S]*?requireCustomerObjectForMutation/);
    expect(api).toMatch(/handleUpdateObjectRelationship[\s\S]*?casUpdate\(base44, 'ObjectRelationship'/);
    expect(api).toContain("relationshipMutationMarkerReplay");
    expect(api).toMatch(/creation_request_fingerprint:\s*requestFingerprint/);
    expect(api).toMatch(/creation_actor_user_id:\s*user\.id/);
    expect(api).toMatch(/creation_mutation_target:\s*target/);
    expect(api).toMatch(/handleObjectRelationshipMutation[\s\S]*?reserveObjectRelationshipMutation/);
    expect(api).toMatch(/resolveThirdPartyOrganization[\s\S]*?reserveThirdPartyOrganizationMutation/);
  });

  it("sluit directe SDK-writes en recoverymetadata uit de veilige projectie", () => {
    for (const schema of [relationshipSchema, organizationSchema]) {
      expect(schema.rls).toEqual({ create: false, read: false, update: false, delete: false });
    }
    const projection = api.match(/function safeObjectRelationship[\s\S]*?\n}\n/)?.[0] || "";
    expect(projection).not.toContain("creation_idempotency_key");
    expect(projection).not.toContain("customer_platform_last_mutation");
    expect(objectSchema.properties.relationship_mutation_lock).toBeTruthy();
    expect(objectSchema.properties.relationship_mutation_lock_version).toMatchObject({ type: "integer", minimum: 0 });
    expect(customerSchema.properties.third_party_organization_mutation_lock).toBeTruthy();
    expect(customerSchema.properties.third_party_organization_mutation_lock_version).toMatchObject({ type: "integer", minimum: 0 });
  });

  it("valideert relatietype, eigen functienaam, e-mail en website server-side", async () => {
    expect(() => backend.normalizedObjectRelationshipData({ relation_type: "onbekend" })).toThrow(/geldig relatietype/);
    expect(() => backend.normalizedObjectRelationshipData({ relation_type: "other", custom_relation_label: "" })).toThrow(/Omschrijving relatie/);
    expect(() => backend.normalizedObjectRelationshipData({ relation_type: "pac", email: "geen-adres" })).toThrow(/e-mailadres/);
    expect(() => backend.objectRelationshipWebsite("javascript:alert(1)")).toThrow(/veilige/);
    expect(() => backend.objectRelationshipWebsite("https://user:secret@example.test")).toThrow(/inloggegevens/);
    expect(backend.objectRelationshipWebsite("https://meldkamer.example.test/contact")).toBe("https://meldkamer.example.test/contact");
    await expect(backend.handleObjectRelationshipMutation({}, {}, "onbekende_relatieactie", {}, 0, "key", "fingerprint", "target"))
      .rejects.toMatchObject({ status: 400 });
  });

  it("laat per object precies een gelijktijdige relatiemutatie toe", async () => {
    let state = {
      id: "object-1",
      customer_id: "customer-1",
      version: 7,
      relationship_mutation_lock: null,
    };
    const objectEntity = {
      get: vi.fn(async id => id === state.id ? clone(state) : null),
      updateMany: vi.fn(async (query, update) => {
        const legacyMatches = query.$or?.some(condition => (
          Object.hasOwn(condition, "relationship_mutation_lock_version")
          && state.relationship_mutation_lock_version == null
        ));
        const persistedMatches = query.relationship_mutation_lock_version === state.relationship_mutation_lock_version;
        if (query.id !== state.id || (!legacyMatches && !persistedMatches)) return { success: true, updated: 0 };
        state = {
          ...state,
          ...(update.$set || {}),
          relationship_mutation_lock_version: Number(
            update.$set?.relationship_mutation_lock_version
              ?? state.relationship_mutation_lock_version
              ?? 0,
          ) + Number(update.$inc?.relationship_mutation_lock_version || 0),
        };
        return { success: true, updated: 1 };
      }),
    };
    const base44 = { asServiceRole: { entities: { SurveillanceObject: objectEntity } } };
    const user = { id: "admin-1" };
    const outcomes = await Promise.allSettled([
      backend.reserveObjectRelationshipMutation(base44, user, "object-1", "key-a", "fingerprint-a", "target-a"),
      backend.reserveObjectRelationshipMutation(base44, user, "object-1", "key-b", "fingerprint-b", "target-b"),
    ]);

    expect(outcomes.filter(outcome => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(outcome => outcome.status === "rejected")).toHaveLength(1);
    expect(outcomes.find(outcome => outcome.status === "rejected").reason).toMatchObject({
      status: 409,
      details: expect.objectContaining({ retryable: true }),
    });
    const reservation = outcomes.find(outcome => outcome.status === "fulfilled").value;
    await backend.releaseObjectRelationshipMutation(base44, reservation);
    expect(state.relationship_mutation_lock).toBeNull();
    expect(state.version).toBe(7);
  });

  it("serialiseert de gedeelde organisatiecatalogus onafhankelijk van de klantversie", async () => {
    let state = {
      id: "customer-1",
      version: 9,
      third_party_organization_mutation_lock: null,
    };
    const customerEntity = {
      list: vi.fn(async () => [clone(state)]),
      get: vi.fn(async id => id === state.id ? clone(state) : null),
      updateMany: vi.fn(async (query, update) => {
        const legacyMatches = query.$or?.some(condition => (
          Object.hasOwn(condition, "third_party_organization_mutation_lock_version")
          && state.third_party_organization_mutation_lock_version == null
        ));
        const persistedMatches = query.third_party_organization_mutation_lock_version === state.third_party_organization_mutation_lock_version;
        if (query.id !== state.id || (!legacyMatches && !persistedMatches)) return { success: true, updated: 0 };
        state = {
          ...state,
          ...(update.$set || {}),
          third_party_organization_mutation_lock_version: Number(
            update.$set?.third_party_organization_mutation_lock_version
              ?? state.third_party_organization_mutation_lock_version
              ?? 0,
          ) + Number(update.$inc?.third_party_organization_mutation_lock_version || 0),
        };
        return { success: true, updated: 1 };
      }),
    };
    const base44 = { asServiceRole: { entities: { Customer: customerEntity } } };
    const user = { id: "admin-1" };
    const outcomes = await Promise.allSettled([
      backend.reserveThirdPartyOrganizationMutation(base44, user, "key-a", "fingerprint-a", "target-a"),
      backend.reserveThirdPartyOrganizationMutation(base44, user, "key-b", "fingerprint-b", "target-b"),
    ]);

    expect(outcomes.filter(outcome => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(outcome => outcome.status === "rejected")).toHaveLength(1);
    expect(state.version).toBe(9);
    const reservation = outcomes.find(outcome => outcome.status === "fulfilled").value;
    await backend.releaseThirdPartyOrganizationMutation(base44, reservation);
    expect(state.third_party_organization_mutation_lock).toBeNull();
    expect(state.version).toBe(9);
  });

  it("berekent de relatietype-union opnieuw na een CAS-conflict", async () => {
    const reservation = { coordinator_id: "customer-1", owner_token: "owner-1", lock_version: 1 };
    const coordinator = {
      id: "customer-1",
      third_party_organization_mutation_lock_version: 1,
      third_party_organization_mutation_lock: {
        owner_token: "owner-1",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
    };
    let organization = { id: "org-1", status: "active", relation_types: ["pac"], version: 1 };
    let firstWrite = true;
    const organizationEntity = {
      get: vi.fn(async () => clone(organization)),
      updateMany: vi.fn(async (query, update) => {
        if (firstWrite) {
          firstWrite = false;
          organization = { ...organization, relation_types: ["pac", "fire_safety_installer"], version: 2 };
          return { success: true, updated: 0 };
        }
        if (query.id !== organization.id || query.version !== organization.version) return { success: true, updated: 0 };
        organization = {
          ...organization,
          ...(update.$set || {}),
          version: organization.version + Number(update.$inc?.version || 0),
        };
        return { success: true, updated: 1 };
      }),
    };
    const base44 = {
      asServiceRole: {
        entities: {
          Customer: { get: vi.fn(async () => clone(coordinator)) },
          ThirdPartyOrganization: organizationEntity,
        },
      },
    };

    await expect(backend.ensureThirdPartyOrganizationRelationType(
      base44,
      "org-1",
      "camera_installer",
      reservation,
    )).resolves.toMatchObject({
      relation_types: ["pac", "fire_safety_installer", "camera_installer"],
      version: 3,
    });
  });
});
