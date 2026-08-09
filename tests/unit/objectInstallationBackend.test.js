import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from "node:util";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  AJAX_CONTROL_DEVICE_OPTIONS,
  AJAX_CONTROL_DEVICE_VARIANTS,
  findAjaxControlDevice,
} from "@/components/objects/objectInstallationManuals";

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
      ajaxManualArticleDefinitions,
      installationMutationMarkerReplay,
      normalizedHandbookBlocks,
      objectHandbookState,
      reconcileInstallationHandbooks,
      releaseObjectInstallationMutation,
      requireNoRetiringInstallationHandbookLinks,
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

  it("accepteert alle generieke Ajax-bedieningswijzen en leidt de handleiding server-side af", () => {
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

  it("blijft exacte legacy-paneelsleutels server-side accepteren en bewaren", () => {
    for (const variant of AJAX_CONTROL_DEVICE_VARIANTS) {
      const option = findAjaxControlDevice(variant.value);
      const result = backend.normalizedInstallationData(installationData({
        control_device_key: variant.value,
        control_device_name: "Vervalste naam",
        manual_key: "client:mag:dit:niet:bepalen",
        manual_version: "999",
      }));
      expect(result).toMatchObject({
        control_device_key: variant.value,
        control_device_name: variant.label,
        manual_key: variant.manualKey || option.manualKey,
        manual_version: option.manualVersion,
      });
    }
  });

  it("geeft zowel de generieke als exact opgeslagen KeyPad Combi de actuele zoemerhandleiding", () => {
    expect(backend.normalizedInstallationData(installationData({
      control_device_key: "keypad-combi",
    }))).toMatchObject({
      control_device_key: "keypad-combi",
      control_device_name: "KeyPad Combi",
      manual_key: "ajax:numeric-reader-buzzer-keypad:nl",
    });
    expect(backend.normalizedInstallationData(installationData({
      control_device_key: "keypad-combi-jeweller",
    }))).toMatchObject({
      control_device_key: "keypad-combi-jeweller",
      control_device_name: "KeyPad Combi Jeweller",
      manual_key: "ajax:numeric-reader-buzzer-keypad:nl",
      manual_version: "2026.08.2",
    });
  });

  it("genereert per Ajax-bedieningsfamilie alleen toepasselijke handboekartikelen", () => {
    const families = [
      ["ajax:numeric-keypad:nl", "KeyPad", "ajax:image:keypad:functional", 6],
      ["ajax:numeric-reader-keypad:nl", "KeyPad Plus", "ajax:image:keypad-plus:functional", 6],
      ["ajax:numeric-reader-buzzer-keypad:nl", "KeyPad Combi", "ajax:image:keypad-combi:functional", 7],
      ["ajax:touchscreen-keypad:nl", "KeyPad TouchScreen", "ajax:image:touchscreen:functional", 6],
      ["ajax:outdoor-keypad:nl", "KeyPad Outdoor", "ajax:image:outdoor:functional", 6],
      ["ajax:app-control:nl", "Ajax-app", null, 6],
    ];

    for (const [manualKey, controlDeviceName, functionalAsset, expectedCount] of families) {
      const definitions = backend.ajaxManualArticleDefinitions({
        id: `installation-${controlDeviceName}`,
        name: "Hoofdcentrale",
        manual_key: manualKey,
        control_device_name: controlDeviceName,
      });
      const keys = definitions.map(definition => definition.key);
      const blocks = definitions.flatMap(definition => definition.blocks);

      expect(definitions).toHaveLength(expectedCount);
      expect(keys).toEqual(expect.arrayContaining([
        "overview",
        "arm",
        "disarm",
        "night-mode",
        "groups",
        "one-time-deactivation",
      ]));
      expect(new Set(keys).size).toBe(keys.length);
      expect(definitions.every(definition => definition.sources.every(url => url.startsWith("https://ajax.systems/")))).toBe(true);
      if (functionalAsset) expect(blocks).toContainEqual(expect.objectContaining({ type: "image", asset_key: functionalAsset }));
      expect(blocks.filter(block => block.type === "image").map(block => block.asset_key)).toEqual(expect.arrayContaining([
        "ajax:image:bypass:device",
        "ajax:image:bypass:settings",
        "ajax:image:bypass:choice",
        "ajax:image:bypass:result",
      ]));
      expect(JSON.stringify(definitions)).not.toContain("1234");
    }

    const combi = backend.ajaxManualArticleDefinitions({
      id: "installation-combi",
      name: "Hoofdcentrale",
      manual_key: "ajax:numeric-reader-buzzer-keypad:nl",
      control_device_name: "KeyPad Combi",
    });
    expect(combi.map(definition => definition.key)).toContain("buzzer-signals");
  });

  it("accepteert alleen veilige handboekblokken en objectgebonden media of verwijzingen", async () => {
    const object = { id: "object-1", customer_id: "customer-1" };
    const base44 = {
      asServiceRole: {
        entities: {
          ManagedFile: {
            get: vi.fn(async id => ({ id, object_id: "object-2", status: "active", mime_type: "image/png" })),
          },
          ObjectHandbookArticle: {
            get: vi.fn(async id => ({ id, customer_id: "customer-2", object_id: "object-2", status: "active" })),
          },
        },
      },
    };

    await expect(backend.normalizedHandbookBlocks(base44, object, [
      { id: "unsafe-html", type: "paragraph", text: "<img src=x onerror=alert(1)>" },
    ])).rejects.toMatchObject({ status: 400 });
    await expect(backend.normalizedHandbookBlocks(base44, object, [
      { id: "remote-image", type: "image", asset_key: "https://example.invalid/image.jpg", alt: "Onveilig" },
    ], { allowOfficialAssets: true })).rejects.toMatchObject({ status: 400 });
    await expect(backend.normalizedHandbookBlocks(base44, object, [
      { id: "foreign-image", type: "image", managed_file_id: "file-2", alt: "Ander object" },
    ])).rejects.toMatchObject({ status: 409 });
    await expect(backend.normalizedHandbookBlocks(base44, object, [
      { id: "foreign-link", type: "link", target_type: "article", target_id: "article-2", label: "Ander object" },
    ])).rejects.toMatchObject({ status: 409 });
    await expect(backend.normalizedHandbookBlocks(base44, object, [
      { id: "duplicate", type: "paragraph", text: "Eerste" },
      { id: "duplicate", type: "paragraph", text: "Tweede" },
    ])).rejects.toMatchObject({ status: 400 });

    await expect(backend.normalizedHandbookBlocks(base44, object, [
      { id: "official-image", type: "image", asset_key: "ajax:image:keypad:functional", alt: "Ajax KeyPad", layout: "contained" },
      { id: "official-buttons", type: "button_sequence", sequence: [{ type: "icon", value: "ajax:icon:armed", label: "Inschakelen" }] },
    ], { allowOfficialAssets: true })).resolves.toEqual([
      { id: "official-image", type: "image", asset_key: "ajax:image:keypad:functional", managed_file_id: null, alt: "Ajax KeyPad", caption: null, layout: "contained" },
      { id: "official-buttons", type: "button_sequence", sequence: [{ type: "icon", value: "ajax:icon:armed", label: "Inschakelen" }] },
    ]);
  });

  it("accepteert uitsluitend kleine private JPEG-, PNG- of WebP-handboekafbeeldingen met exacte objectscope", async () => {
    const object = { id: "object-1", customer_id: "customer-1" };
    const validFile = {
      id: "valid",
      owner_type: "object",
      owner_id: object.id,
      object_id: object.id,
      domain: "operations",
      category: "handbook",
      source_entity: "ObjectHandbookArticle",
      storage_visibility: "private",
      status: "active",
      mime_type: "image/png",
      size_bytes: 1024,
    };
    const files = new Map([
      ["valid", validFile],
      ["owner-mismatch", { ...validFile, id: "owner-mismatch", owner_id: "object-2" }],
      ["object-mismatch", { ...validFile, id: "object-mismatch", object_id: "object-2" }],
      ["wrong-domain", { ...validFile, id: "wrong-domain", domain: "personnel" }],
      ["wrong-category", { ...validFile, id: "wrong-category", category: "other" }],
      ["wrong-source", { ...validFile, id: "wrong-source", source_entity: "OtherEntity" }],
      ["public", { ...validFile, id: "public", storage_visibility: "public" }],
      ["inactive", { ...validFile, id: "inactive", status: "superseded" }],
      ["svg", { ...validFile, id: "svg", mime_type: "image/svg+xml" }],
      ["oversized", { ...validFile, id: "oversized", size_bytes: 10 * 1024 * 1024 + 1 }],
      ["missing-size", { ...validFile, id: "missing-size", size_bytes: null }],
    ]);
    const base44 = {
      asServiceRole: {
        entities: {
          ManagedFile: { get: vi.fn(async id => clone(files.get(id)) || null) },
        },
      },
    };

    await expect(backend.normalizedHandbookBlocks(base44, object, [
      { id: "valid-image", type: "image", managed_file_id: "valid", alt: "Objectfoto" },
    ])).resolves.toEqual([
      expect.objectContaining({ id: "valid-image", managed_file_id: "valid", asset_key: null }),
    ]);

    for (const id of [...files.keys()].filter(id => id !== "valid")) {
      await expect(backend.normalizedHandbookBlocks(base44, object, [
        { id: `image-${id}`, type: "image", managed_file_id: id, alt: "Objectfoto" },
      ])).rejects.toMatchObject({ status: 409 });
    }
  });

  it("weigert een onbekend Ajax-paneel en wist handleidingvelden bij andere merken", () => {
    expect(() => backend.normalizedInstallationData(installationData({ control_device_key: "onbekend-paneel" }))).toThrow(/Ajax-bedieningswijze/);
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

  it("blokkeert een verdwijnend installatieartikel met een gebruikersverwijzing, maar negeert zelf verdwijnende bronartikelen", async () => {
    const object = { id: "object-1", customer_id: "customer-1" };
    const installation = {
      id: "installation-1",
      customer_id: object.customer_id,
      object_id: object.id,
      installation_type: "alarm_system",
      brand: "Ajax Systems",
      control_device_key: "keypad-combi",
      lifecycle_status: "active",
    };
    const generatedArm = {
      id: "generated-arm",
      title: "Volledig inschakelen",
      origin: "installation_template",
      source_installation_id: installation.id,
      source_procedure_key: "arm",
      status: "active",
    };
    const userArticle = {
      id: "user-article",
      title: "Openingsprocedure receptie",
      origin: "user",
      status: "active",
      managed_blocks: [],
      supplement_blocks: [{
        id: "arm-link",
        type: "link",
        target_type: "article",
        target_id: generatedArm.id,
        target_key: `installation/${installation.id}/article/arm`,
      }],
    };
    const entities = articles => ({
      ObjectHandbookCategory: { filter: vi.fn(async () => []) },
      ObjectHandbookArticle: { filter: vi.fn(async () => clone(articles)) },
    });

    await expect(backend.requireNoRetiringInstallationHandbookLinks(
      { asServiceRole: { entities: entities([generatedArm, userArticle]) } },
      object,
      installation,
      { ...installation, lifecycle_status: "archived", status: "archived" },
    )).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("Openingsprocedure receptie"),
      details: expect.objectContaining({ code: "installation_handbook_inbound_links" }),
    });

    const disappearingGeneratedSource = {
      id: "generated-groups",
      title: "Een groep bedienen",
      origin: "installation_template",
      source_installation_id: installation.id,
      source_procedure_key: "groups",
      status: "active",
      managed_blocks: [],
      supplement_blocks: userArticle.supplement_blocks,
    };
    await expect(backend.requireNoRetiringInstallationHandbookLinks(
      { asServiceRole: { entities: entities([generatedArm, disappearingGeneratedSource]) } },
      object,
      installation,
      { ...installation, lifecycle_status: "archived", status: "archived" },
    )).resolves.toBeUndefined();
  });

  it("genereert actuele artikelen vanuit een afgeleide paneelmapping zonder de installatiesnapshot te herschrijven", async () => {
    const object = { id: "object-1", customer_id: "customer-1" };
    const installation = {
      id: "installation-legacy",
      customer_id: object.customer_id,
      object_id: object.id,
      name: "Historische Ajax-installatie",
      installation_type: "alarm_system",
      brand: "Ajax Systems",
      control_device_key: "keypad-combi-jeweller",
      control_device_name: "Historische paneelnaam",
      manual_key: "ajax:legacy-combi:nl",
      manual_version: "2026.08.1",
      lifecycle_status: "active",
      status: "active",
      version: 4,
    };
    const installationRecords = [clone(installation)];
    const categoryRecords = [];
    const articleRecords = [];
    const matches = (record, query) => Object.entries(query).every(([field, value]) => (
      value && typeof value === "object" ? true : record[field] === value
    ));
    const memoryEntity = (prefix, records) => ({
      get: vi.fn(async id => clone(records.find(record => record.id === id)) || null),
      filter: vi.fn(async query => records.filter(record => matches(record, query)).map(clone)),
      create: vi.fn(async data => {
        const created = { id: `${prefix}-${records.length + 1}`, created_date: new Date().toISOString(), ...clone(data) };
        records.push(created);
        return clone(created);
      }),
      updateMany: vi.fn(async () => ({ success: true, updated: 0 })),
    });
    const installationEntity = memoryEntity("installation", installationRecords);
    const categoryEntity = memoryEntity("category", categoryRecords);
    const articleEntity = memoryEntity("article", articleRecords);
    const base44 = {
      asServiceRole: {
        entities: {
          ObjectInstallation: installationEntity,
          ObjectHandbookCategory: categoryEntity,
          ObjectHandbookArticle: articleEntity,
        },
      },
    };

    const counters = await backend.reconcileInstallationHandbooks(base44, object);

    expect(counters).toMatchObject({ created_articles: 7, upgraded_installations: 0 });
    expect(installationEntity.updateMany).not.toHaveBeenCalled();
    expect(installationRecords[0]).toEqual(installation);
    expect(articleRecords).toEqual(expect.arrayContaining([
      expect.objectContaining({
        article_key: expect.stringContaining("/ajax:numeric-reader-buzzer-keypad:nl/2026.08.2/"),
        source_manual_key: "ajax:numeric-reader-buzzer-keypad:nl",
        source_manual_version: "2026.08.2",
      }),
    ]));

    const handbookState = await backend.objectHandbookState(base44, { id: object.customer_id }, object);
    expect(handbookState.syncRequired).toBe(false);
    expect(installationRecords[0]).toEqual(installation);
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

  it("reserveert en releaset dezelfde objectlock tijdens herstel via een installatiemarkering", async () => {
    const idempotencyKey = "installation-recovery-key";
    const requestFingerprint = "recovery-fingerprint";
    const target = "ObjectInstallation:installation-1";
    const keyHash = createHash("sha256").update(idempotencyKey).digest("hex");
    const user = { id: "admin-1" };
    const body = {
      customer_id: "customer-1",
      object_id: "object-1",
      installation_id: "installation-1",
    };
    const recoveryResult = {
      installation: { id: body.installation_id },
      customer_id: body.customer_id,
      object_id: body.object_id,
      archived: true,
    };
    const installation = {
      id: body.installation_id,
      customer_id: body.customer_id,
      object_id: body.object_id,
      name: "Hoofdcentrale",
      installation_type: "alarm_system",
      brand: "Ajax Systems",
      lifecycle_status: "archived",
      status: "archived",
      version: 2,
      customer_platform_last_mutation_key_hash: keyHash,
      customer_platform_last_mutation_recovery: {
        action: "archive_object_installation",
        actor_id: user.id,
        request_fingerprint: requestFingerprint,
        mutation_target: target,
        result: recoveryResult,
      },
    };
    let objectState = {
      id: body.object_id,
      customer_id: body.customer_id,
      status: "active",
      version: 6,
      installation_mutation_lock: null,
    };
    const objectEntity = {
      get: vi.fn(async id => id === objectState.id ? clone(objectState) : null),
      updateMany: vi.fn(async (query, update) => {
        const legacyVersionMatches = query.$or?.some(condition => (
          Object.hasOwn(condition, "installation_mutation_lock_version")
          && objectState.installation_mutation_lock_version == null
        ));
        const persistedVersionMatches = query.installation_mutation_lock_version === objectState.installation_mutation_lock_version;
        if (query.id !== objectState.id || (!legacyVersionMatches && !persistedVersionMatches)) {
          return { success: true, updated: 0 };
        }
        objectState = {
          ...objectState,
          ...(update.$set || {}),
          installation_mutation_lock_version: Number(
            update.$set?.installation_mutation_lock_version
              ?? objectState.installation_mutation_lock_version
              ?? 0,
          ) + Number(update.$inc?.installation_mutation_lock_version || 0),
        };
        return { success: true, updated: 1 };
      }),
    };
    const installationEntity = {
      get: vi.fn(async id => id === installation.id ? clone(installation) : null),
      filter: vi.fn(async () => [clone(installation)]),
      updateMany: vi.fn(async () => ({ success: true, updated: 0 })),
    };
    const base44 = {
      asServiceRole: {
        entities: {
          Customer: { get: vi.fn(async id => id === body.customer_id ? { id, status: "active" } : null) },
          SurveillanceObject: objectEntity,
          ObjectInstallation: installationEntity,
          ObjectHandbookCategory: { filter: vi.fn(async () => []) },
          ObjectHandbookArticle: { filter: vi.fn(async () => []) },
        },
      },
    };

    await expect(backend.installationMutationMarkerReplay(
      base44,
      user,
      "archive_object_installation",
      body,
      idempotencyKey,
      requestFingerprint,
      target,
    )).resolves.toMatchObject({ archived: true, installation: { id: installation.id } });

    expect(objectEntity.updateMany).toHaveBeenCalledTimes(2);
    expect(objectState.installation_mutation_lock).toBeNull();
    expect(objectState.installation_mutation_lock_version).toBe(2);
    expect(installationEntity.updateMany).not.toHaveBeenCalled();
  });
});
