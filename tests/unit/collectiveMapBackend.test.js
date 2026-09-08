import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { webcrypto } from "node:crypto";
import { TextDecoder, TextEncoder } from "node:util";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inlineBackendImports } from "../helpers/inlineBackendImports";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const entryPath = path.join(root, "base44/functions/customerPlatformApi/entry.ts");
let api;
beforeAll(async () => {
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
  globalThis.Uint8Array = new TextEncoder().encode("").constructor;
  const source = fs.readFileSync(entryPath, "utf8").replace(
    /^import \{ createClientFromRequest \} from 'npm:@base44\/sdk@[^']+';$/m,
    "const createClientFromRequest = () => globalThis.__collectiveMapTestBase44;",
  );
  const { transform } = await import("esbuild");
  const compiled = await transform(await inlineBackendImports(`${source}\nexport {
    handleGetObjectMapConfiguration, handleListObjectBuildingCandidates, handleListObjectParcelCandidates,
    handleUpdateObjectMapConfiguration, handleBuildingAssociationSuggestions, customerObjectMutationMarkerReplay,
    mutationRequestFingerprint, mutationTarget
  };`, entryPath), { format: "esm", loader: "ts", target: "es2022" });
  api = await import(`data:text/javascript;base64,${Buffer.from(`${compiled.code}\n//# sourceURL=collective-map-backend-entry.js`).toString("base64")}`);
});
beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => vi.unstubAllGlobals());

const admin = { id: "admin-1", role: "admin" };
const clone = value => structuredClone(value);
const collection = (...features) => ({ type: "FeatureCollection", features });
const ring = [[4.3, 52.1], [4.301, 52.1], [4.301, 52.101], [4.3, 52.101], [4.3, 52.1]];
const pdokFeature = (id = "bag-building-1") => ({ type: "Feature", id, properties: { identificatie: "0518100000012345", status: "Pand in gebruik" }, geometry: { type: "Polygon", coordinates: [ring] } });
const storedBuilding = () => ({ ...pdokFeature(), properties: { source: "pdok_bag", source_feature_id: "bag-building-1", source_identificatie: "0518100000012345", source_status: "Pand in gebruik" } });
const terrain = () => collection({ ...pdokFeature("terrain-1"), properties: { source: "user_drawn", local_id: "terrain-1" } });
const mapFields = () => ({
  latitude: 52.1005, longitude: 4.3005, geocoding_status: "verified", address: "Voorbeeldweg 1, Utrecht", status: "active", version: 3,
  building_selection_mode: "automatic", map_geometry_status: "unconfigured", map_geometry_revision: 0,
  building_polygon_geojson: null, building_selection_points: [], building_labels: {}, object_area_geojson: null,
});

function matches(row, query) {
  return Object.entries(query || {}).every(([key, expected]) => {
    if (key === "$or") return expected.some(part => matches(row, part));
    if (expected && typeof expected === "object" && !Array.isArray(expected)) {
      if ("$exists" in expected) return (row[key] !== undefined) === expected.$exists;
      if ("$all" in expected) return expected.$all.every(value => row[key]?.includes(value));
      if ("$in" in expected) return expected.$in.includes(row[key]);
    }
    return expected === null ? row[key] == null : row[key] === expected;
  });
}

function fixture(overrides = {}) {
  const rows = {
    Customer: [{ id: "customer-1", name: "Bestaande klant, alleen globale coordinator", status: "active", version: 1 }],
    Collectief: [{ ...mapFields(), id: "estate-1", name: "Woonwijk zonder beheerder", collectief_type: "woonwijk", customer_id: null, manager_customer_id: null, object_ids: [] }],
    SurveillanceObject: [{ ...mapFields(), id: "object-1", name: "Klantobject", customer_id: "customer-1", show_on_mobile_map: false }],
    CollectiveMembership: [], PhysicalBuilding: [], BuildingDossierLink: [], CollectiveMapGeometryRevision: [], ObjectMapGeometryRevision: [], CustomerEvent: [],
    CollectiveDossierEvent: [], CollectiveMutationReceipt: [], Task: [], ObjectTaskDefinition: [], CustomerContract: [], CustomerInvoice: [],
    ...overrides,
  };
  let sequence = 0;
  let failingCreate = null;
  const entities = Object.fromEntries(Object.keys(rows).map(name => [name, {
    get: vi.fn(async id => clone(rows[name].find(row => row.id === id) || null)),
    list: vi.fn(async (_sort, limit = 5000, skip = 0) => clone(rows[name].slice(skip, skip + limit))),
    filter: vi.fn(async (query, _sort, limit = 5000, skip = 0) => clone(rows[name].filter(row => matches(row, query)).slice(skip, skip + limit))),
    create: vi.fn(async data => {
      if (failingCreate === name) { failingCreate = null; throw new Error(`temporary ${name} outage`); }
      const row = { ...clone(data), id: `${name}-${++sequence}` }; rows[name].push(row); return clone(row);
    }),
    updateMany: vi.fn(async (query, update) => {
      const row = rows[name].find(item => matches(item, query));
      if (!row) return { success: true, updated: 0 };
      Object.assign(row, clone(update.$set || {}));
      Object.entries(update.$inc || {}).forEach(([key, value]) => { row[key] = (row[key] || 0) + value; });
      return { success: true, updated: 1 };
    }),
  }]));
  const base44 = { asServiceRole: { entities } };
  return { rows, entities, base44, failNextCreate: name => { failingCreate = name; } };
}

const saveBody = (data = {}, extra = {}) => ({
  action: "update_object_map_configuration", collective_id: "estate-1", expected_version: 3, idempotency_key: "collective-map-1",
  data: { building_selection_mode: "manual", selected_bag_feature_ids: ["bag-building-1"], object_area_geojson: terrain(), building_labels: { "bag:bag-building-1": "Portier" }, ...data },
  ...extra,
});
async function save(mock, body = saveBody(), user = admin) {
  return api.handleUpdateObjectMapConfiguration(mock.base44, user, body, body.expected_version, body.idempotency_key,
    await api.mutationRequestFingerprint(body.action, body), api.mutationTarget(body.action, body));
}
async function request(mock, body, user = admin) {
  mock.base44.auth = { me: vi.fn(async () => user) };
  vi.stubGlobal("__collectiveMapTestBase44", mock.base44);
  return api.handleCustomerPlatformRequest(new Request("https://backoffice.example.test/customerPlatformApi", {
    method: "POST", headers: { "Content-Type": "application/json", "x-request-id": "collective-test-request" }, body: JSON.stringify(body),
  }));
}
function mockPdok() {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(pdokFeature()), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
function expectNoOperationalWrites(mock) {
  for (const name of ["SurveillanceObject", "Task", "ObjectTaskDefinition", "CustomerContract", "CustomerInvoice"]) {
    expect(mock.entities[name].create).not.toHaveBeenCalled();
    expect(mock.entities[name].updateMany).not.toHaveBeenCalled();
  }
  expect(mock.rows.ObjectMapGeometryRevision).toHaveLength(0);
}
const attachmentBody = (extra = {}) => ({
  action: "confirm_building_association", expected_version: 3, idempotency_key: "reverse-attachment-1",
  confirmed: true, association_type: "join_collective", source_kind: "collective", source_id: "estate-1",
  collective_id: "estate-1", source_selection_key: "bag:bag-building-1", object_id: "object-1", apply_to_object_map: true,
  ...extra,
});

describe("collective map dossier integration", () => {
  it("gebruikt de echte beheerdersroute voor collectiefkaart lezen en opslaan zonder klantscope", async () => {
    const mock = fixture(); mockPdok();
    const read = await request(mock, { action: "get_object_map_configuration", collective_id: "estate-1" });
    expect(read.status).toBe(200);
    expect(await read.json()).toHaveProperty("configuration.collective_id", "estate-1");
    const mutation = await request(mock, saveBody());
    expect(mutation.status).toBe(200);
    expect(await mutation.json()).toMatchObject({ ok: true, configuration: { collective_id: "estate-1", version: 4 } });
    expectNoOperationalWrites(mock);
  });

  it("weigert ontbrekende beheerdersrechten vóór dossier- of kaarttoegang", async () => {
    const mock = fixture();
    const response = await request(mock, saveBody(), { id: "employee-1", role: "user" });
    expect(response.status).toBe(403);
    expect(mock.entities.Collectief.get).not.toHaveBeenCalled();
    expect(mock.entities.Collectief.updateMany).not.toHaveBeenCalled();
    expectNoOperationalWrites(mock);
  });

  it("leest een collectiefkaart zonder beheerder of fictief klantobject", async () => {
    const mock = fixture({ Customer: [], SurveillanceObject: [] });
    const result = await api.handleGetObjectMapConfiguration(mock.base44, { collective_id: "estate-1" });
    expect(result).toMatchObject({ configuration: { collective_id: "estate-1", object_id: null, customer_id: null, object: { id: "estate-1", customer_id: null, show_on_mobile_map: false } }, conflicts: [] });
    expect(mock.entities.Customer.list).not.toHaveBeenCalled();
    expect(mock.entities.SurveillanceObject.list).not.toHaveBeenCalled();
    expectNoOperationalWrites(mock);
  });

  it.each([{ customer_id: "customer-1" }, { object_id: "object-1" }, { customer_id: "customer-1", object_id: "object-1" }])("weigert gemengde object-/collectiefscope %j", async extra => {
    const mock = fixture();
    const body = { collective_id: "estate-1", ...extra };
    await expect(api.handleGetObjectMapConfiguration(mock.base44, body)).rejects.toMatchObject({ status: 400 });
    await expect(api.handleListObjectBuildingCandidates(mock.base44, body)).rejects.toMatchObject({ status: 400 });
    await expect(api.handleListObjectParcelCandidates(mock.base44, body)).rejects.toMatchObject({ status: 400 });
    await expect(save(mock, saveBody({}, extra))).rejects.toMatchObject({ status: 400 });
    expect(mock.entities.Collectief.updateMany).not.toHaveBeenCalled();
  });

  it("slaat BAG en terrein alleen op in het collectief met bestaande globale coordinator", async () => {
    const mock = fixture(); const fetchMock = mockPdok();
    const originalObject = clone(mock.rows.SurveillanceObject);
    const result = await save(mock, saveBody({ show_on_mobile_map: true }));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(new URL(fetchMock.mock.calls[0][0]).pathname).toMatch(/\/pand\/items\/bag-building-1$/);
    expect(result.configuration).toMatchObject({ collective_id: "estate-1", customer_id: null, object_id: null, version: 4, map_geometry_revision: 1, building_selection_mode: "manual" });
    expect(mock.rows.Collectief[0]).toMatchObject({ customer_id: null, manager_customer_id: null, object_ids: [], version: 4, building_labels: { "bag:bag-building-1": "Portier" } });
    expect(mock.rows.Collectief[0]).not.toHaveProperty("show_on_mobile_map");
    expect(mock.rows.Customer).toHaveLength(1);
    expect(mock.entities.Customer.create).not.toHaveBeenCalled();
    expect(mock.rows.Customer[0].name).toBe("Bestaande klant, alleen globale coordinator");
    expect(mock.rows.Customer[0].object_code_mutation_lock).toBeNull();
    expect(mock.rows.SurveillanceObject).toEqual(originalObject);
    expect(mock.rows.CollectiveMapGeometryRevision).toHaveLength(1);
    expect(mock.rows.PhysicalBuilding).toHaveLength(1);
    expect(mock.rows.BuildingDossierLink).toEqual([expect.objectContaining({ dossier_kind: "collective", dossier_id: "estate-1", selection_key: "bag:bag-building-1" })]);
    expect(mock.rows.CollectiveDossierEvent).toEqual([expect.objectContaining({ collective_id: "estate-1", actor_user_id: admin.id, action: "update_object_map_configuration" })]);
    expect(mock.rows.CollectiveMutationReceipt).toEqual([expect.objectContaining({ status: "completed" })]);
    expectNoOperationalWrites(mock);
    const receipt = JSON.stringify([mock.rows.Collectief[0].map_mutation_receipt, result.audit_result, mock.rows.CustomerEvent, mock.rows.CollectiveDossierEvent, mock.rows.CollectiveMutationReceipt]);
    expect(receipt).not.toContain("coordinates");
    expect(receipt).not.toContain("Polygon");
    expect(receipt).not.toContain("Portier");
  });

  it("vertrouwt geen clientgebouwgeometrie en weigert ongeldige terreingeometrie", async () => {
    const mock = fixture(); mockPdok();
    await save(mock, saveBody({ building_polygon_geojson: collection({ ...pdokFeature(), geometry: { type: "Point", coordinates: [0, 0] } }) }));
    expect(mock.rows.Collectief[0].building_polygon_geojson.features[0].geometry).toEqual(pdokFeature().geometry);
    const invalid = saveBody({ object_area_geojson: collection({ ...pdokFeature(), geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } }) }, { expected_version: 4, idempotency_key: "invalid-terrain" });
    await expect(save(mock, invalid)).rejects.toMatchObject({ status: 400 });
    expect(mock.rows.Collectief[0].version).toBe(4);
  });

  it("weigert een verouderde versie zonder kaart of selectie te overschrijven", async () => {
    const mock = fixture(); mockPdok();
    const before = clone(mock.rows.Collectief[0]);
    await expect(save(mock, saveBody({}, { expected_version: 2 }))).rejects.toMatchObject({ status: 409 });
    expect(mock.rows.Collectief[0]).toEqual(before);
    expect(mock.rows.BuildingDossierLink).toHaveLength(0);
    expectNoOperationalWrites(mock);
  });

  it("houdt een gearchiveerd collectief leesbaar maar niet wijzigbaar", async () => {
    const mock = fixture(); mock.rows.Collectief[0].status = "archived";
    await expect(api.handleGetObjectMapConfiguration(mock.base44, { collective_id: "estate-1" })).resolves.toHaveProperty("configuration.collective_id", "estate-1");
    await expect(save(mock)).rejects.toMatchObject({ status: 409 });
    expect(mock.entities.Collectief.updateMany).not.toHaveBeenCalled();
  });

  it("herhaalt opslag idempotent en weigert dezelfde sleutel voor andere inhoud of gebruiker", async () => {
    const mock = fixture(); mockPdok();
    const body = saveBody();
    await save(mock, body);
    const replay = await save(mock, body);
    expect(replay).toMatchObject({ replayed: true, configuration: { version: 4, map_geometry_revision: 1 } });
    expect(mock.rows.CollectiveMapGeometryRevision).toHaveLength(1);
    expect(mock.rows.PhysicalBuilding).toHaveLength(1);
    expect(mock.rows.BuildingDossierLink).toHaveLength(1);
    expect(mock.rows.CollectiveDossierEvent).toHaveLength(1);
    expect(mock.rows.CollectiveMutationReceipt).toHaveLength(1);
    await expect(save(mock, { ...body, data: { ...body.data, building_labels: { "bag:bag-building-1": "Anders" } } })).rejects.toMatchObject({ status: 409 });
    await expect(save(mock, body, { id: "other-admin", role: "admin" })).rejects.toMatchObject({ status: 409 });
    expect(mock.rows.Collectief[0].version).toBe(4);
  });

  it("herkent een oude idempotencysleutel na een tweede kaartopslag zonder de kaart terug te draaien", async () => {
    const mock = fixture(); mockPdok();
    const first = saveBody();
    await save(mock, first);
    const second = saveBody({ selected_bag_feature_ids: [], building_labels: {}, object_area_geojson: collection() }, { expected_version: 4, idempotency_key: "collective-map-2" });
    await save(mock, second);
    const saved = clone(mock.rows.Collectief[0]);
    const replay = await save(mock, first);
    expect(replay).toMatchObject({ replayed: true, configuration: { version: 5, map_geometry_revision: 2, selected_bag_feature_ids: [] } });
    expect(mock.rows.Collectief[0]).toEqual(saved);
    expect(mock.rows.CollectiveMapGeometryRevision).toHaveLength(2);
    expect(mock.rows.CollectiveDossierEvent).toHaveLength(2);
    expect(mock.rows.CollectiveMutationReceipt).toHaveLength(2);
    expect(mock.rows.BuildingDossierLink.filter(link => link.status === "active")).toHaveLength(0);
    expectNoOperationalWrites(mock);
  });

  it.each(["PhysicalBuilding", "BuildingDossierLink", "CollectiveMapGeometryRevision", "CollectiveDossierEvent", "CollectiveMutationReceipt"])("herstelt %s-uitval na collectief-CAS zonder tweede kaartrevisie", async entityName => {
    const mock = fixture(); mockPdok();
    const body = saveBody();
    mock.failNextCreate(entityName);
    await expect(save(mock, body)).rejects.toThrow(`temporary ${entityName} outage`);
    expect(mock.rows.Collectief[0].version).toBe(4);
    expect(mock.rows.Collectief[0].map_geometry_revision).toBe(1);
    expect(mock.rows.Customer[0].object_code_mutation_lock).toBeNull();
    expect(await save(mock, body)).toMatchObject({ replayed: true });
    expect(mock.rows.PhysicalBuilding).toHaveLength(1);
    expect(mock.rows.BuildingDossierLink).toHaveLength(1);
    expect(mock.rows.CollectiveMapGeometryRevision).toHaveLength(1);
    expect(mock.rows.CollectiveDossierEvent).toHaveLength(1);
    expect(mock.rows.CollectiveMutationReceipt).toHaveLength(1);
    expect(mock.rows.Collectief[0].version).toBe(4);
    expectNoOperationalWrites(mock);
  });

  it("herstelt canonieke koppelingen ook via de bestaande objectkaart-herstelmarker", async () => {
    const mock = fixture(); mockPdok();
    const body = saveBody({}, { collective_id: undefined, object_id: "object-1", customer_id: "customer-1" });
    mock.failNextCreate("BuildingDossierLink");
    await expect(save(mock, body)).rejects.toThrow("temporary BuildingDossierLink outage");
    const replay = await api.customerObjectMutationMarkerReplay(mock.base44, admin, body.action, body, body.idempotency_key,
      await api.mutationRequestFingerprint(body.action, body), api.mutationTarget(body.action, body));
    expect(replay.configuration.version).toBe(4);
    expect(mock.rows.SurveillanceObject[0].version).toBe(4);
    expect(mock.rows.PhysicalBuilding).toHaveLength(1);
    expect(mock.rows.BuildingDossierLink).toEqual([expect.objectContaining({ dossier_kind: "object", dossier_id: "object-1" })]);
    expect(mock.rows.ObjectMapGeometryRevision).toHaveLength(1);
  });
});

describe("pending object-building association suggestions", () => {
  it("herkent een nog niet opgeslagen BAG-keuze binnen een collectief met uitsluitend servercontouren", async () => {
    const mock = fixture(); const fetchMock = mockPdok();
    mock.rows.Collectief[0].building_polygon_geojson = collection(storedBuilding());
    const original = clone(mock.rows);
    const result = await api.handleBuildingAssociationSuggestions(mock.base44, {
      customer_id: "customer-1", object_id: "object-1", selected_bag_feature_ids: ["bag-building-1"], building_selection_points: [],
      building_polygon_geojson: collection({ ...pdokFeature(), geometry: { type: "Point", coordinates: [0, 0] } }),
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.matches).toEqual([expect.objectContaining({ selection_key: "bag:bag-building-1", collectives: [expect.objectContaining({ id: "estate-1", member: false })], shared_building_required: false })]);
    expect(mock.rows).toEqual(original);
    expect(JSON.stringify(result)).not.toContain("coordinates");
  });

  it("negeert een verzonnen clientcontour als geen BAG-id of geldig aanklikpunt is gekozen", async () => {
    const mock = fixture(); const fetchMock = mockPdok();
    mock.rows.Collectief[0].building_polygon_geojson = collection(storedBuilding());
    const result = await api.handleBuildingAssociationSuggestions(mock.base44, {
      customer_id: "customer-1", object_id: "object-1", selected_bag_feature_ids: [], building_selection_points: [], building_polygon_geojson: collection(storedBuilding()),
    });
    expect(result.matches).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("weigert verkeerde klantcontext en ongeldige aanklikpunten", async () => {
    const mock = fixture();
    await expect(api.handleBuildingAssociationSuggestions(mock.base44, { customer_id: "not-owner", object_id: "object-1", selected_bag_feature_ids: [] })).rejects.toMatchObject({ status: 404 });
    mock.rows.Customer.push({ id: "other-customer", name: "Andere klant", status: "active", version: 1 });
    await expect(api.handleBuildingAssociationSuggestions(mock.base44, { customer_id: "other-customer", object_id: "object-1", selected_bag_feature_ids: [] })).rejects.toMatchObject({ status: 409 });
    await expect(api.handleBuildingAssociationSuggestions(mock.base44, {
      customer_id: "customer-1", object_id: "object-1", selected_bag_feature_ids: [], building_selection_points: [{ id: "bad", longitude: 0, latitude: 0 }],
    })).rejects.toMatchObject({ status: 400 });
  });

  it("kan een geldig aanklikpunt in een opgeslagen collectiefgebouw voorstellen zonder dit automatisch te koppelen", async () => {
    const mock = fixture(); const fetchMock = mockPdok();
    mock.rows.Collectief[0].building_polygon_geojson = collection(storedBuilding());
    const original = clone(mock.rows);
    const result = await api.handleBuildingAssociationSuggestions(mock.base44, {
      customer_id: "customer-1", object_id: "object-1", selected_bag_feature_ids: [],
      building_selection_points: [{ id: "native-building", longitude: 4.3005, latitude: 52.1005 }],
    });
    expect(result.matches).toEqual([expect.objectContaining({
      selection_key: "selection:object-1:native-building",
      collectives: [expect.objectContaining({ id: "estate-1", member: false })],
    })]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mock.rows).toEqual(original);
    expect(mock.entities.CollectiveMembership.create).not.toHaveBeenCalled();
    expect(mock.entities.BuildingDossierLink.create).not.toHaveBeenCalled();
  });

  it("behoudt bestaande geometrie bij PDOK-uitval en gebruikt opgeslagen BAG-contouren zonder nieuwe fetch", async () => {
    const mock = fixture();
    const fetchMock = vi.fn(async () => { throw new Error("PDOK unavailable"); }); vi.stubGlobal("fetch", fetchMock);
    const body = { customer_id: "customer-1", object_id: "object-1", selected_bag_feature_ids: ["bag-building-1"], building_selection_points: [] };
    const original = clone(mock.rows);
    await expect(api.handleBuildingAssociationSuggestions(mock.base44, body)).rejects.toMatchObject({ status: 503 });
    expect(mock.rows).toEqual(original);
    mock.rows.SurveillanceObject[0].building_polygon_geojson = collection(storedBuilding());
    mock.rows.Collectief[0].building_polygon_geojson = collection(storedBuilding());
    fetchMock.mockClear();
    expect((await api.handleBuildingAssociationSuggestions(mock.base44, body)).matches[0].collectives[0].id).toBe("estate-1");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("reverse collective building attachments through the public API", () => {
  it("koppelt een opgeslagen collectiefgebouw aan de doelobjectkaart met één canoniek gebouw en ongewijzigde mobiele zichtbaarheid", async () => {
    const mock = fixture(); mockPdok();
    await save(mock);
    const source = clone(mock.rows.Collectief[0]);
    const body = attachmentBody();
    const response = await request(mock, body);
    expect(await response.json()).toMatchObject({ ok: true, collective_id: "estate-1", object_id: "object-1", object_version: 4 });
    expect(response.status).toBe(200);
    expect(mock.rows.SurveillanceObject[0]).toMatchObject({
      version: 4, customer_id: "customer-1", show_on_mobile_map: false, building_selection_mode: "manual", map_geometry_revision: 1,
      building_labels: { "bag:bag-building-1": "Portier" },
      building_polygon_geojson: { features: [expect.objectContaining({ geometry: pdokFeature().geometry })] },
    });
    expect(mock.rows.Collectief[0]).toEqual(source);
    expect(mock.rows.PhysicalBuilding).toHaveLength(1);
    expect(mock.rows.BuildingDossierLink).toHaveLength(2);
    expect(new Set(mock.rows.BuildingDossierLink.map(link => link.building_id)).size).toBe(1);
    expect(mock.rows.CollectiveMembership).toEqual([expect.objectContaining({ collective_id: "estate-1", object_id: "object-1", status: "active" })]);
    expect(mock.rows.ObjectMapGeometryRevision).toHaveLength(1);
    const replay = await request(mock, body);
    expect(await replay.json()).toMatchObject({ ok: true, replayed: true, object_version: 4 });
    expect(mock.rows.SurveillanceObject[0].version).toBe(4);
    expect(mock.rows.ObjectMapGeometryRevision).toHaveLength(1);
    expect(mock.rows.CollectiveMembership).toHaveLength(1);
    expect(mock.rows.Task).toHaveLength(0);
    expect(mock.rows.CustomerContract).toHaveLength(0);
    expect(mock.rows.CustomerInvoice).toHaveLength(0);
    expect(JSON.stringify([mock.rows.CollectiveDossierEvent, mock.rows.CollectiveMutationReceipt])).not.toContain("coordinates");
  });

  it("weigert een versieconflict bij voorafcontrole zonder lidmaatschap of canonieke doelkoppeling achter te laten", async () => {
    const mock = fixture(); mockPdok();
    await save(mock);
    const sourceLinks = clone(mock.rows.BuildingDossierLink);
    const response = await request(mock, attachmentBody({ expected_version: 2 }));
    expect(response.status).toBe(409);
    expect(mock.rows.CollectiveMembership).toHaveLength(0);
    expect(mock.rows.BuildingDossierLink).toEqual(sourceLinks);
    expect(mock.rows.SurveillanceObject[0].version).toBe(3);
    expect(mock.rows.ObjectMapGeometryRevision).toHaveLength(0);
  });

  it("vereist expliciet gedeeld gebruik en maakt daarna een bedrijfsverzamelgebouw met beide klantobjecten", async () => {
    const mock = fixture(); mockPdok();
    mock.rows.Customer.push({ id: "customer-2", name: "Huurder", status: "active", version: 1 });
    mock.rows.SurveillanceObject.push({ ...mapFields(), id: "object-2", name: "Bestaande huurder", customer_id: "customer-2", show_on_mobile_map: false,
      building_selection_mode: "manual", map_geometry_status: "configured", map_geometry_revision: 1, building_polygon_geojson: collection(storedBuilding()) });
    await save(mock);
    const existingOccupant = clone(mock.rows.SurveillanceObject[1]);
    const blocked = await request(mock, attachmentBody());
    expect(blocked.status).toBe(409);
    expect(mock.rows.CollectiveMembership).toHaveLength(0);
    expect(mock.rows.SurveillanceObject[0].version).toBe(3);
    const body = attachmentBody({ association_type: "shared_building", collective_id: undefined, parent_collectief_id: "estate-1", name: "Gedeeld kantoorgebouw", idempotency_key: "reverse-shared-1" });
    const response = await request(mock, body);
    const result = await response.json();
    expect(result).toMatchObject({ ok: true, association_type: "shared_building", linked_object_count: 2, object_version: 4 });
    expect(response.status).toBe(200);
    expect(mock.rows.Collectief.find(row => row.id === result.collective_id)).toMatchObject({ collectief_type: "bedrijfsverzamelgebouw", parent_collectief_id: "estate-1", customer_id: null, object_ids: [] });
    expect(mock.rows.CollectiveMembership.filter(member => member.collective_id === result.collective_id).map(member => member.object_id).sort()).toEqual(["object-1", "object-2"]);
    expect(mock.rows.SurveillanceObject[0]).toMatchObject({ version: 4, show_on_mobile_map: false, customer_id: "customer-1" });
    expect(mock.rows.SurveillanceObject[1]).toEqual(existingOccupant);
    expect(mock.rows.PhysicalBuilding).toHaveLength(1);
    expect(mock.rows.ObjectMapGeometryRevision).toHaveLength(1);
    const replay = await request(mock, body);
    expect(await replay.json()).toMatchObject({ ok: true, replayed: true, collective_id: result.collective_id });
    expect(mock.rows.Collectief).toHaveLength(2);
    expect(mock.rows.CollectiveMembership).toHaveLength(2);
    expect(mock.rows.Task).toHaveLength(0);
    expect(mock.rows.CustomerContract).toHaveLength(0);
    expect(mock.rows.CustomerInvoice).toHaveLength(0);
  });
});
