import fs from "node:fs";
import path from "node:path";
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from "node:util";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

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
      assertNoSecurityPlanSecretFields,
      normalizedSecurityPlanRevisionData,
      synthesizedLegacySecurityPlanRevision,
      securityPlanMigrationRequired,
      handleMigrateLegacyObjectSecurityPlans,
      reserveSecurityPlanMutation,
      releaseSecurityPlanMutation,
      securityPlanCategorySummary,
      currentSecurityPlanMigrationRequiredCount
    };`);
  const compiled = await transform(testableSource, {
    format: "esm",
    loader: "ts",
    target: "es2022",
  });
  backend = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString("base64")}`);
});

const plan = overrides => ({
  id: "plan-saturn",
  customer_id: "customer-saturn",
  object_id: "object-saturn",
  task_type: "fire_closing_round",
  variant_name: "Productieavond",
  execution_mode: "round",
  status: "draft",
  version: 1,
  ...overrides,
});

const instructionBlocks = [{
  id: "block-1",
  sequence: 1,
  title: "Uitvoering",
  description: null,
  steps: [{
    id: "step-1",
    sequence: 1,
    title: "Controleer sectie 1",
    instruction: "Controleer of de productie is gestopt.",
    action_type: "inspect",
    section_id: "section-1",
    installation_id: null,
    floorplan_marker_id: null,
    required: true,
  }],
}];

const revision = overrides => ({
  id: "revision-saturn-1",
  security_plan_id: "plan-saturn",
  customer_id: "customer-saturn",
  object_id: "object-saturn",
  revision_number: 1,
  status: "draft",
  duration_mode: "fixed",
  duration_minutes: 45,
  section_policy: "not_applicable",
  default_section_ids: [],
  allowed_section_ids: [],
  instruction_blocks: instructionBlocks,
  floorplan_id: null,
  floorplan_revision: null,
  route_overlay: null,
  version: 1,
  ...overrides,
});

const section = index => ({
  id: `section-${index}`,
  customer_id: "customer-saturn",
  object_id: "object-saturn",
  code: `S${index}`,
  name: `Sectie ${index}`,
  status: "active",
  version: 1,
});

function inMemoryEntity(initial = [], prefix = "record") {
  const records = initial.map(record => structuredClone(record));
  const writes = { creates: 0, updates: 0 };
  const matches = (record, query) => Object.entries(query || {}).every(([key, value]) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (Object.hasOwn(value, "$in")) return value.$in.includes(record[key]);
      if (Object.hasOwn(value, "$exists")) return value.$exists ? Object.hasOwn(record, key) : !Object.hasOwn(record, key);
    }
    return record[key] === value;
  });
  return {
    records,
    writes,
    async get(id) {
      return records.find(record => record.id === id) || null;
    },
    async filter(query) {
      return records.filter(record => matches(record, query));
    },
    async create(data) {
      writes.creates += 1;
      const record = { id: `${prefix}-${records.length + 1}`, ...structuredClone(data) };
      records.push(record);
      return record;
    },
    async updateMany(query, update) {
      const index = records.findIndex(record => matches(record, query));
      if (index < 0) return { success: true, updated: 0 };
      writes.updates += 1;
      records[index] = {
        ...records[index],
        ...(update.$set || {}),
      };
      for (const [key, increment] of Object.entries(update.$inc || {})) {
        records[index][key] = Number(records[index][key] || 0) + Number(increment);
      }
      return { success: true, updated: 1 };
    },
  };
}

function migrationBackend(plans) {
  const entities = {
    Customer: inMemoryEntity([{ id: "customer-saturn", status: "active" }], "customer"),
    SurveillanceObject: inMemoryEntity([{ id: "object-saturn", customer_id: "customer-saturn", status: "active" }], "object"),
    ObjectSecurityPlan: inMemoryEntity(plans, "plan"),
    ObjectSecurityPlanRevision: inMemoryEntity([], "revision"),
  };
  return { base44: { asServiceRole: { entities } }, entities };
}

describe("customerPlatformApi Beveiligingsplan V2", () => {
  it("telt categorieen over alle actuele plannen zonder draft en publicatie als exclusief te behandelen", () => {
    const summary = backend.securityPlanCategorySummary([
      plan({ id: "plan-draft", has_draft: true, has_publication: false, readiness: { readiness_status: "ready" } }),
      plan({
        id: "plan-published-with-draft",
        has_draft: true,
        has_publication: true,
        readiness: { readiness_status: "attention" },
      }),
      plan({
        id: "plan-reception",
        task_type: "reception",
        has_draft: false,
        has_publication: true,
        readiness: { readiness_status: "ready" },
      }),
      plan({
        id: "plan-legacy",
        task_type: "other",
        has_draft: true,
        has_publication: false,
        migration_required: true,
        readiness: { readiness_status: "ready" },
      }),
      plan({ id: "plan-archived", status: "archived", has_draft: true, readiness: { readiness_status: "blocked" } }),
    ]);

    expect(summary).toHaveLength(12);
    expect(summary.find(item => item.task_type === "fire_closing_round")).toEqual({
      task_type: "fire_closing_round",
      total: 2,
      published: 1,
      draft: 2,
      attention: 1,
    });
    expect(summary.find(item => item.task_type === "reception")).toEqual({
      task_type: "reception",
      total: 1,
      published: 1,
      draft: 0,
      attention: 0,
    });
    expect(summary.find(item => item.task_type === "other")).toMatchObject({ total: 1, attention: 1 });
    expect(summary.find(item => item.task_type === "opening_round")).toMatchObject({ total: 0, published: 0, draft: 0, attention: 0 });
    expect(backend.currentSecurityPlanMigrationRequiredCount([
      { status: "draft", migration_required: true },
      { status: "published", migration_required: false },
      { status: "archived", migration_required: true },
    ])).toBe(1);
  });

  it("accepteert Saturns hybride sectieplan en houdt de ontbrekende route als waarschuwing", () => {
    const sections = Array.from({ length: 8 }, (_, index) => section(index + 1));
    const result = backend.securityPlanStructuralReadiness(
      plan(),
      revision({
        section_policy: "default_with_controlled_override",
        default_section_ids: ["section-1", "section-2"],
        allowed_section_ids: sections.map(item => item.id),
      }),
      sections,
    );

    expect(result).toMatchObject({
      ready_to_publish: true,
      readiness_status: "attention",
      blocking_issues: [],
    });
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "route_missing" }));
  });

  it("onderscheidt geen route van een werkelijk ingetekende route zonder plattegrond", () => {
    const noRoute = backend.securityPlanStructuralReadiness(
      plan(),
      revision({
        instruction_blocks: [{
          ...instructionBlocks[0],
          steps: [{ ...instructionBlocks[0].steps[0], section_id: null }],
        }],
        route_overlay: null,
      }),
    );
    expect(noRoute.ready_to_publish).toBe(true);
    expect(noRoute.warnings).toContainEqual(expect.objectContaining({ code: "route_missing" }));

    const routeWithoutFloorplan = backend.securityPlanStructuralReadiness(
      plan(),
      revision({
        instruction_blocks: [{
          ...instructionBlocks[0],
          steps: [{ ...instructionBlocks[0].steps[0], section_id: null }],
        }],
        route_overlay: {
          path: [{ x: 0.1, y: 0.1, sequence: 1 }, { x: 0.9, y: 0.9, sequence: 2 }],
          markers: [],
        },
      }),
    );
    expect(routeWithoutFloorplan.ready_to_publish).toBe(false);
    expect(routeWithoutFloorplan.blocking_issues).toContainEqual(expect.objectContaining({ code: "route_floorplan_missing" }));
  });

  it("blokkeert ongeldige vaste duur, lege scope en een standaardsectie buiten de allowed set", () => {
    const sections = [section(1), section(2)];
    const result = backend.securityPlanStructuralReadiness(
      plan(),
      revision({
        duration_minutes: null,
        section_policy: "default_with_controlled_override",
        default_section_ids: ["section-1", "section-2"],
        allowed_section_ids: ["section-1"],
      }),
      sections,
    );

    expect(result.ready_to_publish).toBe(false);
    expect(result.blocking_issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      "fixed_duration_missing",
      "default_section_not_allowed",
    ]));

    const emptyFixed = backend.securityPlanStructuralReadiness(
      plan(),
      revision({ section_policy: "fixed", default_section_ids: [], allowed_section_ids: [] }),
      sections,
    );
    expect(emptyFixed.blocking_issues).toContainEqual(expect.objectContaining({ code: "fixed_sections_missing" }));
  });

  it("laat schedule_defined en none zonder duur toe", () => {
    const reception = plan({ task_type: "reception", execution_mode: "continuous_post", variant_name: "Weekend" });
    for (const durationMode of ["schedule_defined", "none"]) {
      const result = backend.securityPlanStructuralReadiness(
        reception,
        revision({
          duration_mode: durationMode,
          duration_minutes: null,
          instruction_blocks: [{
            ...instructionBlocks[0],
            steps: [{ ...instructionBlocks[0].steps[0], section_id: null }],
          }],
        }),
      );
      expect(result.blocking_issues).not.toContainEqual(expect.objectContaining({ code: "fixed_duration_missing" }));
      expect(result.ready_to_publish).toBe(true);
    }
  });

  it("weigert geheimvelden recursief en bewaart alleen een installatiereferentie", () => {
    expect(() => backend.assertNoSecurityPlanSecretFields({
      instruction_blocks: [{ steps: [{ alarm_code: "1234" }] }],
    })).toThrow(/hoort niet in een beveiligingsplan/i);
    expect(() => backend.assertNoSecurityPlanSecretFields({
      route_overlay: { markers: [{ metadata: { raw_file_url: "https://storage.example/secret" } }] },
    })).toThrow(/hoort niet in een beveiligingsplan/i);
    expect(() => backend.assertNoSecurityPlanSecretFields({
      instruction_blocks: [{ steps: [{ instruction: "Alarmcode: 1234" }] }],
    })).toThrow(/gevoelige code-inhoud.*beveiligde installatiegegevens/i);
    expect(() => backend.assertNoSecurityPlanSecretFields({
      instruction_blocks: [{ steps: [{ instruction: "Pincode=9876" }] }],
    })).toThrow(/gevoelige code-inhoud.*beveiligde installatiegegevens/i);
    expect(() => backend.assertNoSecurityPlanSecretFields({
      instruction_blocks: [{ steps: [{ instruction: "Schakel het alarm na de laatste controle in." }] }],
    })).not.toThrow();
    expect(() => backend.assertNoSecurityPlanSecretFields({
      instruction_blocks: [{ steps: [{ instruction: "Postcode: 1234 AB; objectcode: SAT-01." }] }],
    })).not.toThrow();
    expect(() => backend.assertNoSecurityPlanSecretFields({
      instruction_blocks: [{ steps: [{ installation_id: "installation-1" }] }],
    })).not.toThrow();
  });

  it("normaliseert routeankers schema-conform en fixed-secties als hun eigen allowed set", () => {
    const normalized = backend.normalizedSecurityPlanRevisionData({
      duration_mode: "fixed",
      duration_minutes: 30,
      section_policy: "fixed",
      default_section_ids: ["section-1"],
      allowed_section_ids: [],
      instruction_blocks: instructionBlocks,
      floorplan_id: "floorplan-1",
      floorplan_revision: 3,
      route_overlay: {
        start_point: { x: 0.1, y: 0.2, sequence: 99 },
        end_point: { x: 0.8, y: 0.9, sequence: 100 },
        path: [{ x: 0.1, y: 0.2 }, { x: 0.8, y: 0.9 }],
        markers: [],
      },
    });

    expect(normalized.allowed_section_ids).toEqual(["section-1"]);
    expect(normalized.route_overlay.start_point).toEqual({ x: 0.1, y: 0.2, label: null });
    expect(normalized.route_overlay.end_point).toEqual({ x: 0.8, y: 0.9, label: null });
    expect(normalized.route_overlay.start_point).not.toHaveProperty("sequence");
  });

  it("laat lifecycle-, publicatie- en checksumvelden nooit uit een conceptpayload door", () => {
    const normalized = backend.normalizedSecurityPlanRevisionData({
      status: "published",
      revision_number: 99,
      content_checksum: "door-client-gefingeerd",
      published_at: "2026-08-05T10:00:00.000Z",
      published_by_user_id: "andere-gebruiker",
      superseded_at: "2026-08-05T11:00:00.000Z",
      duration_mode: "none",
      section_policy: "not_applicable",
      instruction_blocks: instructionBlocks,
    });

    expect(normalized).not.toHaveProperty("status");
    expect(normalized).not.toHaveProperty("revision_number");
    expect(normalized).not.toHaveProperty("content_checksum");
    expect(normalized).not.toHaveProperty("published_at");
    expect(normalized).not.toHaveProperty("published_by_user_id");
    expect(normalized).not.toHaveProperty("superseded_at");
  });

  it("synthetiseert legacydata read-only en markeert deze altijd voor review", () => {
    const legacy = {
      id: "legacy-plan",
      customer_id: "customer-saturn",
      object_id: "object-saturn",
      category: "fire_closing_round",
      title: "Bestaande ronde",
      description: "Bestaande omschrijving",
      scope_type: "partial",
      duration_minutes: 20,
      instructions: ["Eerste stap", "Tweede stap"],
      status: "active",
      version: 3,
    };

    expect(backend.securityPlanMigrationRequired(legacy)).toBe(true);
    const synthesized = backend.synthesizedLegacySecurityPlanRevision(legacy);
    expect(synthesized).toMatchObject({
      status: "draft",
      duration_mode: "fixed",
      duration_minutes: 20,
      section_policy: "not_applicable",
      synthesized_from_legacy: true,
      read_only: true,
      migration_source: "legacy_object_security_plan",
      migration_review_required: true,
    });
    expect(synthesized.instruction_blocks[0].steps.map(step => step.instruction)).toEqual([
      "Eerste stap",
      "Tweede stap",
    ]);
  });

  it("maakt de standaard legacy-dry-run volledig read-only", async () => {
    const { base44, entities } = migrationBackend([{
      id: "legacy-active",
      customer_id: "customer-saturn",
      object_id: "object-saturn",
      category: "reception",
      title: "Receptie bestaand",
      status: "active",
      version: 2,
    }]);

    const result = await backend.handleMigrateLegacyObjectSecurityPlans(
      base44,
      { id: "admin-1" },
      { customer_id: "customer-saturn", object_id: "object-saturn" },
      0,
      "migration-key",
    );

    expect(result).toMatchObject({
      dry_run: true,
      migrated_count: 0,
      would_migrate_count: 1,
      review_required_count: 1,
    });
    expect(result.items).toContainEqual(expect.objectContaining({
      security_plan_id: "legacy-active",
      status: "would_migrate",
      review_required: true,
    }));
    expect(Object.values(entities).flatMap(entity => [entity.writes.creates, entity.writes.updates])).toEqual([
      0, 0,
      0, 0,
      0, 0,
      0, 0,
    ]);
  });

  it("migreert active naar draft, behoudt archived en redigeert legacycodes", async () => {
    const { base44, entities } = migrationBackend([
      {
        id: "legacy-active",
        customer_id: "customer-saturn",
        object_id: "object-saturn",
        category: "fire_closing_round",
        title: "Avondronde",
        description: "Algemene ronde",
        instructions: ["Alarmcode: 1234", "Sluit de expeditie."],
        status: "active",
        version: 2,
      },
      {
        id: "legacy-archived",
        customer_id: "customer-saturn",
        object_id: "object-saturn",
        category: "opening_round",
        title: "Oude openingsronde",
        instructions: ["Open de hoofdingang."],
        status: "archived",
        version: 1,
      },
    ]);

    const result = await backend.handleMigrateLegacyObjectSecurityPlans(
      base44,
      { id: "admin-1" },
      { customer_id: "customer-saturn", object_id: "object-saturn", dry_run: false },
      0,
      "migration-key",
    );

    expect(result).toMatchObject({ dry_run: false, migrated_count: 2, review_required_count: 2 });
    expect(entities.ObjectSecurityPlan.records.find(item => item.id === "legacy-active")).toMatchObject({
      status: "draft",
      migration_source: "legacy_object_security_plan",
      migration_review_required: true,
      draft_revision_id: expect.any(String),
    });
    expect(entities.ObjectSecurityPlan.records.find(item => item.id === "legacy-archived")).toMatchObject({
      status: "archived",
      migration_review_required: true,
    });
    expect(entities.ObjectSecurityPlanRevision.records).toHaveLength(2);
    const activeRevision = entities.ObjectSecurityPlanRevision.records.find(item => item.security_plan_id === "legacy-active");
    expect(activeRevision).toMatchObject({
      status: "draft",
      migration_source: "legacy_object_security_plan",
      migration_review_required: true,
    });
    expect(activeRevision.instruction_blocks[0].steps.map(step => step.instruction)).toEqual([
      "[Gevoelige legacy-informatie niet overgenomen; koppel de beveiligde installatiegegevens opnieuw.]",
      "Sluit de expeditie.",
    ]);

    expect(entities.ObjectSecurityPlan.records.map(item => backend.securityPlanMigrationRequired(item))).toEqual([false, false]);

    const replay = await backend.handleMigrateLegacyObjectSecurityPlans(
      base44,
      { id: "admin-1" },
      { customer_id: "customer-saturn", object_id: "object-saturn", dry_run: false },
      0,
      "migration-key",
    );
    expect(replay).toMatchObject({ migrated_count: 2, review_required_count: 2 });
    expect(replay.items.every(item => item.status === "migrated_to_draft")).toBe(true);
    expect(entities.ObjectSecurityPlanRevision.records).toHaveLength(2);

    const laterAudit = await backend.handleMigrateLegacyObjectSecurityPlans(
      base44,
      { id: "admin-1" },
      { customer_id: "customer-saturn", object_id: "object-saturn", dry_run: false },
      0,
      "later-migration-key",
    );
    expect(laterAudit.items.every(item => item.status === "already_migrated")).toBe(true);
    expect(entities.ObjectSecurityPlanRevision.records).toHaveLength(2);
  });

  it("serialiseert plan-, module-, sectie- en migratiemutaties per object", async () => {
    let state = {
      id: "object-saturn",
      customer_id: "customer-saturn",
      status: "active",
      version: 7,
      security_plan_mutation_lock: null,
    };
    const objectEntity = {
      get: async id => id === state.id ? structuredClone(state) : null,
      updateMany: async (query, update) => {
        const legacyVersionMatches = query.$or?.some(condition => (
          Object.hasOwn(condition, "security_plan_mutation_lock_version")
          && state.security_plan_mutation_lock_version == null
        ));
        const persistedVersionMatches = query.security_plan_mutation_lock_version === state.security_plan_mutation_lock_version;
        if (query.id !== state.id || (!legacyVersionMatches && !persistedVersionMatches)) {
          return { success: true, updated: 0 };
        }
        state = {
          ...state,
          ...(update.$set || {}),
          security_plan_mutation_lock_version: Number(
            update.$set?.security_plan_mutation_lock_version
              ?? state.security_plan_mutation_lock_version
              ?? 0,
          ) + Number(update.$inc?.security_plan_mutation_lock_version || 0),
        };
        return { success: true, updated: 1 };
      },
    };
    const base44 = { asServiceRole: { entities: { SurveillanceObject: objectEntity } } };
    const user = { id: "admin-1" };

    const outcomes = await Promise.allSettled([
      backend.reserveSecurityPlanMutation(
        base44, user, "object-saturn", "create_object_security_plan", "key-a", "fingerprint-a", "target-a",
      ),
      backend.reserveSecurityPlanMutation(
        base44, user, "object-saturn", "set_object_module_status", "key-module", "fingerprint-module", "target-module",
      ),
      backend.reserveSecurityPlanMutation(
        base44, user, "object-saturn", "upsert_object_section", "key-b", "fingerprint-b", "target-b",
      ),
    ]);

    expect(outcomes.filter(outcome => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(outcome => outcome.status === "rejected")).toHaveLength(2);
    for (const outcome of outcomes.filter(item => item.status === "rejected")) {
      expect(outcome.reason).toMatchObject({
        status: 409,
        details: expect.objectContaining({ retryable: true }),
      });
    }
    expect(state.version).toBe(7);
    expect(state.security_plan_mutation_lock).toMatchObject({
      actor_id: "admin-1",
      action: expect.stringMatching(/create_object_security_plan|set_object_module_status|upsert_object_section/),
    });

    const reservation = outcomes.find(outcome => outcome.status === "fulfilled").value;
    await backend.releaseSecurityPlanMutation(base44, reservation);
    expect(state.security_plan_mutation_lock).toBeNull();
    await expect(backend.reserveSecurityPlanMutation(
      base44, user, "object-saturn", "migrate_legacy_object_security_plans", "key-c", "fingerprint-c", "target-c",
    )).resolves.toMatchObject({ object_id: "object-saturn" });
  });
});
