import { describe, expect, it, vi } from "vitest";
import {
  getObjectMapConfiguration,
  listObjectBuildingCandidates,
  listObjectParcelCandidates,
  normalizeObjectMapCandidates,
  normalizeObjectMapConfiguration,
  shouldRetryObjectParcelCandidates,
  updateObjectMapConfiguration,
} from "../../src/components/objects/objectMapWorkflow";

const polygon = {
  type: "Polygon",
  coordinates: [[[4.48, 51.92], [4.481, 51.92], [4.481, 51.921], [4.48, 51.92]]],
};

describe("objectkaart API-workflow", () => {
  it("geeft gebouwnamen mee en behoudt ze bij herladen zonder oude callers te overschrijven", async () => {
    const labels = { "bag:bag-1": "Receptie", "point:point-1": "Magazijn" };
    const invoke = vi.fn(async payload => ({ configuration: { version: 8, ...payload.data } }));
    const result = await updateObjectMapConfiguration({ customerId: "customer-1", objectId: "object-1", expectedVersion: 7, idempotencyKey: "names-key", data: { building_selection_mode: "manual", selected_bag_feature_ids: ["bag-1"], building_labels: labels }, invoke });
    expect(invoke.mock.calls[0][0].data.building_labels).toEqual(labels);
    expect(result.building_labels).toEqual(labels);
    await updateObjectMapConfiguration({ customerId: "customer-1", objectId: "object-1", expectedVersion: 8, idempotencyKey: "old-client-key", data: { building_selection_mode: "manual", selected_bag_feature_ids: ["bag-1"] }, invoke });
    expect(invoke.mock.calls[1][0].data).not.toHaveProperty("building_labels");
    expect(normalizeObjectMapConfiguration({ configuration: { building_labels: null } }).building_labels).toEqual({});
  });
  it.each([
    [{ code: "pdok_parcel_unavailable", reason: "http", retryable: false }, /beschikbare verbindingen/],
    [{ code: "pdok_parcel_invalid_response" }, /PDOK.*geen bruikbaar antwoord/],
    [null, /objectgegevens of perceelgrenzen/],
  ])("maakt een perceelfout leesbaar en behoudt status en referentie (%#)", async (details, message) => {
    const original = Object.assign(new Error("Klantplatformactie mislukt"), { status: 503, requestId: "request-1", details, action: "list_object_parcel_candidates" });
    const invoke = vi.fn().mockRejectedValue(original);
    await expect(listObjectParcelCandidates({ customerId: "customer-1", objectId: "object-1", invoke })).rejects.toMatchObject({ message: expect.stringMatching(message), status: 503, requestId: "request-1", details });
    expect(invoke).toHaveBeenCalledOnce();
    expect(original.message).toBe("Klantplatformactie mislukt");
  });

  const scopedConfiguration = {
    configuration: { object_id: "object-1", customer_id: "customer-1", version: 3,
      object: { id: "object-1", customer_id: "customer-1", longitude: 4.48, latitude: 51.92, geocoding_status: "verified" },
    },
  };
  const transportError = Object.assign(new Error("Klantplatformactie mislukt"), {
    status: 503, requestId: "server-reference", details: { code: "pdok_parcel_unavailable", reason: "network", attempts: 2 },
  });

  it("haalt bij een serververbindingsfout publieke percelen op na een verse scopecontrole", async () => {
    const invoke = vi.fn().mockRejectedValueOnce(transportError).mockResolvedValueOnce(scopedConfiguration);
    const fetchDirect = vi.fn().mockResolvedValue({ candidates: { type: "FeatureCollection", features: [{ type: "Feature", id: "parcel", properties: { source: "pdok_brk" }, geometry: polygon }] }, center: { longitude: 4.48, latitude: 51.92 }, next_cursor: "page-2" });
    const result = await listObjectParcelCandidates({ customerId: "customer-1", objectId: "object-1", invoke, fetchDirect });
    expect(invoke.mock.calls.map(([p]) => p.action)).toEqual(["list_object_parcel_candidates", "get_object_map_configuration"]);
    expect(fetchDirect).toHaveBeenCalledWith({ object: scopedConfiguration.configuration.object, radiusMeters: 1_000, limit: 100, cursor: null });
    expect(result).toMatchObject({ transport: "browser", next_cursor: "page-2", items: [expect.objectContaining({ id: "parcel" })] });
  });

  it("laadt vervolgpagina's via dezelfde verbinding, maar controleert opnieuw de scope", async () => {
    const invoke = vi.fn().mockResolvedValue(scopedConfiguration);
    const fetchDirect = vi.fn().mockResolvedValue({ candidates: { type: "FeatureCollection", features: [] } });
    await listObjectParcelCandidates({ customerId: "customer-1", objectId: "object-1", cursor: "page-2", transport: "browser", expectedCenter: { longitude: 4.48, latitude: 51.92 }, invoke, fetchDirect });
    expect(invoke).toHaveBeenCalledExactlyOnceWith({ action: "get_object_map_configuration", customer_id: "customer-1", object_id: "object-1" });
    expect(fetchDirect).toHaveBeenCalledWith(expect.objectContaining({ cursor: "page-2" }));
  });

  it("gebruikt geen browserfallback voor scope-, platform- of ongeldige bronfouten", async () => {
    for (const error of [
      Object.assign(new Error("Geen toegang"), { status: 403 }),
      Object.assign(new Error("Platformstoring"), { status: 503 }),
      Object.assign(new Error("Onbekende actie"), { status: 400 }),
      Object.assign(new Error("Ongeldig antwoord"), { status: 503, details: { code: "pdok_parcel_invalid_response" } }),
    ]) {
      const invoke = vi.fn().mockRejectedValue(error);
      const fetchDirect = vi.fn();
      await expect(listObjectParcelCandidates({ customerId: "customer-1", objectId: "object-1", invoke, fetchDirect })).rejects.toMatchObject({ status: error.status });
      expect(invoke).toHaveBeenCalledOnce();
      expect(fetchDirect).not.toHaveBeenCalled();
    }
  });

  it("stopt bij ingetrokken toegang of een andere objectscope zonder PDOK te benaderen", async () => {
    const denied = Object.assign(new Error("Geen toegang"), { status: 403 });
    const fetchDirect = vi.fn();
    const invoke = vi.fn().mockRejectedValueOnce(transportError).mockRejectedValueOnce(denied);
    await expect(listObjectParcelCandidates({ customerId: "customer-1", objectId: "object-1", invoke, fetchDirect })).rejects.toBe(denied);
    const wrongScope = { configuration: { ...scopedConfiguration.configuration, customer_id: "customer-2" } };
    await expect(listObjectParcelCandidates({ customerId: "customer-1", objectId: "object-1", transport: "browser", invoke: vi.fn().mockResolvedValue(wrongScope), fetchDirect })).rejects.toMatchObject({ status: 409 });
    expect(fetchDirect).not.toHaveBeenCalled();
  });

  it("mengt geen perceelpagina's wanneer het objectadres ondertussen veranderd is", async () => {
    const fetchDirect = vi.fn();
    await expect(listObjectParcelCandidates({ customerId: "customer-1", objectId: "object-1", transport: "browser", cursor: "page-2", expectedCenter: { longitude: 6.07, latitude: 52.45 }, invoke: vi.fn().mockResolvedValue(scopedConfiguration), fetchDirect })).rejects.toMatchObject({ status: 409, details: { code: "object_map_anchor_changed" } });
    expect(fetchDirect).not.toHaveBeenCalled();
    await expect(listObjectParcelCandidates({ customerId: "customer-1", objectId: "object-1", cursor: "server-page-2", expectedCenter: { longitude: 6.07, latitude: 52.45 }, invoke: vi.fn().mockResolvedValue({ items: [], center: { longitude: 4.48, latitude: 51.92 } }), fetchDirect })).rejects.toMatchObject({ status: 409, details: { code: "object_map_anchor_changed" } });
    expect(fetchDirect).not.toHaveBeenCalled();
  });

  it("bewaart bij dubbele verbindingsuitval alleen veilige diagnostiek en de serverreferentie", async () => {
    const invoke = vi.fn().mockRejectedValueOnce(transportError).mockResolvedValueOnce(scopedConfiguration);
    const fetchDirect = vi.fn().mockRejectedValue(Object.assign(new Error("Verbinding mislukt"), { status: 503, details: { code: "pdok_parcel_unavailable", reason: "network", retryable: false } }));
    let failure;
    try { await listObjectParcelCandidates({ customerId: "customer-1", objectId: "object-1", invoke, fetchDirect }); } catch (error) { failure = error; }
    expect(failure).toMatchObject({ status: 503, requestId: "server-reference", message: expect.stringMatching(/beschikbare verbindingen/) });
    expect(shouldRetryObjectParcelCandidates(0, failure)).toBe(false);
    expect(JSON.stringify(failure)).not.toMatch(/longitude|latitude|bbox|coordinates|https:/);
  });

  it("laat scope-, autorisatie- en publicatiefouten intact", async () => {
    for (const status of [400, 401, 403, 409]) {
      const original = Object.assign(new Error("Controleer eerst het object"), { status, requestId: "request-scope" });
      await expect(listObjectParcelCandidates({ customerId: "customer-1", objectId: "object-1", invoke: vi.fn().mockRejectedValue(original) })).rejects.toBe(original);
    }
  });

  it("herhaalt alleen tijdelijke fouten die niet al door de server zijn herhaald", () => {
    for (const status of [null, 408, 429, 500, 503, 504]) {
      expect(shouldRetryObjectParcelCandidates(0, { status })).toBe(true);
      expect(shouldRetryObjectParcelCandidates(1, { status })).toBe(false);
    }
    for (const status of [400, 401, 403, 404, 409]) expect(shouldRetryObjectParcelCandidates(0, { status })).toBe(false);
    expect(shouldRetryObjectParcelCandidates(0, { status: 503, details: { attempts: 2 } })).toBe(false);
    expect(shouldRetryObjectParcelCandidates(0, { status: 503, details: { code: "pdok_parcel_invalid_response" } })).toBe(false);
    expect(shouldRetryObjectParcelCandidates(0, { status: 503, details: { retryable: false } })).toBe(false);
  });

  it("vraagt kadastrale percelen op binnen dezelfde objectscope en bewaart herkomst", async () => {
    const invoke = vi.fn(async () => ({ candidates: { type: "FeatureCollection", features: [{ type: "Feature", id: "parcel-1", properties: { source: "pdok_brk", label: "Apeldoorn A 12" }, geometry: polygon }] }, source: { name: "PDOK Kadastrale kaart" }, next_cursor: "next-page" }));
    const result = await listObjectParcelCandidates({ customerId: "customer-1", objectId: "object-1", radiusMeters: 5_000, limit: 500, cursor: "page-1", invoke });
    expect(invoke).toHaveBeenCalledWith({ action: "list_object_parcel_candidates", customer_id: "customer-1", object_id: "object-1", radius_meters: 1_000, limit: 100, cursor: "page-1" });
    expect(result.items[0].properties).toMatchObject({ source: "pdok_brk", label: "Apeldoorn A 12" });
    expect(result.next_cursor).toBe("next-page");
  });

  it("bewaart uitsluitend de eigen klikselectie en geen Mapbox featuremetadata", async () => {
    const point = { id: "own-point-1", source: "user_selected", provider: "mapbox", bag_status: "unlinked", longitude: 4.48, latitude: 51.92 };
    const invoke = vi.fn(async payload => ({ configuration: { version: 8, ...payload.data } }));
    const result = await updateObjectMapConfiguration({ customerId: "customer-1", objectId: "object-1", expectedVersion: 7, idempotencyKey: "points-key", data: { building_selection_mode: "manual", building_selection_points: [{ ...point, feature_id: 123, geometry: polygon }] }, invoke });
    expect(invoke.mock.calls[0][0].data.building_selection_points).toEqual([point]);
    expect(result.building_selection_points).toEqual([point]);
    await updateObjectMapConfiguration({ customerId: "customer-1", objectId: "object-1", expectedVersion: 8, idempotencyKey: "automatic-key", data: { building_selection_mode: "automatic", building_selection_points: [point] }, invoke });
    expect(invoke.mock.calls[1][0].data.building_selection_points).toEqual([]);
  });
  it("vraagt de kaartconfiguratie op binnen klant- en objectscope", async () => {
    const invoke = vi.fn(async () => ({ configuration: { version: 3 } }));
    const result = await getObjectMapConfiguration({ customerId: "customer-1", objectId: "object-1", invoke });

    expect(invoke).toHaveBeenCalledWith({ action: "get_object_map_configuration", customer_id: "customer-1", object_id: "object-1" });
    expect(result.expected_version).toBe(3);
  });

  it("normaliseert het backendcontract en behoudt de objectversie", () => {
    const result = normalizeObjectMapConfiguration({
      configuration: {
        object_id: "object-1",
        customer_id: "customer-1",
        version: 7,
        building_selection_mode: "manual",
        map_geometry_status: "configured",
        map_geometry_revision: 3,
        selected_bag_feature_ids: ["bag-1"],
        building_polygon_geojson: { type: "FeatureCollection", features: [{ type: "Feature", id: "bag-1", properties: { source: "pdok_bag", source_feature_id: "bag-1" }, geometry: polygon }] },
        object_area_geojson: null,
      },
      conflicts: [],
    });

    expect(result.expected_version).toBe(7);
    expect(result.building_selection_mode).toBe("manual");
    expect(result.selected_bag_feature_ids).toEqual(["bag-1"]);
    expect(result.building_polygon_geojson.features).toHaveLength(1);
    expect(result.object_area_geojson.features).toEqual([]);
  });

  it("koppelt conflictinformatie uit de aparte kandidatenlijst aan het BAG-pand", () => {
    const result = normalizeObjectMapCandidates({
      items: [{ type: "Feature", id: "bag-1", properties: { source_feature_id: "bag-1", identificatie: "012345" }, geometry: polygon }],
      conflicts: [{ source_feature_id: "bag-1", objects: [{ object_id: "other-1", object_name: "Andere huurder" }] }],
      source: { name: "PDOK BAG", retrieved_at: "2026-09-06T09:00:00Z" },
    });

    expect(result.items[0].properties.conflict_count).toBe(1);
    expect(result.items[0].properties.conflicts[0].object_name).toBe("Andere huurder");
    expect(result.source_retrieved_at).toBe("2026-09-06T09:00:00Z");
  });

  it("begrensd kandidaatvragen volgens het servercontract", async () => {
    const invoke = vi.fn(async () => ({ items: [] }));
    await listObjectBuildingCandidates({ customerId: "customer-1", objectId: "object-1", radiusMeters: 5000, limit: 900, invoke });

    expect(invoke).toHaveBeenCalledWith({
      action: "list_object_building_candidates",
      customer_id: "customer-1",
      object_id: "object-1",
      radius_meters: 500,
      limit: 100,
    });
  });

  it("normaliseert en vervolgt kandidaatpagina's met een opaque cursor", async () => {
    const normalized = normalizeObjectMapCandidates({
      items: [{ type: "Feature", id: "bag-1", properties: { source_feature_id: "bag-1" }, geometry: polygon }],
      cursor: "current-token",
      next_cursor: "next-token",
      has_more: true,
    });
    expect(normalized).toMatchObject({ cursor: "current-token", next_cursor: "next-token", has_more: true });

    const invoke = vi.fn(async () => ({ items: [], cursor: "next-token" }));
    await listObjectBuildingCandidates({ customerId: "customer-1", objectId: "object-1", cursor: "next-token", invoke });
    expect(invoke).toHaveBeenCalledWith(expect.objectContaining({ cursor: "next-token" }));
  });

  it("stuurt bij automatisch bepalen geen handmatige geometrie en wist een lege terreingrens canoniek", async () => {
    const invoke = vi.fn(async payload => ({ configuration: { version: 8, ...payload.data } }));
    await updateObjectMapConfiguration({
      customerId: "customer-1",
      objectId: "object-1",
      expectedVersion: 7,
      idempotencyKey: "map-key",
      data: {
        building_selection_mode: "automatic",
        selected_bag_feature_ids: ["bag-1"],
        manual_building_geojson: { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: polygon }] },
        object_area_geojson: { type: "FeatureCollection", features: [] },
        show_on_mobile_map: true,
      },
      invoke,
    });

    expect(invoke).toHaveBeenCalledWith(expect.objectContaining({
      action: "update_object_map_configuration",
      expected_version: 7,
      idempotency_key: "map-key",
      data: expect.objectContaining({
        building_selection_mode: "automatic",
        selected_bag_feature_ids: [],
        manual_building_geojson: null,
        object_area_geojson: null,
      }),
    }));
  });

  it("houdt een legacy-object zonder zichtbaarheidveld standaard zichtbaar", async () => {
    const invoke = vi.fn(async payload => ({ configuration: { version: 8, ...payload.data } }));
    await updateObjectMapConfiguration({
      customerId: "customer-1",
      objectId: "object-1",
      expectedVersion: 7,
      idempotencyKey: "map-legacy-key",
      data: {
        building_selection_mode: "automatic",
        selected_bag_feature_ids: [],
        manual_building_geojson: null,
        object_area_geojson: null,
      },
      invoke,
    });

    expect(invoke.mock.calls[0][0].data.show_on_mobile_map).toBe(true);
  });

  it("sorteert handmatige BAG-selecties en geeft de gemotiveerde overlap door", async () => {
    const invoke = vi.fn(async payload => ({ configuration: { version: 8, ...payload.data } }));
    await updateObjectMapConfiguration({
      customerId: "customer-1",
      objectId: "object-1",
      expectedVersion: 7,
      idempotencyKey: "map-key",
      data: {
        building_selection_mode: "manual",
        selected_bag_feature_ids: ["bag-2", "bag-1", "bag-2"],
        manual_building_geojson: null,
        object_area_geojson: null,
        overlap_confirmation: { confirmed: true, reason: "Gedeeld bedrijfsverzamelgebouw", conflict_fingerprint: "c".repeat(64) },
      },
      invoke,
    });

    expect(invoke.mock.calls[0][0].data).toEqual(expect.objectContaining({
      selected_bag_feature_ids: ["bag-1", "bag-2"],
      overlap_confirmation: { confirmed: true, reason: "Gedeeld bedrijfsverzamelgebouw", conflict_fingerprint: "c".repeat(64) },
    }));
  });

  it("weigert een te korte reden voor gedeeld gebruik ook in de API-helper", async () => {
    await expect(updateObjectMapConfiguration({
      customerId: "customer-1",
      objectId: "object-1",
      expectedVersion: 7,
      idempotencyKey: "map-short-reason",
      data: {
        building_selection_mode: "manual",
        selected_bag_feature_ids: ["bag-1"],
        overlap_confirmation: { confirmed: true, reason: "ab", conflict_fingerprint: "d".repeat(64) },
      },
      invoke: vi.fn(),
    })).rejects.toThrow("minimaal 3 tekens");
  });

  it("weigert een overlapbevestiging zonder exacte servervingerafdruk", async () => {
    await expect(updateObjectMapConfiguration({
      customerId: "customer-1",
      objectId: "object-1",
      expectedVersion: 7,
      idempotencyKey: "map-missing-fingerprint",
      data: {
        building_selection_mode: "manual",
        selected_bag_feature_ids: ["bag-1"],
        overlap_confirmation: { confirmed: true, reason: "Gedeeld pand" },
      },
      invoke: vi.fn(),
    })).rejects.toThrow("niet meer actueel");
  });

  it("behoudt een bewuste lege handmatige selectie", async () => {
    const invoke = vi.fn(async payload => ({ configuration: { version: 8, ...payload.data } }));
    await updateObjectMapConfiguration({
      customerId: "customer-1",
      objectId: "object-1",
      expectedVersion: 7,
      idempotencyKey: "map-empty-key",
      data: { building_selection_mode: "manual", selected_bag_feature_ids: [], manual_building_geojson: null, object_area_geojson: null },
      invoke,
    });

    expect(invoke.mock.calls[0][0].data).toEqual(expect.objectContaining({
      building_selection_mode: "manual",
      selected_bag_feature_ids: [],
      manual_building_geojson: { type: "FeatureCollection", features: [] },
    }));
  });
});
