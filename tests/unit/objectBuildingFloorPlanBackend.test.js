import fs from "node:fs";
import path from "node:path";
import { TextDecoder, TextEncoder } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { inlineBackendImports } from "../helpers/inlineBackendImports";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let api;
let mobile;

async function loadBackend(relativePath, exports) {
  const entryPath = path.join(root, relativePath);
  const source = fs.readFileSync(entryPath, "utf8").replace(/from ["']npm:fflate@[^"']+["']/g, `from ${JSON.stringify(pathToFileURL(createRequire(import.meta.url).resolve("fflate")).href)}`).replace(
    /^import \{ createClientFromRequest(?: as ([A-Za-z0-9_]+))? \} from ["']npm:@base44\/sdk@[^"']+["'];$/gm,
    (_match, alias) => `const ${alias || "createClientFromRequest"} = () => globalThis.__buildingFloorPlanBase44;`,
  );
  const { transform } = await import("esbuild");
  const compiled = await transform(await inlineBackendImports(`${source}\nexport { ${exports.join(", ")} };`, entryPath), {
    format: "esm", loader: "ts", target: "es2022",
  });
  return import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString("base64")}`);
}

beforeAll(async () => {
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
  globalThis.Uint8Array = new TextEncoder().encode("").constructor;
  globalThis.Deno = { env: { get: () => undefined }, serve: () => undefined };
  api = await loadBackend("base44/functions/customerPlatformApi/entry.ts", ["READ_ACTIONS", "handleGetObjectBuildingFloorPlan", "handleGetObjectMapConfiguration", "safeMapDossierConfiguration"]);
  mobile = await loadBackend("base44/functions/mobileApi/entry.ts", ["handleMobileObjectFloorPlan", "handleMobileObjectsMap", "buildPackage"]);
});
afterEach(() => { delete globalThis.__buildingFloorPlanBase44; });

const geometry = { type: "Polygon", coordinates: [[[4.3000, 52.1000], [4.3010, 52.1000], [4.3010, 52.1010], [4.3000, 52.1010], [4.3000, 52.1000]]] };
const building = (overrides = {}) => ({
  type: "Feature", id: "bag-1", geometry,
  properties: { source: "pdok_bag", source_feature_id: "bag-1", source_status: "Pand in gebruik" },
  ...overrides,
});
const collection = (...features) => ({ type: "FeatureCollection", features });
const object = (overrides = {}) => ({
  id: "object-1", customer_id: "customer-1", name: "Object", status: "active",
  latitude: 52.1005, longitude: 4.3005, map_geometry_status: "configured", building_selection_mode: "manual",
  building_polygon_geojson: collection(building()), building_selection_points: [], ...overrides,
});
const plan = (overrides = {}) => ({
  id: "building-plan-1", object_id: "object-1", building_selection_key: "bag:bag-1", source: "loq_desktop",
  status: "published", is_current: true, revision: 2, title: "Receptie", ...overrides,
});
const readBody = { customer_id: "customer-1", object_id: "object-1", building_selection_key: "bag:bag-1" };
const request = body => new Request("https://example.test/function", {
  method: "POST", headers: { "content-type": "application/json", "x-request-id": "building-plan-test" }, body: JSON.stringify(body),
});

function backendMock(records = [], objectOverrides = {}, user = { id: "admin-1", role: "admin" }) {
  const savedObject = object(objectOverrides);
  const rows = records.map(record => structuredClone(record));
  const matches = (record, query) => Object.entries(query).every(([key, value]) => record[key] === value);
  const emptyList = () => ({ list: vi.fn(async () => []) });
  const entities = {
    Customer: { get: vi.fn(async id => id === "customer-1" ? { id, status: "active" } : null) },
    SurveillanceObject: {
      get: vi.fn(async id => id === savedObject.id ? savedObject : null),
      list: vi.fn(async () => [savedObject]),
    },
    ObjectFloorPlan: {
      filter: vi.fn(async (query, _sort, limit = 1000) => rows.filter(record => matches(record, query)).slice(0, limit)),
      create: vi.fn(async value => { const row = { id: `new-plan-${rows.length}`, ...value }; rows.push(row); return row; }),
      update: vi.fn(async (id, patch) => { const row = rows.find(record => record.id === id); Object.assign(row, patch); return row; }),
    },
    TaskExecution: { filter: vi.fn(async () => []) },
    MobileAuditLog: { create: vi.fn(async value => value) },
    ReportTemplate: emptyList(), Vehicle: emptyList(), Personnel: emptyList(),
  };
  const base44 = { auth: { me: vi.fn(async () => user) }, asServiceRole: { entities } };
  globalThis.__buildingFloorPlanBase44 = base44;
  return { base44, rows, entities };
}

describe("Gebouwplattegrond lezen", () => {
  it.each([
    ["bag:bag-1", {}],
    ["manual:receptie", { building_polygon_geojson: collection(building({ id: "receptie", properties: { source: "manual", local_id: "receptie" } })) }],
    ["point:selectie-1", { building_polygon_geojson: null, building_selection_points: [{ id: "selectie-1", longitude: 4.3005, latitude: 52.1005 }] }],
  ])("leest alleen het gepubliceerde plan van opgeslagen selectie %s", async (key, selection) => {
    const mock = backendMock([plan({ building_selection_key: key })], selection);
    const result = await api.handleGetObjectBuildingFloorPlan(mock.base44, { ...readBody, building_selection_key: key });
    expect(result).toMatchObject({ customer_id: "customer-1", object_id: "object-1", building_selection_key: key, floor_plan: { id: "building-plan-1", building_selection_key: key } });
    expect(mock.entities.ObjectFloorPlan.filter).toHaveBeenCalledWith({ object_id: "object-1", building_selection_key: key, status: "published", is_current: true }, "-revision", 2);
  });

  it("geeft null zonder terugval naar een ander gebouw, concept of objectbreed iOS-plan", async () => {
    const mock = backendMock([
      plan({ id: "legacy", building_selection_key: null }),
      plan({ id: "other-building", building_selection_key: "bag:bag-2" }),
      plan({ id: "other-object", object_id: "object-2" }),
      plan({ id: "draft", status: "draft" }),
      plan({ id: "archived", status: "archived" }),
      plan({ id: "old-revision", is_current: false }),
    ]);
    await expect(api.handleGetObjectBuildingFloorPlan(mock.base44, readBody)).resolves.toEqual({ ...readBody, floor_plan: null });
  });

  it("verwijdert URLs en geheimen uit de read DTO, ook in geneste 2D-data", async () => {
    const mock = backendMock([plan({
      preview_2d_file_id: "managed-preview", preview_2d_file_url: "https://private.example/preview.png", usdz_file_url: "https://private.example/model.usdz",
      raw_roomplan_file_url: "https://private.example/raw.json", metadata: { token: "private" }, captured_by: "private user",
      floorplan_2d_json: { rooms: [{ id: "r1", name: "Receptie", secret: "hidden", nested: { url: "https://private.example", x: 5 } }], password: "hidden" },
    })]);
    const result = await api.handleGetObjectBuildingFloorPlan(mock.base44, readBody);
    expect(result.floor_plan).toMatchObject({ preview_2d_file_id: "managed-preview", source: "loq_desktop", floorplan_2d_json: { rooms: [{ id: "r1", name: "Receptie", nested: { x: 5 } }] } });
    expect(JSON.stringify(result)).not.toMatch(/private|hidden|file_url|password|secret|token/);
  });

  it.each([
    { building_polygon_geojson: null, building_selection_mode: "automatic" },
    { building_polygon_geojson: collection(building(), building()) },
    { building_polygon_geojson: { type: "FeatureCollection", features: [{ ...building(), geometry: null }] } },
    { building_selection_points: [null] },
  ])("weigert een verdwenen, ambigue of ongeldige gebouwselectie", async selection => {
    const mock = backendMock([plan()], selection);
    await expect(api.handleGetObjectBuildingFloorPlan(mock.base44, readBody)).rejects.toMatchObject({ status: 409, details: { code: "building_selection_unavailable" } });
    expect(mock.entities.ObjectFloorPlan.filter).not.toHaveBeenCalled();
  });

  it.each(["automatic", undefined])("weigert historische BAG-contouren met een actueel plan zonder expliciet opgeslagen manual modus (%s)", async mode => {
    const mock = backendMock([plan()], { building_selection_mode: mode });
    await expect(api.handleGetObjectBuildingFloorPlan(mock.base44, readBody)).rejects.toMatchObject({ status: 409, details: { code: "building_selection_unavailable" } });
    expect(mock.entities.ObjectFloorPlan.filter).not.toHaveBeenCalled();
  });

  it.each([
    ["opgeslagen BAG", {}, ["bag:bag-1"]],
    ["opgeslagen handmatig vlak", { building_polygon_geojson: collection(building({ id: "receptie", properties: { source: "manual", local_id: "receptie" } })) }, ["manual:receptie"]],
    ["opgeslagen aanklikpunt", { building_polygon_geojson: null, building_selection_points: [{ id: "selectie-1", longitude: 4.3005, latitude: 52.1005 }] }, ["point:selectie-1"]],
    ["historische automatic contour", { building_selection_mode: "automatic" }, []],
    ["oude contour zonder modus", { building_selection_mode: undefined }, []],
    ["gegenereerd ID", { building_polygon_geojson: collection(building({ id: undefined, properties: { source: "manual" } })) }, []],
    ["tegenstrijdige IDs", { building_polygon_geojson: collection(building({ id: "ander-id", properties: { source: "manual", local_id: "receptie" } })) }, []],
    ["dubbele BAG ID", { building_polygon_geojson: collection(building(), building()) }, []],
    ["ongeldige selectie", { building_selection_points: [null] }, []],
  ])("geeft bij %s dezelfde toegestane sleutels in kaartconfiguratie en planlookup", async (_label, selection, expectedKeys) => {
    const mock = backendMock([], selection);
    const { configuration } = await api.handleGetObjectMapConfiguration(mock.base44, readBody);
    expect(configuration.building_floor_plan_selection_keys).toEqual(expectedKeys);
    for (const key of expectedKeys) {
      await expect(api.handleGetObjectBuildingFloorPlan(mock.base44, { ...readBody, building_selection_key: key })).resolves.toMatchObject({ floor_plan: null });
    }
    if (!expectedKeys.length) {
      await expect(api.handleGetObjectBuildingFloorPlan(mock.base44, readBody)).rejects.toMatchObject({ status: 409, details: { code: "building_selection_unavailable" } });
      expect(mock.entities.ObjectFloorPlan.filter).not.toHaveBeenCalled();
    }
  });

  it("biedt in een collectiefkaart geen objectplattegrondsleutels", () => {
    const configuration = api.safeMapDossierConfiguration(object({ __dossier_kind: "collective" }));
    expect(configuration).not.toHaveProperty("building_floor_plan_selection_keys");
  });

  it("weigert gezamenlijk meer dan 100 gebouwvlakken en aanklikpunten in configuratie en planlookup", async () => {
    const mock = backendMock([plan()], {
      building_polygon_geojson: collection(...Array.from({ length: 100 }, (_value, index) => building({
        id: `bag-${index + 1}`,
        properties: { source: "pdok_bag", source_feature_id: `bag-${index + 1}`, source_status: "Pand in gebruik" },
      }))),
      building_selection_points: [{ id: "selectie-101", longitude: 4.3005, latitude: 52.1005 }],
    });
    const { configuration } = await api.handleGetObjectMapConfiguration(mock.base44, readBody);
    expect(configuration.map_geometry_status).toBe("needs_review");
    expect(configuration.building_floor_plan_selection_keys).toEqual([]);
    await expect(api.handleGetObjectBuildingFloorPlan(mock.base44, readBody)).rejects.toMatchObject({ status: 409, details: { code: "building_selection_unavailable" } });
    expect(mock.entities.ObjectFloorPlan.filter).not.toHaveBeenCalled();
  });

  it.each(["manual:manual:1", "manual:legacy-0"])("accepteert geen positiegebonden legacy sleutel %s", async key => {
    const mock = backendMock([plan({ building_selection_key: key })], { building_polygon_geojson: collection(building({ id: undefined, properties: { source: "manual" } })) });
    await expect(api.handleGetObjectBuildingFloorPlan(mock.base44, { ...readBody, building_selection_key: key })).rejects.toMatchObject({ status: 409, details: { code: "building_selection_unavailable" } });
  });

  it("weigert meerdere actieve publicaties voor hetzelfde gebouw", async () => {
    const mock = backendMock([plan(), plan({ id: "duplicate", revision: 3 })]);
    await expect(api.handleGetObjectBuildingFloorPlan(mock.base44, readBody)).rejects.toMatchObject({ status: 409, details: { code: "building_floor_plan_ambiguous" } });
  });

  it("controleert object/klant scope en biedt geen collectief of desktop schrijfroute", async () => {
    const mock = backendMock([plan()], { customer_id: "customer-2" });
    await expect(api.handleGetObjectBuildingFloorPlan(mock.base44, readBody)).rejects.toMatchObject({ status: 409 });
    await expect(api.handleGetObjectBuildingFloorPlan(mock.base44, { ...readBody, collective_id: "collective-1" })).rejects.toMatchObject({ status: 400 });
    expect(mock.entities.ObjectFloorPlan.filter).not.toHaveBeenCalled();
    expect(api.READ_ACTIONS.has("get_object_building_floor_plan")).toBe(true);
  });

  it.each([[null, 401], [{ id: "employee-1", role: "user" }, 403]])("beschermt de publieke read route met backoffice admin authenticatie", async (user, status) => {
    const mock = backendMock([plan()], {}, user);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await api.handleCustomerPlatformRequest(request({ action: "get_object_building_floor_plan", ...readBody }));
    expect(result.status).toBe(status);
    expect(mock.entities.ObjectFloorPlan.filter).not.toHaveBeenCalled();
  });

  it("routeert de nieuwe read actie zonder mutatie-envelop of writes", async () => {
    const mock = backendMock([plan()]);
    const result = await api.handleCustomerPlatformRequest(request({ action: "get_object_building_floor_plan", ...readBody }));
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ floor_plan: { id: "building-plan-1" } });
    expect(mock.entities.ObjectFloorPlan.create).not.toHaveBeenCalled();
    expect(mock.entities.ObjectFloorPlan.update).not.toHaveBeenCalled();
  });
});

describe("Bestaande iOS objectplattegronden", () => {
  const legacy = () => plan({ id: "legacy", building_selection_key: undefined, revision: 3, source: "ios_roomplan" });

  it("laat een gebouwplan het bestaande objectbrede get-resultaat niet vervangen", async () => {
    backendMock([plan({ revision: 99 }), legacy()]);
    const response = await mobile.handleMobileObjectFloorPlan(request({ action: "get", object_id: "object-1" }));
    expect(await response.json()).toMatchObject({ floor_plan: { id: "legacy" } });
    backendMock([plan()]);
    const empty = await mobile.handleMobileObjectFloorPlan(request({ action: "get", object_id: "object-1" }));
    expect(await empty.json()).toEqual({ floor_plan: null });
  });

  it("houdt iOS revisies en demotie in objectbrede scope bij publicatie", async () => {
    const mock = backendMock([plan({ revision: 99 }), legacy()]);
    const response = await mobile.handleMobileObjectFloorPlan(request({ action: "publish", object_id: "object-1", upload: { title: "Nieuwe opname" } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ floor_plan: { revision: 4, building_selection_key: null, is_current: true } });
    expect(mock.rows.find(row => row.id === "building-plan-1").is_current).toBe(true);
    expect(mock.rows.find(row => row.id === "legacy").is_current).toBe(false);
    expect(mock.entities.ObjectFloorPlan.update).toHaveBeenCalledTimes(1);
    expect(mock.entities.ObjectFloorPlan.update).toHaveBeenCalledWith("legacy", { is_current: false });
  });

  it.each([
    { action: "get", building_selection_key: "bag:bag-1" },
    { action: "publish", upload: { building_selection_key: "bag:bag-1" } },
  ])("negeert een meegestuurde gebouwscope nooit stilzwijgend", async body => {
    const mock = backendMock([plan(), legacy()]);
    const response = await mobile.handleMobileObjectFloorPlan(request({ object_id: "object-1", ...body }));
    expect(response.status).toBe(400);
    expect(mock.entities.ObjectFloorPlan.filter).not.toHaveBeenCalled();
    expect(mock.entities.ObjectFloorPlan.create).not.toHaveBeenCalled();
  });

  it("neemt in online kaarten en offline pakketten alleen het bestaande objectbrede plan op", async () => {
    const mock = backendMock([legacy(), plan({ revision: 99 })]);
    const response = await mobile.handleMobileObjectsMap(request({}));
    expect(response.status).toBe(200);
    expect((await response.json()).objects[0].floor_plan_summary).toMatchObject({ floor_plan_id: "legacy", revision: 3 });
    const route = { id: "route-1", employee_id: "employee-1", status: "pending" };
    const offline = await mobile.buildPackage(mock.base44, route);
    expect(offline.objects_on_map[0].floor_plan_summary).toMatchObject({ floor_plan_id: "legacy", revision: 3 });
  });
});
