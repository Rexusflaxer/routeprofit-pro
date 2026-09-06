import { describe, expect, it, vi } from "vitest";
import {
  getObjectMapConfiguration,
  listObjectBuildingCandidates,
  normalizeObjectMapCandidates,
  normalizeObjectMapConfiguration,
  updateObjectMapConfiguration,
} from "../../src/components/objects/objectMapWorkflow";

const polygon = {
  type: "Polygon",
  coordinates: [[[4.48, 51.92], [4.481, 51.92], [4.481, 51.921], [4.48, 51.92]]],
};

describe("objectkaart API-workflow", () => {
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
