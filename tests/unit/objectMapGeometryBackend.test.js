import fs from "node:fs";
import path from "node:path";
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from "node:util";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const customerApiPath = path.join(root, "base44/functions/customerPlatformApi/entry.ts");
const mobileApiPath = path.join(root, "base44/functions/mobileApi/entry.ts");
const customerSource = fs.readFileSync(customerApiPath, "utf8");
const mobileSource = fs.readFileSync(mobileApiPath, "utf8");

let customerBackend;
let mobileBackend;

async function compiledBackend(source, appendedExports) {
  const withoutSdk = source.replace(
    /^import \{ createClientFromRequest(?: as ([A-Za-z0-9_]+))? \} from ["']npm:@base44\/sdk@[^"']+["'];$/gm,
    (_match, alias) => `const ${alias || "createClientFromRequest"} = () => ({});`,
  );
  const { transform } = await import("esbuild");
  const compiled = await transform(`${withoutSdk}\nexport { ${appendedExports.join(", ")} };`, {
    format: "esm",
    loader: "ts",
    target: "es2022",
  });
  return import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString("base64")}`);
}

beforeAll(async () => {
  globalThis.TextEncoder = NodeTextEncoder;
  globalThis.TextDecoder = NodeTextDecoder;
  globalThis.Uint8Array = new NodeTextEncoder().encode("").constructor;
  globalThis.Deno = {
    env: { get: () => undefined },
    serve: () => undefined,
  };
  customerBackend = await compiledBackend(customerSource, [
    "CUSTOMER_OBJECT_CAS_MUTATION_ACTIONS",
    "MUTATION_ACTIONS",
    "READ_ACTIONS",
    "buildingAssignmentConflicts",
    "buildingConflictFingerprint",
    "customerObjectMutationMarkerReplay",
    "ensureObjectMapGeometryRevision",
    "geometriesOverlap",
    "geometrySummary",
    "handleGetObjectMapConfiguration",
    "handleListObjectBuildingCandidates",
    "handleUpdateCustomerObjectIdentity",
    "handleUpdateCustomerObjectOperations",
    "handleUpdateObjectMapConfiguration",
    "handleSetCustomerObjectStatus",
    "normalizedGeoJsonFeatureCollection",
    "normalizedObjectCoordinatePair",
    "objectBuildingSelectionMode",
    "objectHasMapConfiguration",
    "objectIdentityPatch",
    "objectMapAnchor",
    "objectMapGeometryStatus",
    "objectOperationsPatch",
    "pdokBagBaseUrl",
    "recordMutationResult",
    "requireAdmin",
    "safeObjectMapConfiguration",
    "safeObjectMapCoordinate",
    "safeStoredMapGeometry",
  ]);
  mobileBackend = await compiledBackend(mobileSource, [
    "buildPackage",
    "executeMobileRouteAction",
    "mobileBuildingSelectionMode",
    "mobileMapGeometryRevision",
    "mobileMapGeometryStatus",
    "mobileMapCoordinatePair",
    "mobileSafeMapState",
    "requireAuthorizedMobileRoute",
    "requireMobilePersonnel",
    "safeNumber2",
  ]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function rejectedError(promise) {
  let caught;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeTruthy();
  return caught;
}

function squareFeature(id = "bag-building-1", offset = 0) {
  return {
    type: "Feature",
    id,
    properties: {
      identificatie: `0518100000${id}`,
      status: "Pand in gebruik",
    },
    geometry: {
      type: "Polygon",
      coordinates: [[
        [4.3000 + offset, 52.1000],
        [4.3010 + offset, 52.1000],
        [4.3010 + offset, 52.1010],
        [4.3000 + offset, 52.1010],
        [4.3000 + offset, 52.1000],
      ]],
    },
  };
}

function storedBagFeature(id = "bag-building-1") {
  const feature = squareFeature(id);
  return {
    ...feature,
    properties: {
      source: "pdok_bag",
      source_feature_id: id,
      source_identificatie: feature.properties.identificatie,
      source_status: feature.properties.status,
      source_retrieved_at: "2026-09-01T10:00:00.000Z",
    },
  };
}

function surveillanceObject(overrides = {}) {
  return {
    id: "object-1",
    customer_id: "customer-1",
    object_code: "OBJ-001",
    name: "Saturn",
    address: "Voorbeeldweg 1, Utrecht",
    object_type: "industrial_logistics",
    status: "active",
    is_active_customer_object: true,
    show_on_mobile_map: true,
    latitude: 52.1005,
    longitude: 4.3005,
    geocoding_status: "verified",
    building_selection_mode: "manual",
    map_geometry_status: "configured",
    map_geometry_revision: 2,
    building_polygon_geojson: {
      type: "FeatureCollection",
      features: [storedBagFeature()],
    },
    object_area_geojson: null,
    version: 3,
    ...overrides,
  };
}

function mockCustomerPlatform(objectOverrides = {}, otherObjects = [], options = {}) {
  let state = surveillanceObject(objectOverrides);
  let customer = { id: "customer-1", status: "active", version: 1, object_code_mutation_lock: null, ...options.customerOverrides };
  const events = [];
  const mapGeometryRevisions = [];
  const surveillanceEntity = {
    get: vi.fn(async id => id === state.id ? { ...state } : null),
    list: vi.fn(async (_sort, limit = 1_000, skip = 0) => [{ ...state }, ...otherObjects].slice(skip, skip + limit)),
    filter: vi.fn(async () => [{ ...state }]),
    updateMany: vi.fn(async (query, update) => {
      if (options.forceCasConflict) return { success: true, updated: 0 };
      if (query.id !== state.id || query.version !== state.version) return { success: true, updated: 0 };
      state = {
        ...state,
        ...(update.$set || {}),
        version: state.version + Number(update.$inc?.version || 0),
      };
      return { success: true, updated: 1 };
    }),
  };
  const customerEntity = {
    get: vi.fn(async id => id === customer.id ? { ...customer } : null),
    list: vi.fn(async () => [{ ...customer }]),
    updateMany: vi.fn(async (query, update) => {
      if (query.id !== customer.id || query.version !== customer.version) return { success: true, updated: 0 };
      customer = {
        ...customer,
        ...(update.$set || {}),
        version: customer.version + Number(update.$inc?.version || 0),
      };
      return { success: true, updated: 1 };
    }),
  };
  const base44 = {
    asServiceRole: {
      entities: {
        Customer: customerEntity,
        SurveillanceObject: surveillanceEntity,
        ObjectMapGeometryRevision: {
          filter: vi.fn(async query => mapGeometryRevisions.filter(record =>
            record.object_id === query.object_id &&
            (query.revision === undefined || record.revision === query.revision))),
          create: vi.fn(async value => {
            const record = { id: `map-revision-${mapGeometryRevisions.length + 1}`, ...value };
            mapGeometryRevisions.push(record);
            return record;
          }),
        },
        CustomerEvent: {
          filter: vi.fn(async query => events.filter(event => event.idempotency_key === query.idempotency_key)),
          create: vi.fn(async value => {
            const event = { id: `event-${events.length + 1}`, ...value };
            events.push(event);
            return event;
          }),
        },
      },
    },
  };
  return { base44, events, mapGeometryRevisions, surveillanceEntity, state: () => state };
}

describe("Kaart en terrein backendcontract", () => {
  it("registreert alle kaartacties in de bestaande read-, mutatie- en CAS-contracten", () => {
    expect(customerBackend.READ_ACTIONS.has("get_object_map_configuration")).toBe(true);
    expect(customerBackend.READ_ACTIONS.has("list_object_building_candidates")).toBe(true);
    expect(customerBackend.MUTATION_ACTIONS.has("update_object_map_configuration")).toBe(true);
    expect(customerBackend.CUSTOMER_OBJECT_CAS_MUTATION_ACTIONS.has("update_object_map_configuration")).toBe(true);
    expect(() => customerBackend.requireAdmin({ role: "employee" })).toThrow("Alleen backofficebeheerders");
  });

  it("declareert de kaartmetadata additief op SurveillanceObject", () => {
    const schema = JSON.parse(fs.readFileSync(path.join(root, "base44/entities/SurveillanceObject.jsonc"), "utf8"));
    expect(schema.properties.building_selection_mode).toMatchObject({
      type: "string",
      enum: ["automatic", "manual"],
      default: "automatic",
    });
    expect(schema.properties.map_geometry_status.enum).toEqual(["unconfigured", "configured", "needs_review"]);
    expect(schema.properties.map_geometry_revision).toMatchObject({ type: "integer", minimum: 0, default: 0 });
    expect(schema.properties).toHaveProperty("map_geometry_hash");
    expect(schema.properties).toHaveProperty("map_geometry_updated_at");
    expect(schema.properties).toHaveProperty("map_geometry_updated_by_user_id");
    expect(schema.properties).toHaveProperty("map_geometry_review_reason");
    expect(schema.rls).toMatchObject({ create: false, update: false, delete: false });

    const historySchema = JSON.parse(fs.readFileSync(
      path.join(root, "base44/entities/ObjectMapGeometryRevision.jsonc"),
      "utf8",
    ));
    expect(historySchema.rls).toEqual({ create: false, read: false, update: false, delete: false });
    expect(historySchema.required).toEqual(expect.arrayContaining([
      "customer_id",
      "object_id",
      "revision",
      "geometry_hash",
      "anchor_latitude",
      "anchor_longitude",
    ]));
  });

  it("normaliseert WGS84-polygonen, verwijdert vrije properties en weigert zelfdoorsnijding", () => {
    const normalized = customerBackend.normalizedGeoJsonFeatureCollection(
      { type: "FeatureCollection", features: [{ ...squareFeature(), properties: { secret: "niet bewaren" } }] },
      "Gebouw",
      {
        anchor: [4.3005, 52.1005],
        maxFeatures: 10,
        maxAreaSquareMeters: 5_000_000,
        properties: () => ({ source: "manual", local_id: "manual:1" }),
      },
    );
    expect(normalized.features[0].properties).toEqual({ source: "manual", local_id: "manual:1" });
    expect(customerBackend.geometrySummary(normalized)).toMatchObject({
      feature_count: 1,
      vertex_count: 5,
      manual_feature_count: 1,
    });

    const crossed = squareFeature();
    crossed.geometry.coordinates = [[
      [4.3000, 52.1000],
      [4.3010, 52.1010],
      [4.3010, 52.1000],
      [4.3000, 52.1010],
      [4.3000, 52.1000],
    ]];
    expect(() => customerBackend.normalizedGeoJsonFeatureCollection(
      { type: "FeatureCollection", features: [crossed] },
      "Gebouw",
      {
        anchor: [4.3005, 52.1005],
        maxFeatures: 10,
        maxAreaSquareMeters: 5_000_000,
        properties: () => ({}),
      },
    )).toThrow("zelfdoorsnijding");

    expect(() => customerBackend.normalizedGeoJsonFeatureCollection(
      { type: "FeatureCollection", features: [squareFeature("te-ver", 1)] },
      "Gebouw",
      {
        anchor: [4.3005, 52.1005],
        maxFeatures: 10,
        maxAreaSquareMeters: 5_000_000,
        properties: () => ({}),
      },
    )).toThrow("te ver");
  });

  it("migreert lege legacy FeatureCollections niet en leest de PDOK-config zonder Deno-runtime", () => {
    const empty = { type: "FeatureCollection", features: [] };
    expect(customerBackend.objectBuildingSelectionMode({ building_polygon_geojson: empty })).toBe("automatic");
    expect(customerBackend.objectMapGeometryStatus({ building_polygon_geojson: empty, object_area_geojson: empty })).toBe("unconfigured");
    expect(customerBackend.objectHasMapConfiguration({ building_polygon_geojson: empty, object_area_geojson: empty })).toBe(false);

    const legacyConfiguration = customerBackend.safeObjectMapConfiguration(surveillanceObject({
      building_selection_mode: "automatic",
      map_geometry_status: "unconfigured",
      building_polygon_geojson: { type: "FeatureCollection", features: [squareFeature("legacy-gebouw")] },
    }));
    expect(legacyConfiguration).toMatchObject({
      building_selection_mode: "manual",
      map_geometry_status: "configured",
    });
    expect(legacyConfiguration.manual_building_geojson.features[0].properties).toMatchObject({
      source: "manual",
      local_id: "legacy-gebouw",
    });

    const previousDeno = globalThis.Deno;
    try {
      delete globalThis.Deno;
      expect(customerBackend.pdokBagBaseUrl()).toBe("https://api.pdok.nl/kadaster/bag/ogc/v2");
    } finally {
      globalThis.Deno = previousDeno;
    }
  });

  it("serializeert ontbrekende kaartcoördinaten nooit als 0,0", () => {
    [null, undefined, "", " ", false, [], {}].forEach(value => {
      expect(customerBackend.safeObjectMapCoordinate(value, -180, 180)).toBeNull();
    });
    expect(customerBackend.safeObjectMapCoordinate(0, -180, 180)).toBe(0);
    expect(customerBackend.safeObjectMapCoordinate("0", -180, 180)).toBe(0);
    expect(customerBackend.normalizedObjectCoordinatePair(0, "0")).toEqual({
      latitude: null,
      longitude: null,
    });
    expect(customerBackend.normalizedObjectCoordinatePair(0, 4.3)).toEqual({
      latitude: 0,
      longitude: 4.3,
    });
    expect(customerBackend.normalizedObjectCoordinatePair(52.1, 0)).toEqual({
      latitude: 52.1,
      longitude: 0,
    });

    expect(customerBackend.safeObjectMapConfiguration(surveillanceObject({
      latitude: null,
      longitude: " ",
      building_polygon_geojson: null,
      object_area_geojson: null,
    })).object).toMatchObject({ latitude: null, longitude: null });

    expect(customerBackend.safeObjectMapConfiguration(surveillanceObject({
      latitude: 0,
      longitude: "0",
      building_polygon_geojson: null,
      object_area_geojson: null,
      building_selection_mode: "automatic",
      map_geometry_status: "unconfigured",
    })).object).toMatchObject({
      latitude: null,
      longitude: null,
      show_on_mobile_map: false,
    });

    expect(customerBackend.safeObjectMapConfiguration(surveillanceObject({
      latitude: 0,
      longitude: 0,
    }))).toMatchObject({
      map_geometry_status: "needs_review",
      map_geometry_review_reason: "stored_geometry_invalid",
      building_polygon_geojson: null,
      object: {
        latitude: null,
        longitude: null,
        show_on_mobile_map: false,
      },
    });

    expect(customerBackend.safeObjectMapConfiguration(surveillanceObject({
      latitude: 0,
      longitude: 4.3,
      building_polygon_geojson: null,
      object_area_geojson: null,
      building_selection_mode: "automatic",
      map_geometry_status: "unconfigured",
    })).object).toMatchObject({
      latitude: 0,
      longitude: 4.3,
      show_on_mobile_map: true,
    });
  });

  it("weigert Null Island als kaartanker maar behoudt geldige nulcoördinaten", () => {
    expect(() => customerBackend.objectMapAnchor(surveillanceObject({
      latitude: 0,
      longitude: 0,
    }))).toThrow("Controleer eerst de kaartpositie");
    expect(customerBackend.objectMapAnchor(surveillanceObject({
      latitude: 0,
      longitude: 4.3,
    }))).toEqual([4.3, 0]);
    expect(customerBackend.objectMapAnchor(surveillanceObject({
      latitude: 52.1,
      longitude: 0,
    }))).toEqual([0, 52.1]);
  });

  it("normaliseert 0,0 bij objectmutaties naar ontbrekend en vereist daarna een echte geverifieerde locatie", () => {
    const objectWithoutLocation = surveillanceObject({
      latitude: null,
      longitude: null,
      geocoding_status: "unverified",
      building_polygon_geojson: null,
      object_area_geojson: null,
      building_selection_mode: "automatic",
      map_geometry_status: "unconfigured",
    });

    expect(customerBackend.objectIdentityPatch({
      latitude: 0,
      longitude: "0",
      geocoding_status: "unverified",
      bag_address_id: "onjuist-adres",
    }, objectWithoutLocation)).toMatchObject({
      latitude: null,
      longitude: null,
      bag_address_id: null,
      geocoding_status: "unverified",
    });
    expect(() => customerBackend.objectIdentityPatch({
      latitude: 0,
      longitude: 0,
      geocoding_status: "verified",
    }, objectWithoutLocation)).toThrow("vereist geldige coördinaten");
    expect(customerBackend.objectIdentityPatch({
      latitude: 0,
      longitude: 4.3,
      geocoding_status: "manual",
    }, objectWithoutLocation)).toMatchObject({
      latitude: 0,
      longitude: 4.3,
      geocoding_status: "manual",
    });

    const nullIslandActiveObject = surveillanceObject({
      latitude: 0,
      longitude: 0,
      building_polygon_geojson: null,
      object_area_geojson: null,
      building_selection_mode: "automatic",
      map_geometry_status: "unconfigured",
      show_on_mobile_map: false,
    });
    expect(() => customerBackend.objectOperationsPatch({
      show_on_mobile_map: true,
    }, nullIslandActiveObject)).toThrow("geldige locatiecoördinaten");
    expect(customerBackend.objectOperationsPatch({
      show_on_mobile_map: true,
    }, {
      ...nullIslandActiveObject,
      longitude: 4.3,
    })).toMatchObject({ show_on_mobile_map: true });
  });

  it("schrijft nooit een revisieanker op 0,0 en bewaart onbruikbare legacyhistorie zonder herstel te blokkeren", async () => {
    const nullIsland = mockCustomerPlatform({
      latitude: 0,
      longitude: 0,
      building_polygon_geojson: null,
      object_area_geojson: null,
      map_geometry_status: "configured",
    });
    await expect(customerBackend.ensureObjectMapGeometryRevision(
      nullIsland.base44,
      nullIsland.state(),
      "admin-1",
      "test_null_island",
    )).resolves.toBeNull();
    expect(nullIsland.mapGeometryRevisions).toHaveLength(0);
    nullIsland.mapGeometryRevisions.push({
      id: "legacy-null-island-revision",
      customer_id: "customer-1",
      object_id: "object-1",
      revision: 2,
      geometry_hash: "legacy-invalid-anchor",
      anchor_latitude: 0,
      anchor_longitude: 0,
    });
    await expect(customerBackend.ensureObjectMapGeometryRevision(
      nullIsland.base44,
      nullIsland.state(),
      "admin-1",
      "test_existing_null_island",
    )).resolves.toBeNull();
    expect(nullIsland.mapGeometryRevisions).toEqual([
      expect.objectContaining({
        id: "legacy-null-island-revision",
        anchor_latitude: 0,
        anchor_longitude: 0,
      }),
    ]);

    const equator = mockCustomerPlatform({
      latitude: 0,
      longitude: 4.3,
      building_polygon_geojson: null,
      object_area_geojson: null,
      map_geometry_status: "configured",
    });
    await expect(customerBackend.ensureObjectMapGeometryRevision(
      equator.base44,
      equator.state(),
      "admin-1",
      "test_equator",
    )).resolves.toMatchObject({
      anchor_latitude: 0,
      anchor_longitude: 4.3,
    });
    expect(equator.mapGeometryRevisions).toHaveLength(1);
  });

  it("laat na een legacy 0,0-revisie eerst het adres en daarna de kaartconfiguratie herstellen", async () => {
    const setup = mockCustomerPlatform({
      latitude: 0,
      longitude: 0,
      geocoding_status: "verified",
    });
    setup.mapGeometryRevisions.push({
      id: "legacy-null-island-revision",
      customer_id: "customer-1",
      object_id: "object-1",
      revision: 2,
      geometry_hash: "legacy-invalid-anchor",
      building_selection_mode: "manual",
      map_geometry_status: "configured",
      building_polygon_geojson: setup.state().building_polygon_geojson,
      object_area_geojson: null,
      anchor_latitude: 0,
      anchor_longitude: 0,
      recorded_at: "2026-09-01T10:00:00.000Z",
      source_action: "legacy_bug",
    });

    await expect(customerBackend.handleUpdateCustomerObjectIdentity(
      setup.base44,
      { id: "admin-1" },
      {
        customer_id: "customer-1",
        object_id: "object-1",
        data: {
          address: "Voorbeeldweg 1, Utrecht",
          latitude: 52.1005,
          longitude: 4.3005,
          geocoding_status: "verified",
          bag_address_id: "nummeraanduiding-1",
        },
      },
      3,
      "identity-repair-null-island",
      "fingerprint-identity-repair-null-island",
      "update_customer_object_identity|customer_id:customer-1|object_id:object-1",
    )).resolves.toMatchObject({ outcome: "success" });

    expect(setup.state()).toMatchObject({
      latitude: 52.1005,
      longitude: 4.3005,
      map_geometry_status: "needs_review",
      map_geometry_revision: 3,
      show_on_mobile_map: false,
    });
    expect(setup.mapGeometryRevisions).toHaveLength(1);

    await expect(customerBackend.handleUpdateObjectMapConfiguration(
      setup.base44,
      { id: "admin-1" },
      {
        customer_id: "customer-1",
        object_id: "object-1",
        data: {
          building_selection_mode: "manual",
          selected_bag_feature_ids: ["bag-building-1"],
          object_area_geojson: null,
          show_on_mobile_map: true,
        },
      },
      4,
      "map-repair-null-island",
      "fingerprint-map-repair-null-island",
      "update_object_map_configuration|customer_id:customer-1|object_id:object-1",
    )).resolves.toMatchObject({ outcome: "success" });

    expect(setup.state()).toMatchObject({
      map_geometry_status: "configured",
      map_geometry_revision: 4,
      show_on_mobile_map: true,
    });
    expect(setup.mapGeometryRevisions).toEqual([
      expect.objectContaining({
        id: "legacy-null-island-revision",
        anchor_latitude: 0,
        anchor_longitude: 0,
      }),
      expect.objectContaining({
        revision: 3,
        anchor_latitude: 52.1005,
        anchor_longitude: 4.3005,
      }),
      expect.objectContaining({
        revision: 4,
        anchor_latitude: 52.1005,
        anchor_longitude: 4.3005,
      }),
    ]);
  });

  it("levert legacygeometrie alleen gecanonicaliseerd uit en behandelt ongeldige opslag als needs_review", () => {
    const validLegacy = squareFeature("legacy-safe");
    validLegacy.properties = { vrije_tekst: "mag niet uitlekken" };
    const valid = customerBackend.safeObjectMapConfiguration(surveillanceObject({
      building_polygon_geojson: { type: "FeatureCollection", features: [validLegacy] },
      object_area_geojson: null,
      building_selection_mode: "automatic",
      map_geometry_status: "unconfigured",
    }));
    expect(valid.building_polygon_geojson.features[0].properties).toEqual({
      source: "manual",
      local_id: "legacy-safe",
    });
    expect(JSON.stringify(valid)).not.toContain("mag niet uitlekken");

    const invalidLegacy = squareFeature("legacy-open");
    invalidLegacy.geometry.coordinates[0].pop();
    const invalidObject = surveillanceObject({
      building_polygon_geojson: { type: "FeatureCollection", features: [invalidLegacy] },
      object_area_geojson: null,
    });
    const invalid = customerBackend.safeObjectMapConfiguration(invalidObject);
    expect(invalid).toMatchObject({
      map_geometry_status: "needs_review",
      map_geometry_review_reason: "stored_geometry_invalid",
      building_polygon_geojson: null,
      building_summary: { feature_count: 0, area_sqm: 0 },
      object: { show_on_mobile_map: false },
    });
    expect(() => customerBackend.geometrySummary({
      type: "FeatureCollection",
      features: [{ type: "Feature", geometry: { type: "Polygon", coordinates: null } }],
    })).not.toThrow();
  });

  it("geeft BAG-kandidaten alleen via de gecontroleerde objectlocatie en met gesaneerde bronvelden", async () => {
    const { base44 } = mockCustomerPlatform({ building_polygon_geojson: null, building_selection_mode: "automatic" });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      type: "FeatureCollection",
      features: [squareFeature("pdok-uuid-1")],
      links: [{ rel: "next", href: "https://api.pdok.nl/kadaster/bag/ogc/v2/collections/pand/items?cursor=NATx%7Ct2RoxA&limit=20" }],
    }), { status: 200, headers: { "content-type": "application/geo+json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await customerBackend.handleListObjectBuildingCandidates(base44, {
      customer_id: "customer-1",
      object_id: "object-1",
      radius_meters: 200,
      limit: 20,
      cursor: "FIRST|cursor_1",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: "pdok-uuid-1",
      properties: {
        source: "pdok_bag",
        source_feature_id: "pdok-uuid-1",
        source_status: "Pand in gebruik",
      },
    });
    expect(result.items[0].properties).not.toHaveProperty("secret");
    const requestUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(requestUrl.hostname).toBe("api.pdok.nl");
    expect(requestUrl.pathname).toContain("/collections/pand/items");
    expect(requestUrl.searchParams.get("bbox")).toBeTruthy();
    expect(requestUrl.searchParams.get("crs")).toContain("CRS84");
    expect(requestUrl.searchParams.get("cursor")).toBe("FIRST|cursor_1");
    expect(result).toMatchObject({
      cursor: "FIRST|cursor_1",
      next_cursor: "NATx|t2RoxA",
      has_more: true,
    });

    await expect(customerBackend.handleListObjectBuildingCandidates(base44, {
      customer_id: "customer-1",
      object_id: "object-1",
      cursor: "https://kwaad.example/volgende-pagina",
    })).rejects.toMatchObject({ status: 400 });
  });

  it("vraagt PDOK niet aan wanneer de objectlocatie ontbreekt", async () => {
    const { base44 } = mockCustomerPlatform({
      latitude: null,
      longitude: " ",
      geocoding_status: "verified",
      building_polygon_geojson: null,
      object_area_geojson: null,
      building_selection_mode: "automatic",
      map_geometry_status: "unconfigured",
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(customerBackend.handleListObjectBuildingCandidates(base44, {
      customer_id: "customer-1",
      object_id: "object-1",
    })).rejects.toMatchObject({
      status: 409,
      details: { code: "object_map_location_unverified" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("hergebruikt een bestaande canonieke BAG-selectie, bewaart raw geometrie alleen op het object en logt een veilige samenvatting", async () => {
    const { base44, events, mapGeometryRevisions, state } = mockCustomerPlatform();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await customerBackend.handleUpdateObjectMapConfiguration(
      base44,
      { id: "admin-1" },
      {
        customer_id: "customer-1",
        object_id: "object-1",
        data: {
          building_selection_mode: "manual",
          selected_bag_feature_ids: ["bag-building-1"],
          manual_building_geojson: { type: "FeatureCollection", features: [] },
          object_area_geojson: { type: "FeatureCollection", features: [] },
          show_on_mobile_map: true,
        },
      },
      3,
      "map-update-1",
      "fingerprint-1",
      "update_object_map_configuration|customer_id:customer-1|object_id:object-1",
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.configuration).toMatchObject({
      version: 4,
      building_selection_mode: "manual",
      map_geometry_status: "configured",
      map_geometry_revision: 3,
      selected_bag_feature_ids: ["bag-building-1"],
    });
    expect(result.configuration.object_area_geojson).toBeNull();
    expect(result.configuration.manual_building_geojson).toBeNull();
    expect(JSON.stringify(result.audit_result)).not.toContain("coordinates");
    const serializedRecovery = JSON.stringify(state().customer_platform_last_mutation_recovery);
    expect(serializedRecovery).not.toContain("coordinates");
    expect(serializedRecovery).not.toContain("FeatureCollection");
    expect(serializedRecovery).not.toContain("building_polygon_geojson");
    expect(serializedRecovery).not.toContain("object_area_geojson");
    expect(state().building_polygon_geojson.features[0].geometry.type).toBe("Polygon");
    expect(mapGeometryRevisions).toHaveLength(2);
    expect(mapGeometryRevisions.map(record => record.revision)).toEqual([2, 3]);
    expect(mapGeometryRevisions[0].building_polygon_geojson.features[0].geometry.coordinates).toBeTruthy();
    expect(mapGeometryRevisions[0]).toMatchObject({
      anchor_latitude: 52.1005,
      anchor_longitude: 4.3005,
    });

    await customerBackend.recordMutationResult(
      base44,
      { id: "admin-1", full_name: "Testbeheerder" },
      "update_object_map_configuration",
      "event-map-update-1",
      result,
      { customer_id: "customer-1", object_id: "object-1" },
      "fingerprint-1",
      "update_object_map_configuration|customer_id:customer-1|object_id:object-1",
    );
    const serializedAudit = JSON.stringify(events[0].payload.result);
    expect(serializedAudit).not.toContain("coordinates");
    expect(serializedAudit).not.toContain("FeatureCollection");
    expect(serializedAudit).not.toContain("building_polygon_geojson");
    expect(serializedAudit).not.toContain("object_area_geojson");

    const replay = await customerBackend.customerObjectMutationMarkerReplay(
      base44,
      { id: "admin-1" },
      "update_object_map_configuration",
      { customer_id: "customer-1", object_id: "object-1" },
      "map-update-1",
      "fingerprint-1",
      "update_object_map_configuration|customer_id:customer-1|object_id:object-1",
    );
    expect(replay.configuration.building_polygon_geojson.features).toHaveLength(1);
    expect(JSON.stringify(replay.audit_result)).not.toContain("coordinates");
    await customerBackend.recordMutationResult(
      base44,
      { id: "admin-1", full_name: "Testbeheerder" },
      "update_object_map_configuration",
      "event-map-replay-1",
      replay,
      { customer_id: "customer-1", object_id: "object-1" },
      "fingerprint-1",
      "update_object_map_configuration|customer_id:customer-1|object_id:object-1",
    );
    expect(JSON.stringify(events[1].payload.result)).not.toContain("coordinates");
    expect(JSON.stringify(events[1].payload.result)).not.toContain("FeatureCollection");
    await expect(customerBackend.customerObjectMutationMarkerReplay(
      base44,
      { id: "admin-1" },
      "update_object_map_configuration",
      { customer_id: "customer-1", object_id: "object-1" },
      "map-update-1",
      "andere-fingerprint",
      "update_object_map_configuration|customer_id:customer-1|object_id:object-1",
    )).rejects.toMatchObject({ status: 409 });
  });

  it("behoudt legacy mobiele zichtbaarheid als show_on_mobile_map nog ontbreekt", async () => {
    const { base44, state } = mockCustomerPlatform({ show_on_mobile_map: undefined });
    vi.stubGlobal("fetch", vi.fn());

    const result = await customerBackend.handleUpdateObjectMapConfiguration(
      base44,
      { id: "admin-1" },
      {
        customer_id: "customer-1",
        object_id: "object-1",
        data: {
          building_selection_mode: "manual",
          selected_bag_feature_ids: ["bag-building-1"],
        },
      },
      3,
      "map-update-legacy-visible",
      "fingerprint-legacy-visible",
      "update_object_map_configuration|customer_id:customer-1|object_id:object-1",
    );

    expect(result.configuration.object.show_on_mobile_map).toBe(true);
    expect(state().show_on_mobile_map).toBe(true);
  });

  it("accepteert in automatic-modus lege client-FeatureCollections als bewust geen handmatige geometrie", async () => {
    const { base44 } = mockCustomerPlatform({
      building_polygon_geojson: null,
      building_selection_mode: "automatic",
      map_geometry_status: "unconfigured",
    });
    vi.stubGlobal("fetch", vi.fn());

    const result = await customerBackend.handleUpdateObjectMapConfiguration(
      base44,
      { id: "admin-1" },
      {
        customer_id: "customer-1",
        object_id: "object-1",
        data: {
          building_selection_mode: "automatic",
          selected_bag_feature_ids: [],
          manual_building_geojson: { type: "FeatureCollection", features: [] },
          object_area_geojson: { type: "FeatureCollection", features: [] },
        },
      },
      3,
      "map-automatic-empty",
      "fingerprint-automatic-empty",
      "update_object_map_configuration|customer_id:customer-1|object_id:object-1",
    );

    expect(result.configuration).toMatchObject({
      building_selection_mode: "automatic",
      building_polygon_geojson: null,
      manual_building_geojson: null,
      object_area_geojson: null,
    });
  });

  it("weigert foutief getypeerde lege geometriewaarden in plaats van ze stil als wissen te behandelen", async () => {
    const { base44 } = mockCustomerPlatform({
      building_polygon_geojson: null,
      building_selection_mode: "automatic",
      map_geometry_status: "unconfigured",
    });
    vi.stubGlobal("fetch", vi.fn());

    await expect(customerBackend.handleUpdateObjectMapConfiguration(
      base44,
      { id: "admin-1" },
      {
        customer_id: "customer-1",
        object_id: "object-1",
        data: {
          building_selection_mode: "automatic",
          selected_bag_feature_ids: [],
          manual_building_geojson: false,
        },
      },
      3,
      "map-invalid-manual",
      "fingerprint-invalid-manual",
      "update_object_map_configuration|customer_id:customer-1|object_id:object-1",
    )).rejects.toMatchObject({ status: 400 });

    await expect(customerBackend.handleUpdateObjectMapConfiguration(
      base44,
      { id: "admin-1" },
      {
        customer_id: "customer-1",
        object_id: "object-1",
        data: {
          building_selection_mode: "automatic",
          selected_bag_feature_ids: [],
          object_area_geojson: false,
        },
      },
      3,
      "map-invalid-terrain",
      "fingerprint-invalid-terrain",
      "update_object_map_configuration|customer_id:customer-1|object_id:object-1",
    )).rejects.toMatchObject({ status: 400 });
  });

  it("werkt terrein bij met dezelfde BAG-selectie tijdens PDOK-uitval, maar accepteert dan geen nieuw pand", async () => {
    const manualFeature = squareFeature("handmatig-1", 0.001);
    manualFeature.properties = { source: "manual", local_id: "handmatig-1" };
    const { base44, state } = mockCustomerPlatform({
      building_polygon_geojson: {
        type: "FeatureCollection",
        features: [storedBagFeature(), manualFeature],
      },
    });
    const fetchMock = vi.fn(async () => { throw new TypeError("PDOK offline"); });
    vi.stubGlobal("fetch", fetchMock);
    const terrain = {
      type: "FeatureCollection",
      features: [{ ...squareFeature("terrein"), properties: {} }],
    };

    await customerBackend.handleUpdateObjectMapConfiguration(
      base44,
      { id: "admin-1" },
      {
        customer_id: "customer-1",
        object_id: "object-1",
        data: {
          building_selection_mode: "manual",
          selected_bag_feature_ids: ["bag-building-1"],
          object_area_geojson: terrain,
        },
      },
      3,
      "map-pdok-existing",
      "fingerprint-pdok-existing",
      "update_object_map_configuration|customer_id:customer-1|object_id:object-1",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state().object_area_geojson.features).toHaveLength(1);
    expect(state().building_polygon_geojson.features).toHaveLength(2);

    await expect(customerBackend.handleUpdateObjectMapConfiguration(
      base44,
      { id: "admin-1" },
      {
        customer_id: "customer-1",
        object_id: "object-1",
        data: {
          building_selection_mode: "manual",
          selected_bag_feature_ids: ["bag-building-1", "nieuw-pand"],
        },
      },
      4,
      "map-pdok-new",
      "fingerprint-pdok-new",
      "update_object_map_configuration|customer_id:customer-1|object_id:object-1",
    )).rejects.toMatchObject({
      status: 503,
      details: expect.objectContaining({ code: "pdok_bag_unavailable", retryable: true }),
    });
    expect(state().building_polygon_geojson.features).toHaveLength(2);
  });

  it("maakt bestaande kaartgeometrie na een locatieverandering reviewplichtig zonder contouren te verwijderen", async () => {
    const originalGeometry = surveillanceObject().building_polygon_geojson;
    const { base44, mapGeometryRevisions, state } = mockCustomerPlatform();

    const result = await customerBackend.handleUpdateCustomerObjectIdentity(
      base44,
      { id: "admin-1" },
      {
        customer_id: "customer-1",
        object_id: "object-1",
        data: { address: "Nieuweweg 5, Utrecht" },
      },
      3,
      "identity-update-1",
      "fingerprint-identity",
      "update_customer_object_identity|customer_id:customer-1|object_id:object-1",
    );

    expect(state().building_polygon_geojson).toEqual(originalGeometry);
    expect(state()).toMatchObject({
      map_geometry_status: "needs_review",
      map_geometry_review_reason: "object_location_changed",
      map_geometry_revision: 3,
      show_on_mobile_map: false,
    });
    expect(result.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "map_geometry_status", after: "needs_review" }),
    ]));
    expect(mapGeometryRevisions).toHaveLength(2);
    expect(mapGeometryRevisions.map(record => ({
      revision: record.revision,
      status: record.map_geometry_status,
    }))).toEqual([
      { revision: 2, status: "configured" },
      { revision: 3, status: "needs_review" },
    ]);
    expect(mapGeometryRevisions[0].building_polygon_geojson.features[0].geometry.coordinates).toBeTruthy();
    expect(JSON.stringify(result)).not.toContain("coordinates");
    expect(JSON.stringify(state().customer_platform_last_mutation_recovery)).not.toContain("coordinates");

    // Simuleer een storing tussen de object-CAS en het vastleggen van de
    // needs_review-snapshot. Marker-replay herstelt uit de function-only vorige
    // revisie, zonder raw geometrie uit audit of recovery nodig te hebben.
    mapGeometryRevisions.pop();
    await customerBackend.customerObjectMutationMarkerReplay(
      base44,
      { id: "admin-1" },
      "update_customer_object_identity",
      { customer_id: "customer-1", object_id: "object-1" },
      "identity-update-1",
      "fingerprint-identity",
      "update_customer_object_identity|customer_id:customer-1|object_id:object-1",
    );
    expect(mapGeometryRevisions).toHaveLength(2);
    expect(mapGeometryRevisions[1]).toMatchObject({
      revision: 3,
      map_geometry_status: "needs_review",
      anchor_latitude: 52.1005,
      anchor_longitude: 4.3005,
    });
    expect(() => customerBackend.objectOperationsPatch(
      { show_on_mobile_map: true },
      state(),
    )).toThrow("Controleer en bevestig eerst opnieuw");
  });

  it("eist een expliciete reden voor een nieuw gedeeld BAG-pand", async () => {
    const other = surveillanceObject({
      id: "object-2",
      customer_id: "customer-2",
      object_code: "OBJ-002",
      name: "Andere huurder",
      version: 1,
    });
    const otherObjects = [other];
    const { base44 } = mockCustomerPlatform({
      building_polygon_geojson: null,
      building_selection_mode: "automatic",
      map_geometry_status: "unconfigured",
    }, otherObjects);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(squareFeature()), { status: 200 })));

    const conflictError = await rejectedError(customerBackend.handleUpdateObjectMapConfiguration(
      base44,
      { id: "admin-1" },
      {
        customer_id: "customer-1",
        object_id: "object-1",
        data: {
          building_selection_mode: "manual",
          selected_bag_feature_ids: ["bag-building-1"],
          manual_building_geojson: null,
          object_area_geojson: null,
          show_on_mobile_map: true,
        },
      },
      3,
      "map-overlap-1",
      "fingerprint-overlap",
      "update_object_map_configuration|customer_id:customer-1|object_id:object-1",
    ));
    expect(conflictError).toMatchObject({
      status: 409,
      details: expect.objectContaining({
        code: "building_assignment_overlap_confirmation_required",
        conflict_fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    });

    otherObjects.push(surveillanceObject({
      id: "object-3",
      customer_id: "customer-3",
      object_code: "OBJ-003",
      name: "Derde huurder",
      version: 1,
    }));
    const staleConfirmation = await rejectedError(customerBackend.handleUpdateObjectMapConfiguration(
      base44,
      { id: "admin-1" },
      {
        customer_id: "customer-1",
        object_id: "object-1",
        data: {
          building_selection_mode: "manual",
          selected_bag_feature_ids: ["bag-building-1"],
          overlap_confirmation: {
            confirmed: true,
            reason: "Twee huurders delen dit bedrijfsgebouw",
            conflict_fingerprint: conflictError.details.conflict_fingerprint,
          },
        },
      },
      3,
      "map-overlap-stale",
      "fingerprint-overlap-stale",
      "update_object_map_configuration|customer_id:customer-1|object_id:object-1",
    ));
    expect(staleConfirmation).toMatchObject({
      status: 409,
      details: expect.objectContaining({
        code: "building_assignment_overlap_confirmation_required",
        conflict_fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    });
    expect(staleConfirmation.details.conflict_fingerprint)
      .not.toBe(conflictError.details.conflict_fingerprint);

    const confirmed = await customerBackend.handleUpdateObjectMapConfiguration(
      base44,
      { id: "admin-1" },
      {
        customer_id: "customer-1",
        object_id: "object-1",
        data: {
          building_selection_mode: "manual",
          selected_bag_feature_ids: ["bag-building-1"],
          overlap_confirmation: {
            confirmed: true,
            reason: "Twee huurders delen dit bedrijfsgebouw",
            conflict_fingerprint: staleConfirmation.details.conflict_fingerprint,
          },
        },
      },
      3,
      "map-overlap-2",
      "fingerprint-overlap-confirmed",
      "update_object_map_configuration|customer_id:customer-1|object_id:object-1",
    );
    expect(confirmed.audit_result.overlap_confirmation).toMatchObject({
      confirmed: true,
      conflict_count: 1,
      conflict_fingerprint: staleConfirmation.details.conflict_fingerprint,
    });
    expect(JSON.stringify(confirmed.audit_result)).not.toContain("coordinates");
  });

  it("maakt een stabiele fingerprint van alleen de canonieke conflictbinding", async () => {
    const first = [
      {
        feature_key: "pdok_bag:pand-b",
        source: "pdok_bag",
        source_feature_id: "pand-b",
        objects: [{ object_id: "object-2" }, { object_id: "object-1" }],
        geometry: squareFeature("niet-opnemen").geometry,
      },
      {
        feature_key: "manual:entree",
        source: "manual",
        source_feature_id: null,
        objects: [{ object_id: "object-3" }],
      },
    ];
    const reordered = [
      { ...first[1], objects: [...first[1].objects].reverse() },
      { ...first[0], objects: [...first[0].objects].reverse(), geometry: squareFeature("anders").geometry },
    ];
    const fingerprint = await customerBackend.buildingConflictFingerprint(first);
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(await customerBackend.buildingConflictFingerprint(reordered)).toBe(fingerprint);
    expect(await customerBackend.buildingConflictFingerprint([
      { ...first[0], objects: [{ object_id: "object-4" }] },
      first[1],
    ])).not.toBe(fingerprint);
  });

  it("ziet een gedeelde gevel niet als overlap, maar detecteert echte BAG- en handmatige vlakoverlap", async () => {
    const left = squareFeature("left", 0).geometry;
    const touching = squareFeature("touching", 0.001).geometry;
    const overlapping = squareFeature("overlapping", 0.0005).geometry;
    expect(customerBackend.geometriesOverlap(left, touching)).toBe(false);
    expect(customerBackend.geometriesOverlap(left, overlapping)).toBe(true);

    const otherManual = squareFeature("other-manual", 0.0005);
    otherManual.properties = { source: "manual", local_id: "other-manual" };
    const other = surveillanceObject({
      id: "object-2",
      customer_id: "customer-2",
      object_code: "OBJ-002",
      name: "Andere huurder",
      building_polygon_geojson: { type: "FeatureCollection", features: [otherManual] },
    });
    const ownManual = squareFeature("own-manual", 0);
    ownManual.properties = { source: "manual", local_id: "own-manual" };
    const { base44, state } = mockCustomerPlatform({
      building_polygon_geojson: null,
      building_selection_mode: "automatic",
      map_geometry_status: "unconfigured",
    }, [other]);
    const conflicts = await customerBackend.buildingAssignmentConflicts(
      base44,
      state(),
      { type: "FeatureCollection", features: [ownManual] },
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      source: "manual",
      objects: [expect.objectContaining({ object_id: "object-2" })],
      new_conflict_object_ids: ["object-2"],
    });
  });

  it("negeert gebouwtoewijzingen van inactieve en gearchiveerde objecten bij conflictcontrole", async () => {
    const inactive = surveillanceObject({ id: "object-inactive", status: "inactive" });
    const archived = surveillanceObject({ id: "object-archived", status: "archived" });
    const { base44, state } = mockCustomerPlatform({}, [inactive, archived]);
    await expect(customerBackend.buildingAssignmentConflicts(
      base44,
      state(),
      ["bag-building-1"],
    )).resolves.toEqual([]);
  });

  it("weigert gearchiveerde objecten, een verkeerde klantscope en gelijktijdige CAS-wijzigingen", async () => {
    const archived = mockCustomerPlatform({ status: "archived" });
    await expect(customerBackend.handleUpdateObjectMapConfiguration(
      archived.base44,
      { id: "admin-1" },
      {
        customer_id: "customer-1",
        object_id: "object-1",
        data: { building_selection_mode: "manual", selected_bag_feature_ids: [] },
      },
      3,
      "map-archived",
      "fingerprint-archived",
      "update_object_map_configuration|customer_id:customer-1|object_id:object-1",
    )).rejects.toMatchObject({ status: 409 });

    const wrongScope = mockCustomerPlatform({ customer_id: "customer-2" });
    await expect(customerBackend.handleGetObjectMapConfiguration(wrongScope.base44, {
      customer_id: "customer-1",
      object_id: "object-1",
    })).rejects.toMatchObject({ status: 409 });

    const raced = mockCustomerPlatform({}, [], { forceCasConflict: true });
    vi.stubGlobal("fetch", vi.fn());
    await expect(customerBackend.handleUpdateObjectMapConfiguration(
      raced.base44,
      { id: "admin-1" },
      {
        customer_id: "customer-1",
        object_id: "object-1",
        data: { building_selection_mode: "manual", selected_bag_feature_ids: ["bag-building-1"] },
      },
      3,
      "map-cas-conflict",
      "fingerprint-cas-conflict",
      "update_object_map_configuration|customer_id:customer-1|object_id:object-1",
    )).rejects.toMatchObject({
      status: 409,
      details: expect.objectContaining({ code: "object_map_version_conflict", retryable: true }),
    });
  });

  it("serialiseert kaarttoewijzingen met een globale mutatielock", async () => {
    const locked = mockCustomerPlatform({}, [], {
      customerOverrides: {
        object_code_mutation_lock: {
          owner_token: "ander-proces",
          key_hash: "ander-verzoek",
          actor_id: "admin-2",
          mutation_target: "ander-object",
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        },
      },
    });
    await expect(customerBackend.handleUpdateObjectMapConfiguration(
      locked.base44,
      { id: "admin-1" },
      {
        customer_id: "customer-1",
        object_id: "object-1",
        data: { building_selection_mode: "manual", selected_bag_feature_ids: ["bag-building-1"] },
      },
      3,
      "map-locked",
      "fingerprint-map-locked",
      "update_object_map_configuration|customer_id:customer-1|object_id:object-1",
    )).rejects.toMatchObject({
      status: 409,
      details: expect.objectContaining({ retryable: true }),
    });
    expect(locked.surveillanceEntity.updateMany).not.toHaveBeenCalled();
  });

  it("controleert overlappende gebouwtoewijzingen opnieuw bij objectactivatie onder de globale lock", async () => {
    const other = surveillanceObject({
      id: "object-2",
      customer_id: "customer-2",
      object_code: "OBJ-002",
      name: "Actieve buurhuurder",
      version: 1,
    });
    const setup = mockCustomerPlatform({
      status: "inactive",
      is_active_customer_object: false,
      show_on_mobile_map: false,
    }, [other]);

    const activationConflict = await rejectedError(customerBackend.handleSetCustomerObjectStatus(
      setup.base44,
      { id: "admin-1" },
      {
        customer_id: "customer-1",
        object_id: "object-1",
        status: "active",
      },
      3,
      "activate-overlap-1",
      "fingerprint-activate-overlap-1",
      "set_customer_object_status|customer_id:customer-1|object_id:object-1",
    ));
    expect(activationConflict).toMatchObject({
      status: 409,
      details: expect.objectContaining({
        code: "building_assignment_overlap_confirmation_required",
        confirmation_required: true,
        conflict_fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    });
    expect(setup.state().status).toBe("inactive");

    const result = await customerBackend.handleSetCustomerObjectStatus(
      setup.base44,
      { id: "admin-1" },
      {
        customer_id: "customer-1",
        object_id: "object-1",
        status: "active",
        overlap_confirmation: {
          confirmed: true,
          reason: "Twee huurders delen bewust hetzelfde bedrijfsgebouw",
          conflict_fingerprint: activationConflict.details.conflict_fingerprint,
        },
      },
      3,
      "activate-overlap-2",
      "fingerprint-activate-overlap-2",
      "set_customer_object_status|customer_id:customer-1|object_id:object-1",
    );
    expect(setup.state()).toMatchObject({ status: "active", is_active_customer_object: true });
    expect(result.overlap_confirmation).toMatchObject({
      confirmed: true,
      conflict_count: 1,
      conflict_fingerprint: activationConflict.details.conflict_fingerprint,
    });
    expect(JSON.stringify(result)).not.toContain("coordinates");
    expect(JSON.stringify(setup.state().customer_platform_last_mutation_recovery)).not.toContain("coordinates");
  });

  it("controleert een mobiele-kaartinschakeling op overlap en blokkeert reviewplichtige activatie", async () => {
    const other = surveillanceObject({
      id: "object-2",
      customer_id: "customer-2",
      object_code: "OBJ-002",
      name: "Andere huurder",
      version: 1,
    });
    const setup = mockCustomerPlatform({ show_on_mobile_map: false }, [other]);
    const request = {
      customer_id: "customer-1",
      object_id: "object-1",
      data: { show_on_mobile_map: true },
    };
    const mobileConflict = await rejectedError(customerBackend.handleUpdateCustomerObjectOperations(
      setup.base44,
      { id: "admin-1" },
      request,
      3,
      "mobile-overlap-1",
      "fingerprint-mobile-overlap-1",
      "update_customer_object_operations|customer_id:customer-1|object_id:object-1",
    ));
    expect(mobileConflict).toMatchObject({
      status: 409,
      details: expect.objectContaining({
        code: "building_assignment_overlap_confirmation_required",
        conflict_fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    });
    expect(setup.state().show_on_mobile_map).toBe(false);

    const confirmed = await customerBackend.handleUpdateCustomerObjectOperations(
      setup.base44,
      { id: "admin-1" },
      {
        ...request,
        data: {
          show_on_mobile_map: true,
          overlap_confirmation: {
            confirmed: true,
            reason: "Bewust gedeelde centrale entree",
            conflict_fingerprint: mobileConflict.details.conflict_fingerprint,
          },
        },
      },
      3,
      "mobile-overlap-2",
      "fingerprint-mobile-overlap-2",
      "update_customer_object_operations|customer_id:customer-1|object_id:object-1",
    );
    expect(setup.state().show_on_mobile_map).toBe(true);
    expect(confirmed.overlap_confirmation).toMatchObject({
      confirmed: true,
      conflict_count: 1,
      conflict_fingerprint: mobileConflict.details.conflict_fingerprint,
    });

    const review = mockCustomerPlatform({
      status: "inactive",
      is_active_customer_object: false,
      show_on_mobile_map: false,
      map_geometry_status: "needs_review",
    });
    await expect(customerBackend.handleSetCustomerObjectStatus(
      review.base44,
      { id: "admin-1" },
      { customer_id: "customer-1", object_id: "object-1", status: "active" },
      3,
      "activate-review",
      "fingerprint-activate-review",
      "set_customer_object_status|customer_id:customer-1|object_id:object-1",
    )).rejects.toMatchObject({
      status: 409,
      details: expect.objectContaining({ code: "object_map_geometry_review_required" }),
    });
    expect(review.state().status).toBe("inactive");
  });

  it("vereist ook bij kaartconfiguratie bevestiging wanneer bestaande overlappende geometrie mobiel wordt aangezet", async () => {
    const other = surveillanceObject({
      id: "object-2",
      customer_id: "customer-2",
      object_code: "OBJ-002",
      name: "Andere huurder",
      version: 1,
    });
    const setup = mockCustomerPlatform({ show_on_mobile_map: false }, [other]);
    vi.stubGlobal("fetch", vi.fn());
    const body = {
      customer_id: "customer-1",
      object_id: "object-1",
      data: {
        building_selection_mode: "manual",
        selected_bag_feature_ids: ["bag-building-1"],
        show_on_mobile_map: true,
      },
    };
    const mapConflict = await rejectedError(customerBackend.handleUpdateObjectMapConfiguration(
      setup.base44,
      { id: "admin-1" },
      body,
      3,
      "map-enable-overlap-1",
      "fingerprint-map-enable-overlap-1",
      "update_object_map_configuration|customer_id:customer-1|object_id:object-1",
    ));
    expect(mapConflict).toMatchObject({
      status: 409,
      details: expect.objectContaining({
        code: "building_assignment_overlap_confirmation_required",
        conflict_fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    });
    expect(setup.state().show_on_mobile_map).toBe(false);
  });
});

describe("Mobiele kaartpayload", () => {
  it("gebruikt de paarvalidatie ook bij het aanmaken van route-uitvoeringen en taken", () => {
    const start = mobileSource.indexOf("async function handleCreateMobileRouteExecution");
    const end = mobileSource.indexOf("// base44/functions/_shared/mobile/mobileMe.ts", start);
    const createExecutionSource = mobileSource.slice(start, end);

    expect(createExecutionSource).toContain("const startCoordinates = mobileMapCoordinatePair(startOffice?.latitude, startOffice?.longitude)");
    expect(createExecutionSource).toContain("const endCoordinates = mobileMapCoordinatePair(endOffice?.latitude, endOffice?.longitude)");
    expect(createExecutionSource).toContain("...mobileMapCoordinatePair(object.latitude, object.longitude)");
    expect(createExecutionSource).toContain("const invalidTaskCoordinates = assignedTaskCoordinates.filter");
    expect(createExecutionSource).toContain("const { latitude, longitude } = assignedTaskCoordinates[assignmentIndex]");
    expect(createExecutionSource.indexOf("if (invalidTaskCoordinates.length)")).toBeLessThan(
      createExecutionSource.indexOf("RouteExecution.create"),
    );
    expect(createExecutionSource).not.toContain("start_latitude: safeNumber(");
    expect(createExecutionSource).not.toContain("end_latitude: safeNumber(");
  });

  it("normaliseert ontbrekende en exact 0,0 mobiele coördinaten zonder een enkele nul af te keuren", () => {
    [null, undefined, "", " ", false, [], {}].forEach(value => {
      expect(mobileBackend.safeNumber2(value)).toBeNull();
    });
    expect(mobileBackend.safeNumber2(0)).toBe(0);
    expect(mobileBackend.mobileMapCoordinatePair(0, 0)).toEqual({ latitude: null, longitude: null });
    expect(mobileBackend.mobileMapCoordinatePair("0", "0.0")).toEqual({ latitude: null, longitude: null });
    expect(mobileBackend.mobileMapCoordinatePair(null, 4.3)).toEqual({ latitude: null, longitude: null });
    expect(mobileBackend.mobileMapCoordinatePair(52.1, " ")).toEqual({ latitude: null, longitude: null });
    expect(mobileBackend.mobileMapCoordinatePair(91, 4.3)).toEqual({ latitude: null, longitude: null });
    expect(mobileBackend.mobileMapCoordinatePair(52.1, 181)).toEqual({ latitude: null, longitude: null });
    expect(mobileBackend.mobileMapCoordinatePair(0, 4.3)).toEqual({ latitude: 0, longitude: 4.3 });
    expect(mobileBackend.mobileMapCoordinatePair(52.1, 0)).toEqual({ latitude: 52.1, longitude: 0 });

    const stateAtNullIsland = mobileBackend.mobileSafeMapState(surveillanceObject({
      latitude: 0,
      longitude: 0,
      building_polygon_geojson: {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [[[0, 0], [0.0001, 0], [0.0001, 0.0001], [0, 0.0001], [0, 0]]],
          },
        }],
      },
    }));
    expect(stateAtNullIsland).toMatchObject({
      building_polygon_geojson: null,
      map_geometry_status: "needs_review",
      invalid: true,
    });
  });

  it("houdt legacyobjecten compatibel en neemt de kaartrevisie veilig over", () => {
    expect(mobileBackend.mobileBuildingSelectionMode({ building_polygon_geojson: null })).toBe("automatic");
    expect(mobileBackend.mobileBuildingSelectionMode({
      building_selection_mode: "automatic",
      building_polygon_geojson: { type: "FeatureCollection", features: [storedBagFeature()] },
    })).toBe("manual");
    expect(mobileBackend.mobileMapGeometryStatus({ map_geometry_status: "unconfigured", building_polygon_geojson: { type: "FeatureCollection", features: [storedBagFeature()] } })).toBe("configured");
    expect(mobileBackend.mobileMapGeometryStatus({ object_area_geojson: null })).toBe("unconfigured");
    expect(mobileBackend.mobileMapGeometryRevision({ map_geometry_revision: "7" })).toBe(7);
  });

  it("stuurt terrein alleen mee voor objecten in de actuele route", async () => {
    const routeObject = surveillanceObject({ id: "object-route", object_area_geojson: { type: "FeatureCollection", features: [storedBagFeature("area-1")] } });
    const unrelatedObject = surveillanceObject({ id: "object-unrelated", object_area_geojson: { type: "FeatureCollection", features: [storedBagFeature("area-2")] } });
    const manualEmptyObject = surveillanceObject({
      id: "object-manual-empty",
      building_selection_mode: "manual",
      building_polygon_geojson: null,
      map_geometry_revision: 4,
    });
    const reviewObject = surveillanceObject({ id: "object-review", map_geometry_status: "needs_review" });
    const objectWithoutLocation = surveillanceObject({
      id: "object-zonder-locatie",
      latitude: null,
      longitude: " ",
      building_selection_mode: "automatic",
      building_polygon_geojson: null,
      object_area_geojson: null,
      map_geometry_status: "unconfigured",
    });
    const zeroCoordinateRouteObject = surveillanceObject({
      id: "object-zero-route",
      latitude: 0,
      longitude: 0,
      building_selection_mode: "automatic",
      building_polygon_geojson: null,
      object_area_geojson: null,
      map_geometry_status: "unconfigured",
    });
    const singleZeroObject = surveillanceObject({
      id: "object-single-zero",
      latitude: 0,
      longitude: 4.3,
      building_selection_mode: "automatic",
      building_polygon_geojson: null,
      object_area_geojson: null,
      map_geometry_status: "unconfigured",
    });
    const entities = {
      TaskExecution: { filter: vi.fn(async () => [
        { id: "task-1", object_id: "object-route", status: "pending", sequence_index: 1 },
        { id: "task-2", object_id: "object-manual-empty", status: "pending", sequence_index: 2 },
        { id: "task-3", object_id: "object-review", status: "pending", sequence_index: 3 },
        { id: "task-4", object_id: "object-zero-route", status: "pending", sequence_index: 4, latitude: 0, longitude: 0 },
      ]) },
      SurveillanceObject: { list: vi.fn(async () => [routeObject, unrelatedObject, manualEmptyObject, reviewObject, objectWithoutLocation, zeroCoordinateRouteObject, singleZeroObject]) },
      ReportTemplate: { list: vi.fn(async () => []) },
      Vehicle: { list: vi.fn(async () => []) },
      Personnel: { list: vi.fn(async () => []) },
      ObjectFloorPlan: { filter: vi.fn(async () => []) },
    };
    const result = await mobileBackend.buildPackage(
      { asServiceRole: { entities } },
      { id: "route-1", employee_id: "employee-1" },
    );
    const byId = new Map(result.objects_on_map.map(object => [object.object_id, object]));

    expect(byId.get("object-route").object_area_geojson).not.toBeNull();
    expect(byId.get("object-unrelated").object_area_geojson).toBeNull();
    expect(byId.get("object-manual-empty")).toMatchObject({
      building_selection_mode: "manual",
      building_polygon_geojson: null,
      map_geometry_revision: 4,
    });
    expect(byId.has("object-review")).toBe(false);
    expect(byId.has("object-zonder-locatie")).toBe(false);
    expect(byId.get("object-zero-route")).toMatchObject({ latitude: null, longitude: null, has_task_in_current_route: true });
    expect(byId.get("object-single-zero")).toMatchObject({ latitude: 0, longitude: 4.3 });
    expect(result.stops.find(stop => stop.object_id === "object-zero-route")).toMatchObject({ latitude: null, longitude: null });
    expect(byId.get("object-route")).toMatchObject({
      building_selection_mode: "manual",
      map_geometry_status: "configured",
      map_geometry_revision: 2,
    });
  });

  it("autoriseert mobiele routes fail-closed via de gekoppelde actieve medewerker", async () => {
    const personnelFilter = vi.fn(async () => [{ id: "employee-1", status: "active" }]);
    const routeFilter = vi.fn(async () => [{ id: "route-1", employee_id: "employee-2" }]);
    const base44 = {
      asServiceRole: {
        entities: {
          Personnel: { filter: personnelFilter },
          RouteExecution: { filter: routeFilter },
        },
      },
    };
    const user = { id: "user-1", role: "employee" };
    await expect(mobileBackend.requireAuthorizedMobileRoute(base44, user, "route-1")).rejects.toMatchObject({
      status: 403,
      code: "mobile_route_forbidden",
    });
    expect(personnelFilter).toHaveBeenCalledWith({ linked_user_id: "user-1" });
    expect(routeFilter).toHaveBeenCalledWith({ id: "route-1" });

    personnelFilter.mockResolvedValueOnce([]);
    routeFilter.mockClear();
    await expect(mobileBackend.requireAuthorizedMobileRoute(base44, user, "route-1")).rejects.toMatchObject({
      status: 403,
      code: "mobile_personnel_link_required",
    });
    expect(routeFilter).not.toHaveBeenCalled();

    personnelFilter.mockResolvedValueOnce([{ id: "employee-1", status: "onboarding" }]);
    await expect(mobileBackend.requireMobilePersonnel(base44, user)).rejects.toMatchObject({
      status: 403,
      code: "mobile_personnel_inactive",
    });

    const privileged = await mobileBackend.requireAuthorizedMobileRoute(
      base44,
      { id: "admin-1", role: "admin" },
      "route-1",
    );
    expect(privileged.route.id).toBe("route-1");
  });

  it("autoriseert elke mobiele routeactie vóór taakreads en routemutaties", async () => {
    const personnelFilter = vi.fn(async () => [{ id: "employee-1", status: "active" }]);
    const routeFilter = vi.fn(async () => [{ id: "route-1", employee_id: "employee-2", status: "planned" }]);
    const routeUpdate = vi.fn(async (_id, patch) => ({ id: "route-1", ...patch }));
    const taskFilter = vi.fn(async () => []);
    const auditCreate = vi.fn(async value => value);
    const base44 = {
      asServiceRole: {
        entities: {
          Personnel: { filter: personnelFilter },
          RouteExecution: { filter: routeFilter, update: routeUpdate },
          TaskExecution: { filter: taskFilter },
          MobileAuditLog: { create: auditCreate },
        },
      },
    };
    const user = { id: "user-1", role: "employee" };

    await expect(mobileBackend.executeMobileRouteAction(base44, user, {
      route_execution_id: "route-1",
      action: "start",
    })).rejects.toMatchObject({ status: 403, code: "mobile_route_forbidden" });
    expect(personnelFilter.mock.invocationCallOrder[0]).toBeLessThan(routeFilter.mock.invocationCallOrder[0]);
    expect(taskFilter).not.toHaveBeenCalled();
    expect(routeUpdate).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();

    routeFilter.mockResolvedValueOnce([{ id: "route-1", employee_id: "employee-1", status: "active" }]);
    taskFilter.mockResolvedValueOnce([{ id: "task-1", status: "pending" }]);
    await expect(mobileBackend.executeMobileRouteAction(base44, user, {
      route_execution_id: "route-1",
      action: "complete",
    })).rejects.toMatchObject({ status: 409, open_task_count: 1 });
    expect(taskFilter).toHaveBeenCalledWith({ route_execution_id: "route-1" });
    expect(routeUpdate).not.toHaveBeenCalled();

    routeFilter.mockResolvedValueOnce([{ id: "route-1", employee_id: "employee-1", status: "planned" }]);
    const success = await mobileBackend.executeMobileRouteAction(base44, user, {
      route_execution_id: "route-1",
      action: "downloaded",
    });
    expect(success.route_execution).toMatchObject({ id: "route-1", status: "downloaded" });
    expect(routeUpdate).toHaveBeenCalledWith("route-1", expect.objectContaining({ status: "downloaded" }));
    expect(auditCreate).toHaveBeenCalledTimes(1);
  });

  it("levert alleen gecanonicaliseerde mobiele geometrie en sluit ongeldige opslag uit", async () => {
    const valid = storedBagFeature("safe-building");
    valid.properties.onveilig = "niet uitleveren";
    const validState = mobileBackend.mobileSafeMapState(surveillanceObject({
      building_polygon_geojson: { type: "FeatureCollection", features: [valid] },
    }));
    expect(validState.map_geometry_status).toBe("configured");
    expect(validState.building_polygon_geojson.features[0].properties).not.toHaveProperty("onveilig");

    const invalid = storedBagFeature("open-building");
    invalid.geometry.coordinates[0].pop();
    expect(mobileBackend.mobileSafeMapState(surveillanceObject({
      building_polygon_geojson: { type: "FeatureCollection", features: [invalid] },
    }))).toMatchObject({
      building_polygon_geojson: null,
      map_geometry_status: "needs_review",
      invalid: true,
    });

    const holeOutside = storedBagFeature("hole-outside");
    holeOutside.geometry.coordinates.push([
      [4.3020, 52.1020],
      [4.3022, 52.1020],
      [4.3022, 52.1022],
      [4.3020, 52.1022],
      [4.3020, 52.1020],
    ]);
    expect(mobileBackend.mobileSafeMapState(surveillanceObject({
      building_polygon_geojson: { type: "FeatureCollection", features: [holeOutside] },
    })).map_geometry_status).toBe("needs_review");

    const manualEmpty = mobileBackend.mobileSafeMapState(surveillanceObject({
      building_selection_mode: "manual",
      building_polygon_geojson: { type: "FeatureCollection", features: [] },
    }));
    expect(manualEmpty).toMatchObject({
      building_selection_mode: "manual",
      building_polygon_geojson: null,
      map_geometry_status: "configured",
      invalid: false,
    });
  });
});
