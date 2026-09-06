import fs from "node:fs";
import path from "node:path";
import { TextDecoder, TextEncoder } from "node:util";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let api;
let mobile;
async function loadBackend(relativePath, exports) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8").replace(
    /^import \{ createClientFromRequest(?: as ([A-Za-z0-9_]+))? \} from ["']npm:@base44\/sdk@[^"']+["'];$/gm,
    (_match, alias) => `const ${alias || "createClientFromRequest"} = () => ({});`,
  );
  const { transform } = await import("esbuild");
  const compiled = await transform(`${source}\nexport { ${exports.join(", ")} };`, { format: "esm", loader: "ts", target: "es2022" });
  return import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString("base64")}`);
}
beforeAll(async () => {
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
  globalThis.Uint8Array = new TextEncoder().encode("").constructor;
  globalThis.Deno = { env: { get: () => undefined }, serve: () => undefined };
  api = await loadBackend("base44/functions/customerPlatformApi/entry.ts", [
    "READ_ACTIONS", "handleListObjectParcelCandidates", "normalizedBuildingSelectionPoints",
    "safeObjectMapConfiguration", "safeStoredMapGeometry", "safeLocalGeometryProperties",
    "handleUpdateObjectMapConfiguration", "ensureObjectMapGeometryRevision", "objectHasMapConfiguration",
    "buildingAssignmentConflicts", "nextPdokParcelCursor",
    "customerObjectMutationMarkerReplay",
  ]);
  mobile = await loadBackend("base44/functions/mobileApi/entry.ts", ["mobileSafeMapState", "buildPackage"]);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const point = (overrides = {}) => ({ id: "loq-point-1", longitude: 4.3002, latitude: 52.1002, ...overrides });
const storedPoint = (overrides = {}) => point({ source: "user_selected", provider: "mapbox", bag_status: "unlinked", ...overrides });
const feature = () => ({
  type: "Feature", id: "6693300c-9f8c-565f-bf82-c3eaf4c780e7",
  properties: { kadastrale_gemeente_waarde: "Heerde", sectie: "A", perceelnummer: 934, identificatie_lokaal_id: "81100093470000", private_owner: "not returned" },
  geometry: { type: "Polygon", coordinates: [[[4.3000, 52.1000], [4.3010, 52.1000], [4.3010, 52.1010], [4.3000, 52.1010], [4.3000, 52.1000]]] },
});
const collection = (...features) => ({ type: "FeatureCollection", features });
const objectRecord = (overrides = {}) => ({
  id: "object-1", customer_id: "customer-1", name: "Object", address: "Voorbeeldweg 1", status: "active",
  latitude: 52.1005, longitude: 4.3005, geocoding_status: "verified", version: 3,
  building_selection_mode: "automatic", map_geometry_status: "unconfigured", map_geometry_revision: 0,
  building_polygon_geojson: null, object_area_geojson: null, show_on_mobile_map: true, is_active_customer_object: true,
  ...overrides,
});
function backendMock(overrides = {}, others = []) {
  let object = objectRecord(overrides);
  let customer = { id: "customer-1", status: "active", version: 1, object_code_mutation_lock: null };
  const revisions = [];
  const entities = {
    Customer: {
      get: vi.fn(async id => id === customer.id ? { ...customer } : null),
      list: vi.fn(async () => [{ ...customer }]),
      updateMany: vi.fn(async (query, update) => {
        if (query.id !== customer.id || query.version !== customer.version) return { updated: 0 };
        customer = { ...customer, ...(update.$set || {}), version: customer.version + Number(update.$inc?.version || 0) };
        return { success: true, updated: 1 };
      }),
    },
    SurveillanceObject: {
      get: vi.fn(async id => id === object.id ? { ...object } : null),
      filter: vi.fn(async () => [{ ...object }]),
      list: vi.fn(async (_sort, limit = 1000, skip = 0) => [{ ...object }, ...others].slice(skip, skip + limit)),
      updateMany: vi.fn(async (query, update) => {
        if (query.id !== object.id || query.version !== object.version) return { updated: 0 };
        object = { ...object, ...(update.$set || {}), version: object.version + Number(update.$inc?.version || 0) };
        return { success: true, updated: 1 };
      }),
    },
    ObjectMapGeometryRevision: {
      filter: vi.fn(async query => revisions.filter(item => item.object_id === query.object_id && (query.revision === undefined || query.revision === item.revision))),
      create: vi.fn(async value => { const result = { id: `revision-${revisions.length}`, ...value }; revisions.push(result); return result; }),
    },
  };
  return { base44: { asServiceRole: { entities } }, state: () => object, revisions };
}
const body = { customer_id: "customer-1", object_id: "object-1", radius_meters: 200, limit: 20 };
const save = (mock, data, expectedVersion = mock.state().version, key = "map-points-1") => api.handleUpdateObjectMapConfiguration(
  mock.base44, { id: "admin-1" }, { ...body, data: { building_selection_mode: "manual", selected_bag_feature_ids: [], ...data } },
  expectedVersion, key, `${key}-fingerprint`, "update_object_map_configuration|customer_id:customer-1|object_id:object-1",
);

describe("Kadastrale terreinvoorbeelden", () => {
  it("geeft gesaneerde percelen vanuit de gecontroleerde objectlocatie en exacte paginacursor", async () => {
    expect(api.READ_ACTIONS.has("list_object_parcel_candidates")).toBe(true);
    const fetchMock = vi.fn(async url => {
      const next = new URL(url); next.searchParams.set("cursor", "b5N9|Ng6dBg");
      return new Response(JSON.stringify({ ...collection(feature()), links: [{ rel: "next", href: next.href }] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await api.handleListObjectParcelCandidates(backendMock().base44, body);
    expect(result).toMatchObject({ candidates: { type: "FeatureCollection" }, source: { id: "pdok_brk" }, next_cursor: "b5N9|Ng6dBg", has_more: true });
    expect(result.candidates.features[0].properties).toEqual({ source: "pdok_brk", source_feature_id: feature().id, source_identificatie: "81100093470000", label: "Heerde A 934", source_retrieved_at: expect.any(String) });
    expect(JSON.stringify(result)).not.toContain("private_owner");
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe("/kadaster/brk-kadastrale-kaart/ogc/v1/collections/perceel/items");
    expect(url.searchParams.get("crs")).toMatch(/CRS84$/);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: "error" });
  });

  it("haalt niets op voor een verkeerde klant, onbetrouwbare locatie of ongeldige cursor", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(api.handleListObjectParcelCandidates(backendMock({ customer_id: "other" }).base44, body)).rejects.toMatchObject({ status: 409 });
    await expect(api.handleListObjectParcelCandidates(backendMock({ geocoding_status: "unverified" }).base44, body)).rejects.toMatchObject({ status: 409 });
    await expect(api.handleListObjectParcelCandidates(backendMock().base44, { ...body, cursor: "https://other.test/page" })).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["origin", "path", "bbox", "limit", "extra", "duplicate", "same"])("weigert een afwijkende volgende pagina: %s", kind => {
    const request = new URL("https://api.pdok.nl/kadaster/brk-kadastrale-kaart/ogc/v1/collections/perceel/items?bbox=4,52,5,53&limit=20&f=json&cursor=old");
    const next = new URL(request); next.searchParams.set("cursor", "next");
    if (kind === "origin") next.hostname = "elsewhere.test";
    if (kind === "path") next.pathname = "/other";
    if (kind === "bbox") next.searchParams.set("bbox", "1,2,3,4");
    if (kind === "limit") next.searchParams.set("limit", "100");
    if (kind === "extra") next.searchParams.set("extra", "1");
    if (kind === "duplicate") next.searchParams.append("cursor", "another");
    if (kind === "same") next.searchParams.set("cursor", "old");
    expect(() => api.nextPdokParcelCursor([{ rel: "next", href: next.href }], request)).toThrow();
  });

  it("biedt een herstelbare fout bij uitval en slaat ongeldige perceelgeometrie over", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    await expect(api.handleListObjectParcelCandidates(backendMock().base44, body)).rejects.toMatchObject({ status: 503, details: { code: "pdok_parcel_unavailable", retryable: true } });
    const invalid = feature(); invalid.geometry.coordinates[0].pop();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(collection(invalid)))));
    expect(await api.handleListObjectParcelCandidates(backendMock().base44, body)).toMatchObject({ candidates: { features: [] }, skipped_invalid_count: 1 });
  });

  it("bewaart alleen een veilige herkomstverwijzing van het bewerkbare terrein", () => {
    const terrain = feature();
    terrain.properties = { source: "pdok_brk", local_id: "terrain-1", derived_from: "pdok_brk", derived_from_id: feature().id, owner: "private", official_boundary: true };
    const object = objectRecord({ object_area_geojson: collection(terrain) });
    const expected = { source: "user_drawn", local_id: terrain.id, derived_from: "pdok_brk", derived_from_id: feature().id };
    expect(api.safeStoredMapGeometry(object).object_area_geojson.features[0].properties).toEqual(expected);
    expect(mobile.mobileSafeMapState(object).object_area_geojson.features[0].properties).toEqual(expected);
  });
});

describe("Door gebruiker gekozen gebouwen zonder BAG-koppeling", () => {
  it("bewaart alleen het gebruikerspunt met expliciete ongekoppelde herkomst", () => {
    const input = point({ source: "pdok_bag", provider: "other", bag_status: "verified", geometry: feature().geometry, mapbox_feature_id: "temporary", centroid: [4, 52] });
    expect(api.normalizedBuildingSelectionPoints([input], [4.3005, 52.1005])).toEqual([storedPoint()]);
    const config = api.safeObjectMapConfiguration(objectRecord({ building_selection_points: [input] }));
    expect(config.building_selection_points).toEqual([storedPoint()]);
    expect(config.building_selection_mode).toBe("manual");
    expect(config.building_summary).toMatchObject({ feature_count: 1, selection_point_count: 1 });
    expect(api.objectHasMapConfiguration(objectRecord({ building_selection_points: [input] }))).toBe(true);
  });

  it.each([false, "not-an-array", [point({ latitude: null })], [point({ longitude: "4.3" })], [point({ latitude: Infinity })], [point({ longitude: 181 })], [point({ latitude: 50 })], [point(), point()], Array.from({ length: 101 }, (_, index) => point({ id: `point-${index}`, longitude: 4.3 + index / 100000 }))])("weigert ongeldige, dubbele of te grote puntselecties (%#)", value => {
    expect(() => api.normalizedBuildingSelectionPoints(value, [4.3005, 52.1005])).toThrow();
    expect(api.safeStoredMapGeometry(objectRecord({ building_selection_points: value })).invalid).toBe(true);
    expect(mobile.mobileSafeMapState(objectRecord({ building_selection_points: value })).map_geometry_status).toBe("needs_review");
  });

  it("slaat punten op met revisie en hash zonder Mapbox-geometrie in opslag of audit", async () => {
    const mock = backendMock(); const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const result = await save(mock, { building_selection_points: [point({ geometry: feature().geometry, mapbox_feature_id: "temporary-id" })] });
    expect(result.configuration).toMatchObject({ building_selection_points: [storedPoint()], building_polygon_geojson: null, map_geometry_revision: 1, map_geometry_status: "configured" });
    expect(mock.revisions[0]).toMatchObject({ building_selection_points: [storedPoint()], revision: 1 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.stringify(mock.state())).not.toContain("temporary-id");
    for (const payload of [result.audit_result, mock.state().customer_platform_last_mutation_recovery]) {
      const text = JSON.stringify(payload);
      expect(text).not.toContain("building_selection_points");
      expect(text).not.toContain('"longitude"');
      expect(text).not.toContain('"latitude"');
      expect(text).not.toContain("coordinates");
    }
    const oldHash = result.configuration.map_geometry_hash;
    const revised = await save(mock, { building_selection_points: [point({ longitude: 4.3003 })] }, mock.state().version, "map-points-2");
    expect(revised.configuration.map_geometry_hash).not.toBe(oldHash);
    expect(revised.configuration.map_geometry_revision).toBe(2);
    expect(mock.revisions[0].building_selection_points).toEqual([storedPoint()]);
  });

  it("behoudt punten bij terreinaanpassingen en wist ze bij automatisch bepalen", async () => {
    const mock = backendMock({ building_selection_points: [storedPoint()], building_selection_mode: "manual", map_geometry_status: "configured" });
    await save(mock, { object_area_geojson: collection(feature()) });
    expect(mock.state().building_selection_points).toEqual([storedPoint()]);
    await save(mock, { building_selection_mode: "automatic", building_selection_points: [storedPoint()] }, mock.state().version, "automatic-reset");
    expect(mock.state().building_selection_points).toEqual([]);
    expect(mock.state().building_selection_mode).toBe("automatic");
  });

  it("bewaart een oude puntselectie met haar oude anker tijdens adrescontrole", async () => {
    const mock = backendMock({ building_selection_points: [storedPoint()], building_selection_mode: "manual", map_geometry_status: "configured", map_geometry_revision: 1 });
    const prior = mock.state();
    await api.ensureObjectMapGeometryRevision(mock.base44, prior, "admin-1", "before_address_change");
    const moved = { ...prior, latitude: 51, longitude: 5, map_geometry_status: "needs_review", map_geometry_revision: 2 };
    await api.ensureObjectMapGeometryRevision(mock.base44, moved, "admin-1", "address_change", prior);
    expect(mock.revisions[1]).toMatchObject({ revision: 2, anchor_latitude: prior.latitude, anchor_longitude: prior.longitude, building_selection_points: [storedPoint()] });
  });

  it("weigert punten boven het gezamenlijke maximum en verouderde versies", async () => {
    const polygon = feature(); polygon.properties = { source: "manual" };
    const points = Array.from({ length: 100 }, (_, index) => point({ id: `point-${index}`, longitude: 4.3000 + index / 100000 }));
    const mock = backendMock();
    await expect(save(mock, { building_selection_points: points, manual_building_geojson: collection(polygon) })).rejects.toMatchObject({ status: 400 });
    await expect(save(mock, { building_selection_points: [point()] }, 2)).rejects.toMatchObject({ status: 409, details: expect.objectContaining({ code: "object_map_version_conflict" }) });
  });

  it("detecteert overlap met een actief BAG-pand maar slaat gearchiveerde objecten over", async () => {
    const polygon = feature(); polygon.properties = { source: "pdok_bag", source_feature_id: polygon.id, source_status: "Pand in gebruik" };
    const other = objectRecord({ id: "object-2", building_polygon_geojson: collection(polygon) });
    const mock = backendMock({}, [other]);
    const conflicts = await api.buildingAssignmentConflicts(mock.base44, mock.state(), null, null, [storedPoint()]);
    expect(conflicts[0]).toMatchObject({ source: "user_selected", objects: [expect.objectContaining({ object_id: "object-2" })] });
    const archived = backendMock({}, [{ ...other, status: "archived" }]);
    expect(await api.buildingAssignmentConflicts(archived.base44, archived.state(), null, null, [storedPoint()])).toEqual([]);
  });

  it("geeft geldige gebruikerspunten mobiel door zonder BAG- of geometrieclaims", () => {
    const state = mobile.mobileSafeMapState(objectRecord({ building_selection_points: [point({ geometry: feature().geometry })] }));
    expect(state).toMatchObject({ building_selection_points: [storedPoint()], building_selection_mode: "manual", map_geometry_status: "configured", invalid: false });
    expect(state.building_polygon_geojson).toBeNull();
  });

  it("herhaalt dezelfde mutatie via de veilige herstelmarker zonder tweede punt of revisie", async () => {
    const mock = backendMock();
    const first = await save(mock, { building_selection_points: [point()] });
    const replay = await api.customerObjectMutationMarkerReplay(mock.base44, { id: "admin-1" },
      "update_object_map_configuration", body, "map-points-1", "map-points-1-fingerprint",
      "update_object_map_configuration|customer_id:customer-1|object_id:object-1");
    expect(replay.configuration.building_selection_points).toEqual([storedPoint()]);
    expect(replay.configuration.map_geometry_revision).toBe(first.configuration.map_geometry_revision);
    expect(mock.revisions).toHaveLength(1);
    expect(JSON.stringify(replay.audit_result)).not.toContain("building_selection_points");
  });

  it("synchroniseert alleen actieve geldige puntselecties en houdt terrein routegebonden", async () => {
    const selectedObject = objectRecord({ building_selection_points: [storedPoint()], object_area_geojson: collection(feature()) });
    const objects = [selectedObject,
      { ...selectedObject, id: "unrelated" },
      { ...selectedObject, id: "archived", status: "archived" },
      { ...selectedObject, id: "inactive", status: "inactive" },
      { ...selectedObject, id: "invalid", building_selection_points: [point({ latitude: false })] },
      { ...selectedObject, id: "review", map_geometry_status: "needs_review" },
    ];
    const entities = {
      SurveillanceObject: { list: vi.fn(async () => objects) },
      TaskExecution: { filter: vi.fn(async () => [{ id: "task-1", object_id: "object-1", status: "pending", sequence_index: 1 }]) },
      ReportTemplate: { list: vi.fn(async () => []) }, Vehicle: { list: vi.fn(async () => []) },
      Personnel: { list: vi.fn(async () => []) }, ObjectFloorPlan: { filter: vi.fn(async () => []) },
    };
    const result = await mobile.buildPackage({ asServiceRole: { entities } }, { id: "route-1" });
    expect(result.objects_on_map.map(object => object.object_id)).toEqual(["object-1", "unrelated"]);
    expect(result.objects_on_map[0]).toMatchObject({ building_selection_points: [storedPoint()], object_area_geojson: { type: "FeatureCollection" } });
    expect(result.objects_on_map[1]).toMatchObject({ building_selection_points: [storedPoint()], object_area_geojson: null });
  });
});
